import type { GenericFeedbackMsg } from '../../common/lib/games'

/**
 * Build wordle's own-move local pill: outline (transient) + STICKY — it sits in the
 * local feedback slot under the board until the player's next keypress dismisses it
 * (the typed letters stay on the board so they can fix the guess). Tone is per case:
 * `error` for an invalid / failed guess (not a real word, an RPC error), `warning`
 * for a non-error nudge ("already guessed", "not enough letters").
 *
 * Shared by both columns' handlers — BoardCol's guess dispatch (soft rejects / RPC
 * errors) AND PlayArea's End / Concede (RPC errors) — since the below-board feedback
 * channel is written by both (like psychicnum's `ownMove`). See
 * docs/playarea-decomposition-plan.md.
 */
export const localPill = (tone: 'warning' | 'error', text: string): GenericFeedbackMsg => ({
  tone,
  text,
  variant: 'outline',
  dismiss: { kind: 'sticky' },
})
