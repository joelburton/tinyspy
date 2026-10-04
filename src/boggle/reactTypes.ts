// cs-unmet

/**
 * boggle's types that reach React — the exported types `types.ts` cannot hold.
 * `types.ts` is loaded by the boggle-build-board edge function (through
 * `lib/solver.ts`, `generate.ts` and `dice.ts`), and the edge runtime cannot
 * load React, so a type built on a React-dependent piece (an `Action`, a
 * `Mark`) lives here instead. Every other exported type is in `types.ts`.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { Mark } from '@/common/board-marks/useMark'
import type { Outcome } from '@/common/outcomes/outcomes'

/**
 * Every command boggle offers, bound once: the info column's action row places
 * them, the menu lists them, and their keys fire them — all reading the same
 * action, so the surfaces cannot drift.
 */
export type GActions = {
  // Restart THIS board — same tiles, finds wiped. A button only at the end.
  actRestart: Action
  // Start a fresh follow-up game — same setup, new board and id. A button only
  // at the end; disables itself while the create is in flight.
  actNewGame: Action
  // Drop out of a race while the others play on — hidden outside compete.
  actConcede: Action
  // Stop the game for the whole table — coop's exit; it hides itself in a race.
  actStopGame: Action
  // Print the board and the word list.
  actPrintBoard: Action
  // Leave for the club — the shell's own action, off `menu`.
  actBackToClub: Action
}

/** A refused word's mark, while its answer is up: the cells of the path that
 *  spells it — they wear the answer and shake — and the outcome they wear. */
export type GRefusedMark = Mark<{ cells: number[]; outcome: Outcome }>
