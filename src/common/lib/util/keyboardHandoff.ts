import type { KeyboardEvent } from 'react'

/**
 * Tab inside a floating panel's text field hands the keyboard back to the GAME.
 *
 * **Why this needs code at all.** "Focus the board" isn't something you can do:
 * every game reads its keys off `window`, and the shared dispatcher
 * (`useGlobalKeyHandler`, and crosswords' own listener) deliberately declines
 * while *any* text field is focused — otherwise typing "hello" into chat would
 * also spell it onto the board. So handing the keyboard back means having NO
 * field focused, and blurring is the whole move. It's the same one bananagrams
 * makes on a board pointer-down (`blurActiveField` in usePlayerBoard).
 *
 * Native Tab instead walks the page's focus order — out of the panel, onto the
 * header's User menu button, and from there into the browser's own chrome (the
 * URL bar). Typing at any of those stops reaches neither the panel nor the game,
 * which is the trap this closes.
 *
 * **Shift+Tab is left alone**, so the panel's own controls (its close ✕) stay
 * keyboard-reachable — a deliberate escape hatch, not an oversight.
 *
 * Used by the two panels you type into while a game is running: the club chat
 * box (`ChatBody`) and the game scratchpad (`GameScratchpad`). Coming back the
 * other way is `useAppShortcuts` — `/` focuses the chat entry from anywhere.
 *
 * @example
 *   <textarea onKeyDown={handOffKeyboardOnTab} … />
 */
export function handOffKeyboardOnTab(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== 'Tab' || e.shiftKey) return
  e.preventDefault()
  e.currentTarget.blur()
}
