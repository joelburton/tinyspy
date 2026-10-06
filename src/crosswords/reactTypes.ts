// cs-unmet

/**
 * crosswords' types that reach React — the exported types `types.ts` cannot
 * hold, since a type built on an `Action` does not belong beside the data
 * (docs/code-conventions.md → A game's types). Every other exported type is in
 * `types.ts`.
 */

import type { Dispatch, SetStateAction } from 'react'
import type { Action } from '@/common/actions/useBindAction'
import type { GCursor, GRebusPostCommit, GScope } from './types'

/** The three scopes of one assistance family, each its own action. */
export type GScopeActions = Record<GScope, Action>

/**
 * The commands the strip under the clue lists places, bound once: the strip
 * places them, the menu lists them, and their keys fire them — all reading the
 * same action, so the surfaces cannot drift.
 */
export type GActions = {
  // Each key is spelled as its action's id (`act-restart` → `actRestart`), so
  // a grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  actPencil: Action
  check: GScopeActions
  reveal: GScopeActions
  actConcede: Action
  actStopGame: Action
  actRestart: Action
  actReveal: Action
  actNewGame: Action
  actBackToClub: Action
}

/**
 * Typing on the grid (`useGridEntry`): where the cursor is, pen or pencil, and
 * the three overlays a key opens — the rebus box, the read-only peek, the
 * jump-to-number popup.
 */
export type GGridEntry = {
  cursor: GCursor
  setCursor: Dispatch<SetStateAction<GCursor>>
  // A click lands the cursor on a cell; on the cell it is already on, it turns.
  clickCell: (row: number, col: number) => void
  pencil: boolean
  togglePencil: () => void
  // The rebus box over a cell, with the fill it opened on; null when closed.
  rebus: { row: number; col: number; initial: string } | null
  // Enter writes it and steps on; Tab and Shift+Tab write it and jump a clue.
  submitRebus: (value: string, post: GRebusPostCommit) => void
  cancelRebus: () => void
  // ⇧↵'s action, which is also a menu row.
  actRebus: Action
  // The read-only peek at a squeezed rebus; null when closed.
  peek: { row: number; col: number; value: string } | null
  numberJump: {
    isOpen: boolean
    // Moves the cursor to the clue's start; false when no clue has that number.
    jumpTo: (n: number) => boolean
    close: () => void
  }
}
