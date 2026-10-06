// cs-unmet

/**
 * scrabble's types that reach React — the exported types `types.ts` cannot
 * hold. `types.ts` is loaded by both scrabble edge functions (through `lib/`),
 * and the edge runtime cannot load React, so a type built on a React-dependent
 * piece (an `Action`) lives here instead. Every other exported type is in
 * `types.ts`.
 */

import type { Action } from '@/common/actions/useBindAction'

/**
 * Every command the info column places, bound once: the action row places
 * them, the menu lists them, and their keys fire them — all reading the same
 * action, so the surfaces cannot drift.
 */
export type GActions = {
  // Each key is spelled as its action's id (`act-restart` → `actRestart`), so
  // a grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  //
  // Ask the AI for a move — coop only.
  actSuggestMove: Action
  // Deal again — a fresh bag, new racks, an empty board — with this game's
  // setup, players and bots.
  actRestart: Action
  // A fresh game, with this game's setup, players and mode.
  actNewGame: Action
  // Drop out of a race while the others play on — hidden in coop.
  actConcede: Action
  // The whole table stops — a coop exit, or compete's Stop.
  actStopGame: Action
  // Print the board, my rack and the log.
  actPrintBoard: Action
  // Leave for the club — the shell's own action, off `menu`.
  actBackToClub: Action
}
