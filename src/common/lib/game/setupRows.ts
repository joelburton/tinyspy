import type { CoopStyle, CoopTurnSetup } from '../../components/fields/CoopStyleField'
import type { Member, TimerMode } from '../games'
import { timerLabel } from './timerLabel'

/**
 * The setup recap — **one array per game, rendered by both the info column and
 * the PDF** (docs/pdf.md → Setup rows).
 *
 * It used to be written twice: literal `<li>`s in each game's `InfoCol`, and a
 * separate hand-built `{label, value}[]` in its `PlayArea` for the print model.
 * They shared only their value formatters, so the values agreed while the
 * labels and the row set drifted — psychicnum went as far as reporting
 * *different facts* on paper than on screen. Each game now exports
 * `setupRows()` from `<game>/lib/setupSummary.ts` (the same per-game seam
 * `lib/history.ts` uses) and both consumers render that.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * **The recap is the setup dialog, read back.** Every control the dialog showed
 * produces exactly one row, in the dialog's order; a control that didn't apply
 * produces NO row; nothing else appears. Omit rather than print "n/a" — a
 * record must not assert a choice nobody made. Anything that isn't a control
 * (a game constant, a derived number) belongs in Help, not here.
 *
 * The MODE is the one deliberate exception, and it isn't a row: it's locked at
 * the gametype level (`manifest.mode`), never chosen on the form, so it rides
 * the PDF's heading instead (`Setup: Co-op`). See `drawSetup`.
 */
export type SetupRow = {
  /**
   * The setup key this row describes — `'timer'`, `'legal_band'`, … Nothing
   * RENDERS it; it exists so `setupRows.test.ts` can assert that every key in a
   * game's default setup produces a row. A convention that two lists agree is
   * exactly what we had before, and it drifted; this makes it a failing build.
   *
   * `PSEUDO_KEYS` below are the rows that describe something real but aren't a
   * key on the setup object (the roster).
   */
  key: string
  label: string
  /**
   * Plain string, never a React node. The PDF is WinAnsi (no `→`, no elements),
   * so it's the lower bound for what a shared row may carry — which is the
   * right way round. Screen-only richness lives outside these rows.
   */
  value: string
}

/** Row keys that aren't keys on a game's setup object. */
export const ROSTER_KEY = 'players'

/**
 * Who played — the FIRST row of every game's recap.
 *
 * It belongs here rather than being an exception to the "only controls" rule:
 * who plays is chosen in the create-game dialog too, right above the per-game
 * body. And on a record you keep, it's the single most useful line.
 */
export function rosterRow(players: Member[]): SetupRow {
  return {
    key: ROSTER_KEY,
    label: 'Players',
    value: players.map((p) => p.username).join(', ') || '—',
  }
}

/**
 * Co-op pacing, for the games that offer it (everything with a
 * `<CoopStyleField>`). Returns NOTHING when the field wouldn't have rendered —
 * compete, or a solo club — because a control that didn't apply produces no
 * row.
 *
 * Two keys, one control, so this returns up to two rows: the style, then the
 * opening seat when (and only when) turns were picked.
 */
export function coopRows(
  setup: CoopTurnSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  if (mode !== 'coop' || players.length < 2) return []
  const style: CoopStyle = setup.coop_style ?? 'free-for-all'
  const rows: SetupRow[] = [
    {
      key: 'coop_style',
      label: 'Pacing',
      value: style === 'turns' ? 'turn by turn' : 'free-for-all',
    },
  ]
  if (style === 'turns') {
    const first = players.find((p) => p.user_id === setup.first_turn_user_id)
    rows.push({
      key: 'first_turn_user_id',
      label: 'First turn',
      value: first?.username ?? '—',
    })
  }
  return rows
}

/** The timer, which every game's dialog offers. Always a row — "none" is a choice. */
export function timerRow(timer: TimerMode): SetupRow {
  return { key: 'timer', label: 'Timer', value: timerLabel(timer) }
}
