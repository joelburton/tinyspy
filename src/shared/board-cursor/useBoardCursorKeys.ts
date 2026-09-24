// cs-audited-board-cursor

import { useBoundAction } from '@/common/actions/useBoundAction'
import type { BoundAction } from '@/common/actions/useBoundAction'

export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

export type BoardCursorKeysOptions = {
  /**
   * May the caller act on keys right now? scrabble: `canPlace`; bananagrams: not
   * conceded/terminal. When false every one of these goes DISABLED — the arrows,
   * the letters, Backspace and the commit all stop, and a disabled action leaves
   * the keystroke for whoever else wants it.
   */
  enabled: boolean
  /** Move the board cursor (a perpendicular game may rotate first). */
  onArrow: (key: ArrowKey) => void
  /** A typed A–Z letter, uppercased — place it (bananagrams: from the hand;
   *  scrabble: stage it on the board). */
  onLetter: (letter: string) => void
  /** Backspace — remove the tile behind the cursor / the last staged one. */
  onBackspace: () => void
  /** The commit action for Enter (and Space in bananagrams, whose `act-peel`
   *  carries both): scrabble plays the staged word, bananagrams peels. The
   *  callback does its own "is it legal right now" check. */
  onEnter: () => void
  /** Which action the commit IS, since the two games commit different things:
   *  bananagrams peels, scrabble submits. Its keys come with it — Enter alone
   *  for a submit, Enter and Space for a peel. */
  commit: 'act-peel' | 'act-submit'
  /** May the commit fire right now? A NARROWER question than `enabled`: the
   *  cursor keys stay live while the move itself isn't available — bananagrams
   *  peels only once the hand is empty, scrabble plays only a staged word — and
   *  the same answer grays the button. Defaults to `enabled`. */
  canCommit?: boolean
}

/** What the caller gets back — the commit binding, to place as a button. The
 *  other three are keys with no control of their own: nothing on screen "is"
 *  the left arrow. */
export type BoardCursorKeys = {
  actCommit: BoundAction
}

/**
 * The shared **2-D board-cursor keyboard** for the tile-placement games
 * (bananagrams, scrabble). Both drive a cursor on a grid: the arrow keys MOVE it,
 * an A–Z letter places a tile at it, Backspace removes, Enter commits. They differ
 * only in the ~5% each supplies as callbacks — the per-cell edit rule (bananagrams:
 * every cell editable, type over any tile; scrabble: committed tiles are locked)
 * and what a letter / Enter *does* (place-from-hand + peel vs stage + play word).
 *
 * This owns the universal 95% as four bound actions — `act-move-cursor`,
 * `act-place-tile`, `act-remove-tile`, and the game's own commit. Three of them
 * are PATTERN actions, handed whichever key fired them, which is what makes four
 * arrows and twenty-six letters two bindings rather than thirty.
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
  onEnter,
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
    run: onEnter,
  })

  return { actCommit }
}
