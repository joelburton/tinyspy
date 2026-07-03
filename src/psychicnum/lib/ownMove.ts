import type { GenericFeedbackMsg, GenericFeedbackTone } from '../../common/lib/games'

/**
 * psychicnum's own-move local-pill builder + the sentence-case helper it leans on.
 * Shared by BoardCol's guess dispatch (Correct / Incorrect / a rejected guess) and
 * PlayArea's info-column actions (a failed Hint / Reveal / End / Concede) — both
 * write the same below-board local-feedback channel, so both build the message the
 * same way. See docs/games/psychicnum.md → Feedback.
 */

/** Sentence-case a message's first letter. Server errors come back lowercase
 *  (`'setup.guesses is required'`); local feedback should read as a sentence. */
export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Build the own-move local pill: outline + STICKY (persists until the next move
 *  dismisses it — a keystroke / tile click routed through `clearLocalFeedback`). */
export const ownMove = (tone: GenericFeedbackTone, text: string): GenericFeedbackMsg => ({
  tone,
  text,
  variant: 'outline',
  dismiss: { kind: 'sticky' },
})
