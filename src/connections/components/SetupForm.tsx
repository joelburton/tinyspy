import { useEffect, useMemo, useRef, useState } from 'react'
import { TimerField } from '../../common/components/fields/TimerField'
import { CoopStyleField } from '../../common/components/fields/CoopStyleField'
import type { SetupBodyProps } from '../../common/lib/games'
import { db } from '../db'
import type { ConnectionsSetup } from '../lib/setup'
import { Calendar, type OutcomeBucket } from '../../common/components/fields/Calendar'
import { resolveDefaultPuzzle } from '../lib/defaultPuzzle'
import styles from '../../common/components/fields/setupForm.module.css'

/** A puzzle entry as the form needs it — id + date. Date is
 *  nullable on the table now (non-NYT puzzles may carry NULL),
 *  but the date-picker and calendar only ever care about
 *  rows whose nyt_date IS NOT NULL, so we narrow at fetch time. */
type PuzzleEntry = {
  id: string
  nyt_date: string
}

/** Per-club game-state row from `connections.club_game_status`. */
type ClubGameStatusRow = {
  game_id: string
  play_state: string
  is_terminal: boolean
  nyt_date: string
}

/**
 * connections's per-game setup form. Two choices:
 *
 *   - **Puzzle** — chosen via either the date input or the
 *     calendar widget. The calendar shows the club's prior
 *     connections games as colored squares (won / lost / in-
 *     progress) so the friends can visually pick "the next
 *     puzzle we haven't played" or "go back and finish that
 *     one we started." The resolved date maps to a
 *     `connections.puzzles` row id, which becomes
 *     `setup.puzzleId`. Defaults to the club's saved default
 *     (the puzzle they last started), stepping one day forward
 *     if that one's already been finished; a club with no saved
 *     default starts on the most-recent imported puzzle. (Not
 *     today — the friends resume where they left off.)
 *   - **Timer** — delegated to the shared `<TimerField>`
 *     component (None / Up / Down with MM:SS input).
 *
 * On mount we fetch two lists:
 *   1. All puzzles (id + nyt_date), filtered to non-NULL dates
 *      — drives both the date input's min/max and the calendar
 *      square selectability.
 *   2. Per-club game statuses (`connections.club_game_status`) —
 *      drives the calendar's color overlay.
 *
 * Find-or-create flow: when the user clicks Start, the manifest's
 * `startGameInClub` checks for an existing game on the selected
 * puzzle for this club and either opens it or creates a new one.
 * The dialog stays oblivious to that branch — it just navigates
 * to whatever id `startGameInClub` returns.
 *
 * Component name `SetupForm` matches the file + the
 * `manifest.setupForm` field — this is the *form definition*,
 * distinct from `ConnectionsSetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`connections/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
 */
