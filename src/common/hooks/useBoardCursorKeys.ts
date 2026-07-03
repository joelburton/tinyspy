import { useGlobalKeyHandler } from './useGlobalKeyHandler'

export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

export type BoardCursorKeysOptions = {
  /**
   * May the caller act on keys right now? scrabble: `canPlace`; bananagrams: not
   * conceded/terminal. When false the arrows / letters / Backspace / Enter do
   * nothing — but `onAnyKey` still runs (feedback dismissal / viewer-exit fire
   * regardless of whether a move is legal).
   */
  enabled: boolean
  /** Move the board cursor (a perpendicular game may rotate first). */
  onArrow: (key: ArrowKey) => void
  /** A typed A–Z letter, uppercased — place it (bananagrams: from the hand;
   *  scrabble: stage it on the board). */
  onLetter: (letter: string) => void
  /** Backspace — remove the tile behind the cursor / the last staged one. */
  onBackspace: () => void
  /** The commit action for Enter (and Space when `enterOnSpace`): scrabble plays
   *  the staged word; bananagrams peels. The callback does its own "is it legal
   *  right now" check. */
  onEnter: () => void
  /** bananagrams: Space is also a peel shortcut. Default false (scrabble). */
  enterOnSpace?: boolean
  /** Runs on ANY key, after the modifier bail and before the `enabled` gate.
   *  Return `true` to CONSUME the key (stop here — e.g. scrabble uses this to exit
   *  its turn-viewer on the first keystroke). Also the place for feedback
   *  dismissal. Optional. */
  onAnyKey?: () => boolean | void
}

/**
 * The shared **2-D board-cursor keyboard** for the tile-placement games
 * (bananagrams, scrabble). Both drive a cursor on a grid: the arrow keys MOVE it,
 * an A–Z letter places a tile at it, Backspace removes, Enter commits. They differ
 * only in the ~5% each supplies as callbacks — the per-cell edit rule (bananagrams:
 * every cell editable, type over any tile; scrabble: committed tiles are locked)
 * and what a letter / Enter *does* (place-from-hand + peel vs stage + play word).
 *
 * This owns the universal 95%: the window listener via `useGlobalKeyHandler` (so
 * both inherit the focused-input guard — a keystroke aimed at chat never reaches
 * the board — and the once-registered listener), the modifier bail, mapping the
 * four arrows to `onArrow`, `[a-zA-Z]` to `onLetter`, Backspace/Enter to their
 * callbacks, and one shared nicety: **it skips Enter/Space when a `<button>` is
 * focused**, so a focused Submit/Peel button's native activation doesn't ALSO
 * fire the commit (a double). Contrast `useCaptureKeys` (single-token entry, no
 * cursor): this is the board-cursor sibling, not a superset.
 */
export function useBoardCursorKeys({
  enabled,
  onArrow,
  onLetter,
  onBackspace,
  onEnter,
  enterOnSpace = false,
  onAnyKey,
}: BoardCursorKeysOptions): void {
  useGlobalKeyHandler((e: KeyboardEvent) => {
    // Leave modified chords (Cmd-R, Ctrl-Tab, …) to the browser.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    // Any-key hook first — it may consume the key (e.g. exit a turn-viewer) and,
    // either way, dismiss feedback — and it runs even when a move isn't legal.
    if (onAnyKey?.() === true) return
    if (!enabled) return

    const k = e.key
    if (k === 'Enter' || (enterOnSpace && k === ' ')) {
      // A focused <button> already ran its native Enter/Space activation — don't
      // fire the commit a second time.
      if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return
      e.preventDefault()
      onEnter()
    } else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault()
      onArrow(k)
    } else if (k === 'Backspace') {
      e.preventDefault()
      onBackspace()
    } else if (k.length === 1 && /^[a-z]$/i.test(k)) {
      e.preventDefault()
      onLetter(k.toUpperCase())
    }
  })
}
