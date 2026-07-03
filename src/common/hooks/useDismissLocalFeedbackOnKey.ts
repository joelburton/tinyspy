import { useGlobalKeyHandler } from './useGlobalKeyHandler'

/**
 * Dismiss the game's local feedback on ANY key — the "your next keystroke is your
 * next move" rule (docs/design-decisions.md → Dismissal modes), made universal so
 * even games with **no keyboard capture** (waffle, connections, codenamesduet
 * when not clueing) clear their own-move pill on a keypress, the same way the
 * capture games do.
 *
 * It rides `useGlobalKeyHandler`, so it inherits the two things that keep this
 * safe:
 *   - the **focused-input guard** — a keystroke aimed at chat or a game input
 *     never reaches here, so typing in chat can't wipe a game's feedback and
 *     vice-versa;
 *   - the **once-registered** window listener.
 * It only adds the modifier bail (Cmd-R / Ctrl-C aren't a "move").
 *
 * It deliberately does NOT know whether the game is over: `clearLocalFeedback`
 * is itself a no-op at terminal (terminal local feedback is permanent — see
 * `useLocalFeedback`'s `locked`), so the permanence is enforced in ONE place, not
 * re-checked here. Pass any `clearLocalFeedback` from `useLocalFeedback`.
 */
export function useDismissLocalFeedbackOnKey(clearLocalFeedback: () => void): void {
  useGlobalKeyHandler((e: KeyboardEvent) => {
    // A modified chord isn't the player's next move — leave it to the browser/OS.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    clearLocalFeedback()
  })
}
