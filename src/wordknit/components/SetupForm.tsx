import { useEffect, useMemo, useState } from 'react'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import { db } from '../db'
import type { WordKnitSetup } from '../lib/setup'
import { Calendar, type OutcomeBucket } from './Calendar'
import styles from './SetupForm.module.css'

/** A puzzle entry as the form needs it — id + date. Date is
 *  nullable on the table now (non-NYT puzzles may carry NULL),
 *  but the date-picker and calendar only ever care about
 *  rows whose nyt_date IS NOT NULL, so we narrow at fetch time. */
type PuzzleEntry = {
  id: string
  nyt_date: string
}

/** Per-club game-state row from `wordknit.club_game_status`. */
type ClubGameStatusRow = {
  game_id: string
  play_state: string
  is_terminal: boolean
  nyt_date: string
}

/**
 * wordknit's per-game setup form. Two choices:
 *
 *   - **Puzzle** — chosen via either the date input or the
 *     calendar widget. The calendar shows the club's prior
 *     wordknit games as colored squares (won / lost / in-
 *     progress) so the friends can visually pick "the next
 *     puzzle we haven't played" or "go back and finish that
 *     one we started." The resolved date maps to a
 *     `wordknit.puzzles` row id, which becomes
 *     `setup.puzzleId`. Defaults to today's puzzle if
 *     available, else the most recent.
 *   - **Timer** — delegated to the shared `<TimerField>`
 *     component (None / Up / Down with MM:SS input).
 *
 * On mount we fetch two lists:
 *   1. All puzzles (id + nyt_date), filtered to non-NULL dates
 *      — drives both the date input's min/max and the calendar
 *      square selectability.
 *   2. Per-club game statuses (`wordknit.club_game_status`) —
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
 * distinct from `WordKnitSetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`wordknit/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
 */
export function SetupForm({ clubHandle, mode, value, onChange }: SetupBodyProps) {
  const s = value as WordKnitSetup
  const [puzzles, setPuzzles] = useState<PuzzleEntry[] | null>(null)
  const [statuses, setStatuses] = useState<ClubGameStatusRow[]>([])

  // Fetch the puzzle list once on mount. Order descending so
  // index 0 is "most recent" — used as the default-pick fallback
  // when today's date has no puzzle imported yet. Filter out
  // NULL-dated rows: those are non-NYT puzzles that don't belong
  // on a date-anchored picker.
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
  // overlay. One round-trip via `wordknit.club_game_status`, a
  // security_invoker view that joins wordknit.games + puzzles +
  // common.games (the cross-schema join PostgREST embeds can't
  // resolve). RLS on the underlying tables gates visibility, so
  // a non-member's query returns zero rows even without the
  // .eq('club_handle') filter — the filter is belt-and-braces.
  //
  // Scoped to THIS dialog's `mode`: with both wordknit_coop and
  // wordknit_compete present, a club may have games in both modes
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
        if (error || !data) return
        setStatuses(data as ClubGameStatusRow[])
      })
    return () => {
      cancelled = true
    }
  }, [clubHandle, mode])

  // Auto-pick the default puzzle once the list arrives. We pick
  // today's puzzle if it exists in the imported set, otherwise
  // the most recent. The effect only runs while puzzleId is
  // empty so a user-selected value (or a saved default) isn't
  // overwritten on re-render.
  useEffect(function autoPickDefaultPuzzle() {
    if (!puzzles || puzzles.length === 0) return
    if (s.puzzleId !== '') return
    const today = new Date().toISOString().slice(0, 10)
    const todays = puzzles.find((p) => p.nyt_date === today)
    const pick = todays ?? puzzles[0]
    onChange({ ...s, puzzleId: pick.id })
  }, [puzzles, s, onChange])

  // Build the two lookup structures the calendar needs:
  //   - puzzleDates: which dates have an importable puzzle (any
  //     month). Drives which squares are clickable.
  //   - clubGameStatuses: per-date outcome bucket for THIS club's
  //     wordknit games. Drives which squares are colored.
  const puzzleDates = useMemo(
    () => new Set((puzzles ?? []).map((p) => p.nyt_date)),
    [puzzles],
  )
  const clubGameStatuses = useMemo(() => {
    const m = new Map<string, OutcomeBucket>()
    for (const row of statuses) m.set(row.nyt_date, bucketForRow(row))
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
          No puzzles imported yet. Run <code>npm run puzzles:import</code> from
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
          Pick a NYT Connections puzzle by date. Green squares are
          puzzles your club has solved; red are lost; yellow are in
          progress. Defaults to today's puzzle if available.
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

      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}

/**
 * Map a wordknit game's (play_state, is_terminal) to the
 * common outcome bucket the Calendar colors squares from.
 *
 * wordknit's play_state vocabulary:
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
