import { useEffect, useMemo, useRef, useState } from 'react'
import type { SetupBodyProps } from '../../common/lib/games'
import { TimerField } from '../../common/components/fields/TimerField'
import { cls } from '../../common/lib/util/cls'
import { db } from '../db'
import type { CrosswordsSetup } from '../lib/setup'
import { GUARDIAN_SERIES } from '../lib/setup'
import { importCrosswordFile } from '../lib/importFile'
import styles from './SetupForm.module.css'
// The game's tokens, again. PlayArea side-effect-imports this too, but the
// setup form is its OWN lazy chunk that renders in the club's start-game
// dialog — long before any PlayArea chunk loads. Without this import the
// crossword tokens below (row hover, selected row, row rule, the active
// source tab's yellow) are undefined, and `background: var(--undefined)`
// computes to `initial` — so those rules paint nothing at all, silently.
import '../theme.css'

/**
 * Whether the club opening this dialog has played a given puzzle, as
 * `crosswords.library_for_club` tags it. Not per-player and not per-mode —
 * "have WE done this one" is a question about the club, so a puzzle solved
 * cooperatively reads `solved` in the compete dialog too.
 */
type PuzzleStatus = 'solved' | 'playing' | 'lost' | 'unplayed'

/** A library puzzle as the picker sees it — id + the non-spoiler meta. */
type LibraryPuzzle = {
  id: string
  title: string
  author: string
  status: PuzzleStatus
}

/**
 * The club-history stripe down each row's leading edge. Same outcome-color
 * vocabulary the club page uses for a game's own state, so green/yellow/red
 * mean here what they mean there.
 */
const STATUS_CLASS: Record<PuzzleStatus, string> = {
  solved: styles.statusSolved!,
  playing: styles.statusPlaying!,
  lost: styles.statusLost!,
  unplayed: styles.statusUnplayed!,
}

/** The RPC types `status` as plain `text`. Anything the FE doesn't recognise
 *  (a status added server-side first) falls back to the neutral bar rather
 *  than rendering an unstyled row. */
function statusClass(status: string): string {
  return STATUS_CLASS[status as PuzzleStatus] ?? STATUS_CLASS.unplayed
}

/** Today as YYYY-MM-DD (the NYT date input's default + max). */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * How far back the NYT date override reaches. NYT's own archive runs to 1993,
 * but a box you can page back thirty years in is a worse tool than a bounded
 * one, and the weekday walk stops here too. Joel's number.
 */
const NYT_EARLIEST = '2015-01-01'

/**
 * The weekday picker's options — 0..6 with Sunday = 0, matching Postgres
 * `dow` and JS `getUTCDay`, because the value goes straight to
 * `crosswords.next_nyt_date_for_club(seen_by, dow)`.
 *
 * The difficulty notes are the whole reason this control exists: an NYT
 * crossword's DAY is its difficulty — Monday easiest, ramping to Saturday,
 * with Sunday a 21×21 that plays around Thursday's level rather than being
 * the hardest. A solver picking "Tuesday" is picking a difficulty, and saying
 * so out loud saves them knowing the convention beforehand.
 */
const WEEKDAYS: Array<{ dow: number; name: string; note: string }> = [
  { dow: 1, name: 'Monday', note: 'easiest' },
  { dow: 2, name: 'Tuesday', note: 'easy' },
  { dow: 3, name: 'Wednesday', note: 'medium' },
  { dow: 4, name: 'Thursday', note: 'medium, usually a twist' },
  { dow: 5, name: 'Friday', note: 'hard' },
  { dow: 6, name: 'Saturday', note: 'hardest' },
  { dow: 0, name: 'Sunday', note: 'big (21×21), medium' },
]

/** Monday when a club has never chosen — the easiest day to start on. */
const DEFAULT_WEEKDAY = 1

function weekdayName(dow: number): string {
  return WEEKDAYS.find((w) => w.dow === dow)?.name ?? 'puzzle'
}

