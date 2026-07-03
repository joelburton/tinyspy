import type { GenericFeedbackMsg, GenericFeedbackTone } from '../../common/lib/games'

/**
 * connections's own-guess local-pill builder. Shared by BoardCol's guess dispatch
 * (Correct! / One away! / Incorrect, a dup, an RPC error) and PlayArea's info-column
 * actions (a failed End / Concede) — both write the same below-board local-feedback
 * channel, so both build the message the same way. See docs/games/connections.md.
 *
 * Outline + STICKY: an own-move result persists until the next move dismisses it (a
 * tile click routes through `clearLocalFeedback`).
 */
export const ownGuess = (tone: GenericFeedbackTone, text: string): GenericFeedbackMsg => ({
  tone,
  text,
  variant: 'outline',
  dismiss: { kind: 'sticky' },
})
