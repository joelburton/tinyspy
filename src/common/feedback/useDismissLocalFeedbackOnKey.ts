// cs-audited-feedback

import { useBoundAction } from '../actions/useBoundAction'

/**
 * Dismiss the game's local feedback on ANY key — the "your next keystroke is your
 * next move" rule (docs/ui.md → Feedback pill), made universal so even games with
 * **no keyboard capture** (waffle, connections, codenamesduet when not clueing)
 * clear a `result` on a keypress, the same way the capture games do.
 *
 * It binds `act-dismiss-feedback`, whose any-key wildcard does NOT consume the
 * keystroke — so the letter that clears a stale verdict still plays its move.
 * The dispatcher's gates come with it: a keystroke aimed at chat or a game input
 * never reaches here, so typing in chat can't wipe a game's feedback or the
 * other way round, and a modified chord isn't the player's next move.
 *
 * It deliberately does NOT know what the slot is showing: the slot's `dismiss`
 * removes its top message only when that message's kind leaves by a gesture,
 * so a verdict, a hint or a not-ok survives the keystroke and the rule is
 * enforced in ONE place, not re-checked here. Pass the local slot's `dismiss`.
 */
export function useDismissLocalFeedbackOnKey(dismiss: () => void): void {
  useBoundAction('act-dismiss-feedback', {
    describe: () => 'active',
    run: dismiss,
  })
}
