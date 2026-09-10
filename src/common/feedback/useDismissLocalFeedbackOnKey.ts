// cs-unmet

import { useBoundAction } from '../actions/useBoundAction'

/**
 * Dismiss the game's local feedback on ANY key — the "your next keystroke is your
 * next move" rule (docs/ui.md → Feedback pill (dismissal modes)), made universal so
 * even games with **no keyboard capture** (waffle, connections, codenamesduet
 * when not clueing) clear their own-move pill on a keypress, the same way the
 * capture games do.
 *
 * It binds `act-dismiss-feedback`, whose any-key wildcard does NOT consume the
 * keystroke — so the letter that clears a stale verdict still plays its move.
 * The dispatcher's gates come with it: a keystroke aimed at chat or a game input
 * never reaches here, so typing in chat can't wipe a game's feedback or the
 * other way round, and a modified chord isn't the player's next move.
 *
 * It deliberately does NOT know whether the game is over: `clearLocalFeedback`
 * is itself a no-op at terminal (terminal local feedback is permanent — see
 * `useLocalFeedback`'s `locked`), so the permanence is enforced in ONE place, not
 * re-checked here. Pass any `clearLocalFeedback` from `useLocalFeedback`.
 */
export function useDismissLocalFeedbackOnKey(clearLocalFeedback: () => void): void {
  useBoundAction('act-dismiss-feedback', {
    describe: () => 'active',
    run: clearLocalFeedback,
  })
}