export function SetupForm({ brand, clubHandle, mode, players, value, onChange }: SetupBodyProps) {
  const s = value as ConnectionsSetup
  const [puzzles, setPuzzles] = useState<PuzzleEntry[] | null>(null)
  // `null` = still loading (distinct from a loaded-but-empty club with no
  // games). The default-puzzle resolution below waits for this to settle,
  // because it needs to know whether the club already finished the saved
  // puzzle before deciding whether to step to the next day.
  const [statuses, setStatuses] = useState<ClubGameStatusRow[] | null>(null)

  // Fetch the puzzle list once on mount. Order descending so
  // index 0 is "most recent" — the default-pick base when the club
  // has no saved default yet. Filter out NULL-dated rows: those are
  // non-NYT puzzles that don't belong on a date-anchored picker.
  useEffect(function loadPuzzleList() {
    let cancelled = false
    db.from('puzzles')
      .select('id, nyt_date')
      .not('nyt_date', 'is', null)
      .order('nyt_date', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setPuzzles([])
          return
        }
        setPuzzles(data as PuzzleEntry[])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch the club's per-date game statuses for the calendar
  // overlay. One round-trip via `connections.club_game_status`, a
  // security_invoker view that joins connections.games + puzzles +
  // common.games (the cross-schema join PostgREST embeds can't
  // resolve). RLS on the underlying tables gates visibility, so
  // a non-member's query returns zero rows even without the
  // .eq('club_handle') filter — the filter is belt-and-braces.
  //
  // Scoped to THIS dialog's `mode`: with both connections_coop and
  // connections_compete present, a club may have games in both modes
  // on the same date and the calendar should color per the mode
  // the user is about to start. The view exposes the `mode`
  // column for exactly this filter.
  useEffect(function loadClubGameStatuses() {
    let cancelled = false
    db.from('club_game_status')
      .select('game_id, play_state, is_terminal, nyt_date')
      .eq('club_handle', clubHandle)
      .eq('mode', mode)
      .then(({ data, error }) => {
        if (cancelled) return
        // Settle to [] (not left at null) even on error/no-data so the
        // default-puzzle resolution — which waits for statuses to load —
        // isn't blocked forever.
        setStatuses(error || !data ? [] : (data as ClubGameStatusRow[]))
      })
    return () => {
      cancelled = true
    }
  }, [clubHandle, mode])

  // Resolve the default puzzle once, after both the puzzle list AND the
  // club's per-date outcomes have loaded. This runs a single time (guarded
  // by `defaultResolved`); afterwards the user's picks stand untouched.
  const defaultResolved = useRef(false)
  // The puzzleId the dialog seeded us with — the club's SAVED DEFAULT (the
  // setup they last started), merged in by SetupGameDialog before mount, or
  // '' for a club that's never played connections. Captured on first render
  // so we can tell "still the seeded value" from "the user already picked."
  const seededPuzzleId = useRef(s.puzzleId)
  useEffect(function resolveDefaultPuzzleOnce() {
    if (defaultResolved.current) return
    if (!puzzles || puzzles.length === 0) return
    if (statuses === null) return // wait until the club's outcomes are known
    defaultResolved.current = true

    // If the user already picked something before this resolved, leave it.
    if (s.puzzleId !== seededPuzzleId.current) return

    // Dates the club has FINISHED (won/lost) — the step-forward trigger.
    const finishedDates = new Set(
      statuses.filter((r) => r.is_terminal).map((r) => r.nyt_date),
    )
    const pickId = resolveDefaultPuzzle(puzzles, finishedDates, s.puzzleId)
    if (pickId && pickId !== s.puzzleId) onChange({ ...s, puzzleId: pickId })
  }, [puzzles, statuses, s, onChange])

  // Build the two lookup structures the calendar needs:
  //   - puzzleDates: which dates have an importable puzzle (any
  //     month). Drives which squares are clickable.
  //   - clubGameStatuses: per-date outcome bucket for THIS club's
  //     connections games. Drives which squares are colored.
  const puzzleDates = useMemo(
    () => new Set((puzzles ?? []).map((p) => p.nyt_date)),
    [puzzles],
  )
  const clubGameStatuses = useMemo(() => {
    const m = new Map<string, OutcomeBucket>()
    for (const row of statuses ?? []) m.set(row.nyt_date, bucketForRow(row))
    return m
  }, [statuses])

  // While the list is loading, render nothing (the dialog itself
  // has the "Loading…" / spinner state if needed). On loaded-but-
  // empty, show the import-script help banner.
  if (puzzles === null) {
    return (
      <div className={styles.setup}>
        <p className="muted">Loading puzzles…</p>
      </div>
    )
  }
  if (puzzles.length === 0) {
    return (
      <div className={styles.setup}>
        <p className="error">
          No puzzles imported yet. Run <code>npm run connections:import</code> from
          the project root.
        </p>
      </div>
    )
  }

  // The `<input type="date">` constraints. min/max bound the
  // picker to the dates we actually have; the JS-side check on
  // change re-resolves to a puzzle id.
  const dates = puzzles.map((p) => p.nyt_date)
  const minDate = dates[dates.length - 1]
  const maxDate = dates[0]
  const selectedDate =
    puzzles.find((p) => p.id === s.puzzleId)?.nyt_date ?? maxDate

  function handleDateChange(nextDate: string) {
    const match = puzzles?.find((p) => p.nyt_date === nextDate)
    if (!match) return  // out-of-range date typed into the field
    onChange({ ...s, puzzleId: match.id })
  }

  return (
    <div className={styles.setup}>
      <fieldset className={styles.fieldset}>
        <legend>Puzzle</legend>
        <p className="muted">
          Pick a {brand} puzzle by date. Green squares are
          puzzles your club has solved; red are lost; yellow are in
          progress. Defaults to your last puzzle (or the next day's,
          if you already finished it).
        </p>
        <input
          type="date"
          value={selectedDate}
          min={minDate}
          max={maxDate}
          onChange={(e) => handleDateChange(e.target.value)}
        />
        <Calendar
          selectedDate={selectedDate}
          onSelectDate={handleDateChange}
          puzzleDates={puzzleDates}
          clubGameStatuses={clubGameStatuses}
        />
      </fieldset>

      <CoopStyleField
        mode={mode}
        players={players}
        coopStyle={s.coopStyle ?? 'free-for-all'}
        firstTurnUserId={s.firstTurnUserId ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          onChange({ ...s, coopStyle, firstTurnUserId })
        }
      />
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}

/**
 * Map a connections game's (play_state, is_terminal) to the
 * common outcome bucket the Calendar colors squares from.
 *
 * connections's play_state vocabulary:
 *   - `playing`           — non-terminal (yellow / active)
 *   - `solved`            — terminal win (green / won)
 *   - `lost`              — terminal loss (red / lost)
 *
 * If a future play_state lands that isn't `solved` but IS
 * terminal, we treat it as a loss — same posture as the
 * manifest's `labelFor` fallthrough.
 */
function bucketForRow(row: ClubGameStatusRow): OutcomeBucket {
  if (!row.is_terminal) return 'active'
  if (row.play_state === 'solved') return 'won'
  return 'lost'
}
