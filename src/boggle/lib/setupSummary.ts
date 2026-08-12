import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { BOARD_KEY, rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import { DICE_BY_NAME } from './dice'
import { formatBoard } from './customBoard'
import type { BoggleSetup } from './setup'

/**
 * One "Board constraints" grid row (Words / Score / Longest), read back as a
 * sentence — or `null` when the player set neither bound, since a recap must
 * not assert a choice nobody made (setupRows.ts → The rule).
 *
 * Spelled out rather than punctuated as a range (`10-20`): these rows sit in a
 * flat list beside "Min word length: 3", where a bare pair of numbers would
 * read as two separate facts, and the same string has to work on paper.
 */
function boundsValue(min: number | undefined, max: number | undefined): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null) return min === max ? `exactly ${min}` : `${min} to ${max}`
  return min != null ? `at least ${min}` : `at most ${max}`
}

/**
 * boggle's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * The labels used to differ between the two consumers ("Board" vs "Dice",
 * "Min word length" vs "Min length", "Dictionary (required)" vs "Required
 * words") — one fact named twice by two files. These are the screen's, since
 * that's the wording players actually learned.
 *
 * The `Letters` row is the documented board-identity exception (setupRows.ts →
 * BOARD_KEY): the tiles this game was actually played on, rolled or typed,
 * written exactly as the setup dialog's custom-board field takes them back
 * (`lib/customBoard.ts` owns both directions). It leads, under the roster —
 * on a kept record, WHICH board this was outranks how it was configured, and
 * it's the line you copy to hand a friend the same board.
 *
 * "Board" stays the DICE SET, which is a different fact and still a control:
 * it's what a rolled board was rolled from, and (custom or not) it's what fixed
 * the side length.
 */
export function setupRows(
  setup: BoggleSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
  /** The board's raw face string + side length, or null while the game row is
   *  still loading. */
  board: { board: string; n: number } | null = null,
): SetupRow[] {
  // Derived here rather than taken as an argument: it's a pure function of a
  // setup KEY, and the component computed it too late in its render to hand over.
  const ladderLabel =
    setup.scoring_ladder.charAt(0).toUpperCase() + setup.scoring_ladder.slice(1)
  // A player-typed board means the roll loop never ran, so its targets applied
  // to nothing — and a recap must not assert a choice that had no effect.
  const isCustomBoard = (setup.custom_board ?? '').trim() !== ''
  return [
    rosterRow(players),
    ...(board ? [{ key: BOARD_KEY, label: 'Letters', value: formatBoard(board.board, board.n) }] : []),
    {
      key: 'dice_set',
      label: 'Board',
      value: DICE_BY_NAME[setup.dice_set]?.desc ?? setup.dice_set,
    },
    { key: 'band', label: 'Dictionary (required)', value: difficultyValue(setup.band) },
    { key: 'legal_band', label: 'Dictionary (legal)', value: difficultyValue(setup.legal_band) },
    { key: 'scoring_ladder', label: 'Scoring', value: ladderLabel },
    { key: 'min_word_length', label: 'Min word length', value: String(setup.min_word_length) },
    {
      key: 'win_percent',
      label: 'Win at',
      // `== null` catches undefined too: the old screen row tested `=== null`
      // only, so an unset threshold rendered "undefined%" — invisible on screen
      // behind a closed disclosure, glaring once it printed.
      value: setup.win_percent == null ? 'none' : `${setup.win_percent}%`,
    },
    // The "Board constraints" section, one row per grid row, in the dialog's
    // order — the generator's targets, measured against the REQUIRED words. A
    // pair the player left blank produces no row at all, so a board built with
    // no constraints reads as a recap with none.
    //
    // Keyed `constraints.*` because the setup holds them in one nested object:
    // setupRows.test.ts excuses `constraints` itself from needing a row of its
    // own ONLY on the promise that its parts appear as `constraints.` rows, and
    // it checks that promise rather than taking it (it used to take it — which
    // is how these went missing from both surfaces in the first place).
    //
    // They vanish wholesale for a custom board: the tiles came from the player,
    // nothing was rejection-sampled, and printing "Board words: at least 10"
    // beside a board that was never measured against it would be a lie the
    // reader can't detect.
    ...(isCustomBoard
      ? []
      : CONSTRAINT_ROWS.flatMap(({ key, label, min, max }) => {
          const value = boundsValue(setup.constraints?.[min], setup.constraints?.[max])
          return value ? [{ key: `constraints.${key}`, label, value }] : []
        })),
    timerRow(setup.timer),
  ]
}

/** The three min/max pairs the setup form offers, in its own order. Mirrors
 *  `CONSTRAINT_ROWS` in components/SetupForm.tsx — same three facts, the
 *  screen's labels made self-describing for a flat list ("Longest" alone says
 *  nothing once it's out of the grid). */
const CONSTRAINT_ROWS = [
  { key: 'words', label: 'Board words', min: 'minWords', max: 'maxWords' },
  { key: 'score', label: 'Board score', min: 'minScore', max: 'maxScore' },
  { key: 'longest', label: 'Longest word', min: 'minLongest', max: 'maxLongest' },
] as const
