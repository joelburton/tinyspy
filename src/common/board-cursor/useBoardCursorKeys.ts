// cs-blessed-board-cursor

import { useBoundAction } from '@/common/actions/useBoundAction'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { ArrowKey } from './gridCursor'

export type BoardCursorKeysOptions = {
  // May the caller act on keys right now? When false every action goes
  // DISABLED — the arrows, the letters, Backspace, Space and the commit — and
  // a disabled action leaves the keystroke for whoever else wants it.
  enabled: boolean
  // Move the cursor. `moveCursor` may turn it onto the arrow's axis instead of
  // stepping.
  onArrow: (key: ArrowKey) => void
  // The three below are each optional: a board without one has no such key,
  // so its action answers HIDDEN — not listed in Help, and the key left alone.
  //
  // A typed A–Z letter, uppercased: place a tile for it at the cursor.
  onLetter?: (letter: string) => void
  // Remove a tile, the one `planBackspace` picks.
  onBackspace?: () => void
  // Space: put the tile under the cursor into the move, or take it out. Not
  // with `commit: 'act-peel'`, whose keys include Space.
  onToggle?: () => void
  // Make the move, on whichever keys `commit`'s action carries. The callback
  // does its own "is it legal right now" check.
  onCommit: () => void
  // Which action the commit IS. Its keys come with it: `act-submit` carries
  // Enter, `act-peel` Enter and Space.
  commit: 'act-peel' | 'act-submit'
  // May the commit fire right now? A NARROWER question than `enabled`: the
  // cursor keys stay live while the move itself isn't available, and the same
  // answer grays the button. Defaults to `enabled`.
  canCommit?: boolean
}

/** What the caller gets back — the commit binding, to place as a button. The
 *  other actions are keys with no control of their own: nothing on screen "is"
 *  the left arrow. */
export type BoardCursorKeys = {
  actCommit: BoundAction
}

/**
 * The shared **2-D board-cursor keyboard**: the arrow keys MOVE a cursor over a
 * board, and the commit's keys make the move. A game that types tiles onto a
 * grid adds an A–Z letter to place a tile at the cursor and Backspace to remove
 * one; a game that picks pieces adds Space to pick the one under the cursor.
 * What each of those DOES is the game's, supplied as callbacks: which cells can
 * be edited, where a placed tile comes from, what a pick is, and what the move
 * is.
 *
 * This owns the binding, as five bound actions — `act-move-cursor`,
 * `act-place-tile`, `act-remove-tile`, `act-toggle-tile`, and the game's own
 * commit. The arrows and the letters are PATTERN actions, handed whichever key
 * fired them, which is what makes four arrows and twenty-six letters two
 * bindings rather than thirty.
 *
 * **Nothing here reads the window.** The modifier bail, the focused-input guard
 * and skipping Enter when a `<button>` holds focus belong to the one
 * dispatcher: a pattern key never matches a modified chord, a keystroke aimed
 * at chat never reaches an action, and nothing on a play surface holds focus in
 * the first place. Dismissing feedback and leaving the turn viewer are their
 * own actions, and the dispatcher runs both ahead of these.
 *
 * Contrast `useCaptureKeys` (single-token entry, no cursor): this is the
 * board-cursor sibling, not a superset.
 */
export function useBoardCursorKeys({
  enabled,
  onArrow,
  onLetter,
  onBackspace,
  onToggle,
  onCommit,
  commit,
  canCommit,
}: BoardCursorKeysOptions): BoardCursorKeys {
  const state = () => (enabled ? 'active' : 'disabled')
  // For a key the board may not have at all.
  const stateIf = (has: unknown) => () => (has === undefined ? 'hidden' : state())

  useBoundAction('act-move-cursor', {
    describe: state,
    run: (key) => onArrow(key as ArrowKey),
  })

  useBoundAction('act-place-tile', {
    describe: stateIf(onLetter),
    run: (key) => onLetter?.((key ?? '').toUpperCase()),
  })

  useBoundAction('act-remove-tile', {
    describe: stateIf(onBackspace),
    run: () => onBackspace?.(),
  })

  useBoundAction('act-toggle-tile', {
    describe: stateIf(onToggle),
    run: () => onToggle?.(),
  })

  const actCommit = useBoundAction(commit, {
    describe: () => (enabled && (canCommit ?? true) ? 'active' : 'disabled'),
    run: onCommit,
  })

  return { actCommit }
}
