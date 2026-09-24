// cs-audited-board-cursor

import { useBoundAction } from '@/common/actions/useBoundAction'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { ArrowKey } from './gridCursor'

export type BoardCursorKeysOptions = {
  // May the caller act on keys right now? When false every action goes
  // DISABLED — the arrows, the letters, Backspace and the commit — and a
  // disabled action leaves the keystroke for whoever else wants it.
  enabled: boolean
  // Move the cursor. `moveCursor` may turn it onto the arrow's axis instead of
  // stepping.
  onArrow: (key: ArrowKey) => void
  // A typed A–Z letter, uppercased: place a tile for it at the cursor.
  onLetter: (letter: string) => void
  // Remove a tile, the one `planBackspace` picks.
  onBackspace: () => void
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
 * The shared **2-D board-cursor keyboard** for a game that types tiles onto a
 * grid: the arrow keys MOVE a cursor, an A–Z letter places a tile at it,
 * Backspace removes one, and the commit's keys make the move. What each of
 * those DOES is the game's, supplied as callbacks: which cells can be edited,
 * where a placed tile comes from, and what the move is.
 *
 * This owns the binding, as four bound actions — `act-move-cursor`,
 * `act-place-tile`, `act-remove-tile`, and the game's own commit. The arrows
 * and the letters are PATTERN actions, handed whichever key fired them, which
 * is what makes four arrows and twenty-six letters two bindings rather than
 * thirty.
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
  onCommit,
  commit,
  canCommit,
}: BoardCursorKeysOptions): BoardCursorKeys {
  const state = () => (enabled ? 'active' : 'disabled')

  useBoundAction('act-move-cursor', {
    describe: state,
    run: (key) => onArrow(key as ArrowKey),
  })

  useBoundAction('act-place-tile', {
    describe: state,
    run: (key) => onLetter((key ?? '').toUpperCase()),
  })

  useBoundAction('act-remove-tile', {
    describe: state,
    run: onBackspace,
  })

  const actCommit = useBoundAction(commit, {
    describe: () => (enabled && (canCommit ?? true) ? 'active' : 'disabled'),
    run: onCommit,
  })

  return { actCommit }
}
