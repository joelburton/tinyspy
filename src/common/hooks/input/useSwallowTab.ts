import { useGlobalKeyHandler } from './useGlobalKeyHandler'

/**
 * Tab does nothing while the board owns the keyboard.
 *
 * **The problem.** A game's play surface is not a form: there is no meaningful
 * "next field" to advance to. Left native, Tab walks the page's focus order —
 * onto the header buttons, then the info column's, then out of the document
 * entirely and into the browser's chrome (the URL bar). Nothing along that path
 * helps, and a player who tabbed by reflex is stranded somewhere their typing
 * no longer reaches the game.
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
 * Call it once per game, at the PlayArea level. Games built on `useCaptureKeys`
 * (boggle, spellingbee, wordle, wordwheel, wordiply, psychicnum) already get
 * this from that hook and don't need it; crosswords deliberately keeps Tab as
 * clue navigation.
 */
export function useSwallowTab(): void {
  useGlobalKeyHandler((e: KeyboardEvent) => {
    // Leave modified chords to the browser/OS — Ctrl-Tab switches browser tabs.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key !== 'Tab') return
    e.preventDefault()
  })
}