/**
 * The crosswords setup form: pick a puzzle from the curated library, an NYT
 * daily by date, today's Guardian by series, or an uploaded file. The choice
 * is written into `setup` (`source` + `puzzle_id` / `date` / `series` /
 * `board`); library → `create_game` RPC, NYT + Guardian → their import edge
 * functions, upload → the FE-parsed inline board.
 *
 * The library list is club-aware: each row carries a color bar for whether
 * this club has already solved / started / lost that puzzle, which is what
 * makes "find the one we haven't done" a glance rather than a memory test.
 */
export function SetupForm({ clubHandle, players, value, onChange }: SetupBodyProps) {
  const s = value as CrosswordsSetup
  const [puzzles, setPuzzles] = useState<LibraryPuzzle[] | null>(null)
  const [query, setQuery] = useState('')
  // Upload tab state.
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Parse a dropped / chosen .puz / .ipuz file entirely client-side into the
  // inline board, storing it in `setup.board` (start passes it to create_game).
  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploadBusy(true)
    setUploadError(null)
    try {
      const board = await importCrosswordFile(file)
      onChange({ ...s, source: 'upload', board, filename: file.name })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read that file.')
      // Clear any previously-parsed board so Start stays blocked.
      onChange({ ...s, source: 'upload', board: undefined, filename: file.name })
    } finally {
      setUploadBusy(false)
    }
  }

  // One RPC rather than "list the puzzles, then colour them": the join to
  // play_state crosses schemas (crosswords.games → common.games), which
  // PostgREST embeds can't express, and doing it in two reads would paint
  // the rows and then recolour them a beat later. It's also ~200× less over
  // the wire than the `select id, meta` this replaced — `meta` is the whole
  // template (every cell, number, block, circle) and the row shows four
  // scalars off it. Ordering + the source='library' filter live in the RPC.
  useEffect(() => {
    let active = true
    void (async () => {
      const { data } = await db.rpc('library_for_club', { target_club: clubHandle })
      if (!active || !data) return
      setPuzzles(
        data.map((row) => ({
          id: row.id,
          title: row.title,
          author: row.author,
          status: row.status as PuzzleStatus,
        })),
      )
    })()
    return () => {
      active = false
    }
  }, [clubHandle])

  // ─── The NYT tab's preview ───────────────────────────────
  // Which date the weekday resolves to, asked of the SAME function the edge
  // function will use at Start (`next_nyt_date_for_club`). Stamped with the
  // request it answers — the player set and the weekday — so "we're waiting"
  // is DERIVED from a stale stamp rather than set synchronously in an effect.
  //
  // Unlike connections and strands there is no title to preview: an NYT daily
  // isn't a row anywhere until it has been fetched, so the date is all we can
  // honestly show. `null` means that weekday is used up.
  const weekday = s.weekday ?? DEFAULT_WEEKDAY
  const seenBy = players.map((p) => p.user_id).join(',')
  const [nextDate, setNextDate] = useState<{ key: string; date: string | null } | null>(null)
  const nextKey = `${weekday}:${seenBy}`
  useEffect(() => {
    let active = true
    void (async () => {
      const { data } = await db.rpc('next_nyt_date_for_club', {
        seen_by: seenBy ? seenBy.split(',') : [],
        dow: weekday,
      })
      if (active) setNextDate({ key: nextKey, date: (data as string | null) ?? null })
    })()
    return () => {
      active = false
    }
  }, [nextKey, seenBy, weekday])

  const resolved = nextDate?.key === nextKey ? nextDate.date : undefined

  const today = todayStr()

    const source = s.source ?? 'library'
  // The Guardian series currently chosen (falls back to the first) — drives
  // both the <select> value and the character hint below it.
  const selectedGuardian =
    GUARDIAN_SERIES.find((g) => g.slug === s.series) ?? GUARDIAN_SERIES[0]!

  const filtered = useMemo(() => {
    if (!puzzles) return null
    const q = query.trim().toLowerCase()
    if (!q) return puzzles
    return puzzles.filter(
      (p) => p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q),
    )
  }, [puzzles, query])

  return (
    <div className={styles.setup}>
      <div className={styles.seg} role="group" aria-label="Puzzle source">
        <button
          type="button"
          className={cls(styles.segBtn, source === 'library' && styles.segOn)}
          aria-pressed={source === 'library'}
          // Drop any parsed upload board/filename when leaving the Upload tab so
          // a stale solution grid can't ride along in `setup` (belt-and-braces
          // with the unconditional strip in manifest + the create_game backstop).
          onClick={() => onChange({ ...s, source: 'library', board: undefined, filename: undefined })}
        >
          Library
        </button>
        <button
          type="button"
          className={cls(styles.segBtn, source === 'nyt' && styles.segOn)}
          aria-pressed={source === 'nyt'}
          onClick={() =>
            // No `date` seeded. It used to default to today, back when the NYT
            // path REQUIRED a date; now the date box is the override and the
            // weekday is the normal path, so pre-filling it would leave every
            // club permanently overriding to today without meaning to.
            onChange({ ...s, source: 'nyt', board: undefined, filename: undefined })
          }
        >
          NYT
        </button>
        <button
          type="button"
          className={cls(styles.segBtn, source === 'guardian' && styles.segOn)}
          aria-pressed={source === 'guardian'}
          onClick={() =>
            onChange({
              ...s,
              source: 'guardian',
              series: s.series || GUARDIAN_SERIES[0]!.slug,
              board: undefined,
              filename: undefined,
            })
          }
        >
          Guardian
        </button>
        <button
          type="button"
          className={cls(styles.segBtn, source === 'upload' && styles.segOn)}
          aria-pressed={source === 'upload'}
          onClick={() => onChange({ ...s, source: 'upload' })}
        >
          Upload
        </button>
      </div>

      {/* All three tab bodies stay MOUNTED, stacked in one grid cell, with the
          inactive ones visibility-hidden (see .tabStack): the block is always as
          tall as the tallest tab (the library's 8-row list), so switching tabs
          never resizes the dialog. Hidden = unfocusable + unclickable, and the
          library list keeps its scroll position across a tab round-trip. */}
      <div className={styles.tabStack}>
        <div className={cls(styles.tabBody, source !== 'upload' && styles.tabHidden)}>
          <p className="muted">Upload a .puz or .ipuz crossword file to play it.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".puz,.ipuz"
            className={styles.fileInput}
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              // Allow re-selecting the same file (onChange won't fire otherwise).
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className={cls(styles.dropzone, dragOver && styles.dropOver)}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              void handleFile(e.dataTransfer.files?.[0])
            }}
          >
            {uploadBusy ? (
              <span className={styles.dropTitle}>Reading…</span>
            ) : s.board ? (
              <>
                <span className={styles.dropTitle}>
                  {s.board.meta.title || s.filename || 'Puzzle ready'}
                </span>
                <span className={styles.dropMeta}>
                  {s.board.meta.width}×{s.board.meta.height}
                  {s.board.meta.author ? ` · ${s.board.meta.author}` : ''} · click to replace
                </span>
              </>
            ) : (
              <>
                <span className={styles.dropTitle}>Drop a .puz / .ipuz file here</span>
                <span className={styles.dropMeta}>or click to choose one</span>
              </>
            )}
          </button>
          {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
        </div>

        <div className={cls(styles.tabBody, source !== 'nyt' && styles.tabHidden)}>
          {/* The date genuinely matters here, unlike connections and strands
              (whose archives are queues): an NYT crossword's DAY is its
              difficulty. So the choice is a weekday, and the server turns it
              into the most recent puzzle of that day nobody playing has done. */}
          <p className="muted">
            Import a New York Times daily. Pick a weekday — that&rsquo;s the difficulty —
            and you&rsquo;ll get the most recent one nobody playing has done.
          </p>
          <select
            className={styles.search}
            aria-label="Weekday"
            value={weekday}
            onChange={(e) =>
              // Choosing a weekday clears any date override: the two answer the
              // same question, and leaving a date set would make this control
              // silently inert.
              onChange({ ...s, weekday: Number(e.target.value), date: undefined })
            }
          >
            {WEEKDAYS.map((w) => (
              <option key={w.dow} value={w.dow}>
                {w.name} — {w.note}
              </option>
            ))}
          </select>

          {/* One line: the date Start will fetch. No title — an NYT daily
              isn't stored anywhere until it's been fetched, so unlike the
              other two games' previews there is nothing to name it by. Fixed
              height so the timer below can't jump when the RPC lands. */}
          <p className={styles.nextDate}>
            {s.date
              ? `Playing ${s.date}`
              : resolved === undefined
                ? '\u00a0'
                : resolved === null
                  ? `You've played every ${weekdayName(weekday)} back to ${NYT_EARLIEST}.`
                  : `Next ${weekdayName(weekday)}: ${resolved}`}
          </p>

          {/* The override, same shape connections and strands carry: a plain
              date box that filters nothing. Setting it beats the weekday;
              clearing it hands the choice back. */}
          <input
            className={styles.search}
            type="date"
            aria-label="Puzzle date"
            min={NYT_EARLIEST}
            max={today}
            value={s.date ?? ''}
            onChange={(e) => onChange({ ...s, date: e.target.value || undefined })}
          />
        </div>

        <div className={cls(styles.tabBody, source !== 'guardian' && styles.tabHidden)}>
          <p className={styles.lead}>
            Load today&rsquo;s Guardian crossword. <strong>Quick</strong> and{' '}
            <strong>Speedy</strong> are plain-definition puzzles; the rest are{' '}
            <strong>cryptics</strong> (each clue is wordplay + a definition).
          </p>
          <select
            className={styles.search}
            aria-label="Guardian series"
            value={selectedGuardian.slug}
            onChange={(e) => onChange({ ...s, series: e.target.value })}
          >
            {GUARDIAN_SERIES.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.label}
              </option>
            ))}
          </select>
          {/* A one-line character hint for the chosen series (research-backed —
              helps a solver pick by difficulty). Full-color real text; the
              understatement is size + italic, not dimming. */}
          <p className={styles.guardianHint}>{selectedGuardian.hint}</p>
        </div>

        <div className={cls(styles.tabBody, source !== 'library' && styles.tabHidden)}>
          <input
            className={styles.search}
            type="text"
            placeholder="Filter by title or author…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={styles.list}>
            {filtered === null ? (
              <div className={styles.empty}>Loading puzzles…</div>
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>
                {/* The empty library reads as a plain fact, NOT as the import
                    command that fills it: this is a player-facing dialog and
                    the fix is Joel's to run, not theirs. A shell command here
                    tells a friend on production to do something they can't. */}
                {puzzles && puzzles.length === 0
                  ? 'No puzzles found.'
                  : 'No puzzles match that filter.'}
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cls(
                    styles.item,
                    statusClass(p.status),
                    s.puzzle_id === p.id && styles.selected,
                  )}
                  onClick={() => onChange({ ...s, puzzle_id: p.id })}
                >
                  {/* Title + author only. The grid size used to sit at the
                      right, but it isn't something you pick a puzzle BY, and
                      as the row's second column it fought the title for the
                      width — which is what made the dialog too wide. */}
                  <span className={styles.itemTitle}>
                    {p.title}
                    {p.author ? ` · ${p.author}` : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Timer — the shared field every other game uses (None / Up / Down with
          MM:SS). A countdown expiring routes to crosswords.submit_timeout,
          which ends the table: coop → `lost`, compete → `lost_compete`, both
          stamped `outcome: 'timeout'` so buildOver can say "Out of time"
          rather than the concede wording those states otherwise carry. */}
      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
