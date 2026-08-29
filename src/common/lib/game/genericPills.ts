// cs-unmet

import type { GenericFeedbackMsg } from '../games'
import type { Envelope } from '../supabase/envelope'
import { notOkOutcome } from '../supabase/dbResult'

/**
 * Turning a server answer into a feedback message — the parts of one that the
 * ANSWER decides, for any surface that shows pills.
 *
 * `genericPills` rather than `localPills`: a **local** pill is specifically the
 * below-board one, about this player and this move, and that file's docstring
 * says so. This mapping serves the global header slot too, so it does not
 * belong in a file whose subject is narrower than its contents.
 */

/**
 * **How a `not-ok` looks and reads.** One function, because it is one mapping —
 * and the moment a single call can answer three ways, no call site can write it
 * by hand. `submit_guess` is the first: `ok`, a race, or a fault, from one
 * button. Fifteen boards deriving that separately would put back exactly the
 * drift `ERROR_COPY` was centralizing.
 *
 * Returns the answer's half of a message. The caller adds the two halves the
 * envelope cannot know:
 *
 *   mode  permanence is a property of the SURFACE, not of the answer — the same
 *         refusal is `sticky` below a board and `manual` in a dialog
 *   dot    peer identity, which is about who acted, not about what happened
 *
 *     if (res.type !== 'ok') {
 *       showLocalFeedback({ ...getNotOkFeedback(res), mode: { kind: 'manual' } })
 *       return
 *     }
 *
 * **A fault gets a pill here, not a modal**, which looks backwards for one
 * moment and isn't: by the time a call site reads the envelope, `runRpc` has
 * already fired the modal centrally, with the diagnostics only the transport
 * layer could supply (the call, the status, the elapsed ms). Setting
 * `fault: true` on this message would route it to `showFaultModal` a SECOND
 * time — a duplicate modal, and a poorer one, since nothing here can rebuild
 * that line. So the pill carries the same sentence the modal leads with, and it
 * is what the player still has after dismissing it.
 *
 * **There is deliberately no `ok` equivalent.** What a successful answer shows
 * is game-specific — a pangram's score, a word's length, nothing at all — and
 * no rule has been found there. An honest gap beats a shared helper guessing.
 */
export function getNotOkFeedback(
  envelope: Envelope & { type: 'not-ok' },
): Pick<GenericFeedbackMsg, 'tone' | 'text'> {
  return { tone: notOkOutcome(envelope), text: envelope.message }
}
