import { useEffect, useState } from 'react'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import { db } from '../db'
import type { WordknitSetup } from '../lib/setup'
import styles from './SetupForm.module.css'

/** A puzzle entry as the form needs it — just id + date. The
 *  date picker resolves the user's date choice to a puzzle id;
 *  no other puzzle field is read here. */
type PuzzleEntry = {
  id: string
  nyt_date: string
}

/**
 * Wordknit's per-game setup form. Two choices:
 *
 *   - **Puzzle** — a date picker constrained to dates that have
 *     puzzles in `wordknit.puzzles`. Defaults to today's puzzle
 *     if available, else the most recent. The selected date
 *     resolves to a puzzle id, which becomes `setup.puzzleId`.
 *   - **Timer** — delegated to the shared `<TimerField>`
 *     component (None / Up / Down with MM:SS input).
 *
 * On mount we fetch the puzzle list (`id, nyt_date`) and auto-
 * pick the default. If no puzzles are imported yet, we show a
 * help banner and the Start button stays effectively disabled
 * (puzzleId is the empty string; the RPC rejects with P0001).
 *
 * Component name `SetupForm` matches the file + the
 * `manifest.setupForm` field — this is the *form definition*,
 * distinct from `WordknitSetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`wordknit/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as WordknitSetup
  const [puzzles, setPuzzles] = useState<PuzzleEntry[] | null>(null)

  // Fetch the puzzle list once on mount. Order descending so
  // index 0 is "most recent" — used as the default-pick fallback
  // when today's date has no puzzle imported yet.
  useEffect(() => {
    let cancelled = false
    db.from('puzzles')
      .select('id, nyt_date')
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

  // Auto-pick the default puzzle once the list arrives. We pick
  // today's puzzle if it exists in the imported set, otherwise
  // the most recent. The effect only runs while puzzleId is
  // empty so a user-selected value isn't overwritten on re-render.
  useEffect(() => {
    if (!puzzles || puzzles.length === 0) return
    if (s.puzzleId !== '') return
    const today = new Date().toISOString().slice(0, 10)
    const todays = puzzles.find((p) => p.nyt_date === today)
    const pick = todays ?? puzzles[0]
    onChange({ ...s, puzzleId: pick.id })
  }, [puzzles, s, onChange])

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
          Pick a NYT Connections puzzle by date. Defaults to today's
          puzzle if available.
        </p>
        <input
          type="date"
          value={selectedDate}
          min={minDate}
          max={maxDate}
          onChange={(e) => handleDateChange(e.target.value)}
        />
      </fieldset>

      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
