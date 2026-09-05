// cs-unmet

import type { CoopStyle, CoopTurnSetup } from './SetupCoopStyleSection'
import type { TimerMode } from '../manifest/gameManifest'
import type { Member } from '../members/member'
import { timerLabel } from '../timer/timerLabel'

/**
 * The setup recap — **one array per game, for the info column and the PDF to
 * share** (docs/pdf.md → Setup rows).
 *
 * A game exports `setupRows()` from `<game>/lib/setupSummary.ts` — the same
 * per-game seam `lib/history.ts` uses — and both surfaces render that one array.
 * Sharing it is what makes the screen and the printout agree: two
 * hand-maintained lists of the same facts will not stay in step, so a game that
 * renders one surface from something else has no way to keep them together.
 *
 * `guards/setupRows.test.ts` holds every game to having the module, and carries
 * the reason for the one game exempted from it.
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
 *
 * ── The board-identity exception (`BOARD_KEY`) ───────────────────────────────
 * Every game that BUILDS a board out of letters prints a row naming the board
 * itself, and prints it whether the letters were hand-picked in the dialog or
 * rolled at random. On a random board that is plainly not a control read back,
 * so it needs saying why it's allowed:
 *
 *   1. Those dialogs can all TAKE the letters as input ("Custom letters" /
 *      "Custom board"), so the row is the round trip — you read a board you
 *      liked off the recap (or off the printout) and paste it into the next
 *      game's dialog to hand a friend the same puzzle. A row that only appeared
 *      on hand-picked boards would be exactly the wrong half.
 *   2. Like the roster, it's the most useful line on a record you keep: it says
 *      WHICH board this was, which no other row can.
 *
 * It's an exception to "controls only", not a loophole in it: a derived number
 * (a word count, a par) still belongs in Help. The test at
 * `src/guards/setupRows.test.ts` doesn't police extra rows, so this costs no opt-out —
 * but the games' `custom_*` setup keys DO carry a `NOT_A_ROW` entry there,
 * because the override itself isn't the row; the board it produced is.
 */

/** One line of the recap: what it describes, what it's called, what it says. */
export type SetupRow = {
  // The setup key this row describes — `'timer'`, `'legal_band'`, … Nothing
  // RENDERS it; it exists so `src/guards/setupRows.test.ts` can assert that
  // every key in a game's default setup produces a row — so adding a setup
  // field forces a decision about whether players see it recorded, rather than
  // leaving two lists to agree by convention. The two PSEUDO-KEYS below
  // describe something real that isn't a setup key: the roster, and the board.
  key: string
  label: string
  // Plain string, never a React node. The PDF is WinAnsi (no `→`, no elements),
  // so it's the lower bound for what a shared row may carry — which is the
  // right way round. Screen-only richness lives outside these rows.
  value: string
}

/** Who played. One of the two pseudo-keys — see `SetupRow.key`. */
export const ROSTER_KEY = 'players'

/**
 * The board's own letters — see "The board-identity exception" above.
 *
 * **The KEY is what's shared; the label and the value are each game's own.** A
 * board is a different shape in every one of these games (`A-CHIROT` vs `ABCD
 * EFGH IJKL MNOP`), and they don't all call it the same thing either — some say
 * `Letters`, some say `Board`. What they must NOT do is drift into different
 * keys for one idea, since the key is what the guard matches against a game's
 * setup.
 *
 * Two routes to it, decided by board shape rather than by game: a board that is
 * a center plus an outer ring gets its row from `centerLettersRow()` below and
 * never names this constant; any other shape imports it and builds its own row.
 */
export const BOARD_KEY = 'letters'

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
 * `<SetupCoopStyleSection>`). Returns NOTHING when the field wouldn't have rendered —
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

/**
 * The board of a CENTER-LETTER game — spellingbee's honeycomb and wordwheel's
 * wheel, both "one letter every word must use, plus the others". Reads
 * `A-CHIROT`: the center, a dash, then the rest.
 *
 * The dash is load-bearing: it's the shape their setup dialogs' own summary
 * line uses (`Custom letters: A-CHIROT`), so what the recap prints is what you
 * would type back in.
 *
 * `outer` is printed SORTED — a canonical spelling, so one board always reads
 * the same way. Two reasons it can't just be the string as it arrives:
 *
 *   • Both games let a player shuffle the outer letters on screen, so "as
 *     drawn" would print a different row per player for one board.
 *   • Even the stored order is arbitrary. A random spellingbee board arrives
 *     alphabetized, a hand-picked one arrives as it was typed. Since the game's
 *     own TITLE (`E·ABCDFG`) alphabetizes, an unsorted row would put two
 *     spellings of one board on a single PDF.
 *
 * Sorting is lossless here: both boards are a center plus a *multiset* of
 * others (no outer position means anything), so a sort keeps the board exactly
 * — including a wordwheel duplicate, which sorts next to its twin.
 *
 * Returns nothing while the board is still loading (`null`), so a game page
 * that hasn't fetched its row yet omits the line rather than printing a stub.
 */
export function centerLettersRow(board: { center: string; outer: string } | null): SetupRow[] {
  if (!board) return []
  return [
    {
      key: BOARD_KEY,
      label: 'Letters',
      value: `${board.center.toUpperCase()}-${[...board.outer.toUpperCase()].sort().join('')}`,
    },
  ]
}

/** The timer, which every game's dialog offers. Always a row — "none" is a choice. */
export function timerRow(timer: TimerMode): SetupRow {
  return { key: 'timer', label: 'Timer', value: timerLabel(timer) }
}
