import { useMemo, useState } from 'react'
import { buildMonthGrid } from '../../lib/util/monthGrid'
import styles from './Calendar.module.css'

/**
 * Per-date game-outcome bucket the calendar uses to color a
 * square. The mapping from a per-gametype `play_state` to this
 * bucket lives in the caller (e.g. connections's `SetupForm`,
 * where we know that game's vocabulary). The calendar itself is
 * gametype-agnostic — give it a `Map<YYYY-MM-DD, OutcomeBucket>`
 * and a `Set<YYYY-MM-DD>` of "dates that have an available
 * puzzle," and it renders.
 *
 * The bucket names match the `--color-outcome-*` theme tokens in
 * `src/common/theme.css`, where the colors live so other surfaces
 * (future stats chips, listing badges) can reuse them.
 */
export type OutcomeBucket = 'won' | 'lost' | 'active'

type Props = {
  /** Currently-selected date as `YYYY-MM-DD`, or empty if none. */
  selectedDate: string
  /** Click handler — fires with `YYYY-MM-DD`. Days without a
   *  puzzle don't call this (button is disabled). */
  onSelectDate: (date: string) => void
  /** Dates that have an imported puzzle available, anywhere
   *  across all months. Days NOT in this set render as
   *  un-clickable "no puzzle" squares. */
  puzzleDates: Set<string>
  /** For THIS club: per-date outcome bucket. Dates not in this
   *  map have no game (uncolored square). */
  clubGameStatuses: Map<string, OutcomeBucket>
}

/**
 * Month-grid calendar widget — a shared `common/fields` picker for
 * date-indexed puzzle games (connections is the first user).
 *
 * Each square represents a single calendar date. The visual
 * states (in priority order):
 *
 *   - **No puzzle available** — gray text, disabled, no fill.
 *     The user can't pick this date because nothing's been
 *     imported.
 *   - **Has a game in this club** — fill from one of three
 *     `--color-outcome-*` theme tokens (green/red/yellow per
 *     `OutcomeBucket`).
 *   - **Has a puzzle, no club game yet** — plain white square,
 *     clickable. The dialog's Start button creates a new game.
 *   - **Currently selected** — accent-colored ring.
 *
 * Navigation: prev/next month arrows; today's-month button.
 * The component owns the view-month state; the parent only
 * cares about `selectedDate`. Clicking a date in another month
 * doesn't auto-jump — the user has to navigate the calendar
 * to find the date they want.
 *
 * Date string format throughout is `YYYY-MM-DD` (e.g. matches
 * `connections.puzzles.nyt_date::text`). All Date construction
 * goes through `Date.UTC(...)` so we never trip on local-tz
 * offsets — these dates are calendar coordinates, not
 * timestamps.
 */
export function Calendar({
  selectedDate,
  onSelectDate,
  puzzleDates,
  clubGameStatuses,
}: Props) {
  // The view-month is anchored on the 1st of the month. Default
  // to the selected date's month if there is one, otherwise to
  // today's month (using UTC throughout to stay aligned with the
  // `YYYY-MM-DD` keying convention).
  const [viewYearMonth, setViewYearMonth] = useState<
    { year: number; month: number }
  >(() => {
    const seed = selectedDate ? parseDate(selectedDate) : todayUtc()
    return { year: seed.year, month: seed.month }
  })

  const grid = useMemo(
    () => buildMonthGrid(viewYearMonth.year, viewYearMonth.month),
    [viewYearMonth],
  )

  function shiftMonth(delta: number) {
    setViewYearMonth(({ year, month }) => {
      const nextMonth = month + delta
      if (nextMonth < 0) return { year: year - 1, month: 11 }
      if (nextMonth > 11) return { year: year + 1, month: 0 }
      return { year, month: nextMonth }
    })
  }

  return (
    <div className={styles.calendar}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className={styles.title}>
          {MONTH_NAMES[viewYearMonth.month]} {viewYearMonth.year}
        </div>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className={styles.weekdays}>
        {WEEKDAY_LETTERS.map((d, i) => (
          <div key={i} className={styles.weekday}>
            {d}
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        {grid.map((cell, i) => {
          if (cell === null) {
            return <div key={i} className={styles.empty} />
          }
          const dateStr = cell.dateStr
          const hasPuzzle = puzzleDates.has(dateStr)
          const outcome = clubGameStatuses.get(dateStr)
          const isSelected = dateStr === selectedDate
          return (
            <button
              type="button"
              key={i}
              className={[
                styles.day,
                outcome ? styles[`day_${outcome}`] : '',
                isSelected ? styles.daySelected : '',
                !hasPuzzle ? styles.dayNoPuzzle : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => hasPuzzle && onSelectDate(dateStr)}
              disabled={!hasPuzzle}
              aria-label={cellAriaLabel(cell, hasPuzzle, outcome)}
              aria-pressed={isSelected}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── local helpers ──────────────────────────────────────────

function parseDate(s: string): { year: number; month: number; day: number } {
  const [y, m, d] = s.split('-').map((p) => parseInt(p, 10))
  return { year: y, month: m - 1, day: d }
}

function todayUtc(): { year: number; month: number; day: number } {
  const now = new Date()
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth(),
    day: now.getUTCDate(),
  }
}

function cellAriaLabel(
  cell: { day: number; dateStr: string },
  hasPuzzle: boolean,
  outcome: OutcomeBucket | undefined,
): string {
  // Build a screen-reader-friendly description so the colored
  // states are perceivable without sight. The date itself is the
  // anchor; outcome and puzzle-availability are addenda.
  const base = cell.dateStr
  if (!hasPuzzle) return `${base}, no puzzle available`
  if (outcome === 'won') return `${base}, won`
  if (outcome === 'lost') return `${base}, lost`
  if (outcome === 'active') return `${base}, in progress`
  return base
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
