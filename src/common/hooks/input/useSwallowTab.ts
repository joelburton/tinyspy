import { useGlobalKeyHandler } from './useGlobalKeyHandler'

/**
 * Tab does nothing on a surface that navigates by cursor rather than by focus.
 *
 * **The problem.** A game's play surface is not a form: there is no meaningful
 * "next field" to advance to. Left native, Tab walks the page's focus order —
 * onto the header buttons, then the info column's, then out of the document
 * entirely and into the browser's chrome (the URL bar). Nothing along that path
 * helps, and a player who tabbed by reflex is stranded somewhere their typing
 * no longer reaches the game. The same is true of the club-list page, where
 * Up/Down + Enter are the keyboard story and Tab only leads away from it.
 *
 * **The rule**, matching what `useCaptureKeys` has always done for the games
 * with a text entry: swallow Tab (and Shift+Tab) outright, but let modified
 * chords through so the browser keeps `Ctrl-Tab`, `Cmd-Tab`, and friends.
 *
 * **Scope comes for free** from `useGlobalKeyHandler`, which never dispatches a
 * keystroke aimed at a focused text field or at anything inside a
 * `[data-floating-panel]`. So this only fires when the *board* has the keyboard:
 * a setup form, a confirm dialog, chat and the scratchpad all keep their own Tab
 * — and chat/scratchpad deliberately use Tab to hand the keyboard BACK to the
 * game (`handOffKeyboardOnTab`).
 *
 * An open `<Menu>` is covered too, by its own means: it `stopPropagation()`s
 * every key while open (and while its trigger has focus), so a window-level
 * listener never sees them — that's what keeps Tab-closes-the-menu working.
 *
 * Call it once per surface. Games built on `useCaptureKeys` (boggle,
 * spellingbee, wordle, wordwheel, wordiply, psychicnum) already get this from
 * that hook and don't need it; crosswords deliberately keeps Tab as clue
 * navigation. Callers today: the five window-key games' PlayAreas, and
 * `HomePage` (whose club list is arrow-driven — see docs/ui.md → ClubPage).
 */
export function useSwallowTab(): void {
  useGlobalKeyHandler((e: KeyboardEvent) => {
    // Leave modified chords to the browser/OS — Ctrl-Tab switches browser tabs.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key !== 'Tab') return
    e.preventDefault()
  })
}
