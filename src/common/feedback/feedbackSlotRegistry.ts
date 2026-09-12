// cs-audited-feedback

import { FeedbackMessage, KINDS, type Kind } from './FeedbackMessage'
import type { FeedbackSlot, SlotEntry, SlotName } from './feedbackSlotStore'

/**
 * Which slots are mounted right now, by name — so a console trigger and a
 * test can reach the live instance without a handle being threaded to them.
 *
 * A slot lives in its host (`useFeedbackSlot`), which registers it on mount
 * and drops it on unmount; the app has at most one `local` and one `global`
 * mounted at a time, so a name is enough. Nothing in the app reads this to
 * SHOW feedback — a call site holds its slot — it exists for `puppill` and
 * `peekFeedbackSlotForTest`.
 */

const mounted = new Map<SlotName, FeedbackSlot>()

/** Register a mounted slot under its name; returns the unregister. */
export function registerFeedbackSlot(slot: FeedbackSlot): () => void {
  mounted.set(slot.name, slot)
  return () => {
    if (mounted.get(slot.name) === slot) mounted.delete(slot.name)
  }
}

/** Test seam: the live entries of a mounted slot, lowest rank first — or
 *  `[]` when no such slot is mounted. For asserting "this went to the local
 *  slot at this rank" without reaching into the rendered pill. */
export function peekFeedbackSlotForTest(name: SlotName): readonly SlotEntry[] {
  return mounted.get(name)?.peek() ?? []
}

/**
 * Hand trigger: put a feedback message up from the browser console —
 * `puppill()` for a canned result under the board, `puppill('hey')` for your
 * own words, `puppill('hey', 'hint')` to see a kind, `puppill('hey', 'peer',
 * 'global')` to aim at the header. The twin of `window.puptoast()`, and for
 * the same reason: every real message needs a real event behind it, so there
 * is no honest UI path to one on demand. Returns the id, for
 * `pupretract(id)`.
 */
declare global {
  interface Window {
    puppill?: (text?: string, kind?: Kind, slot?: SlotName) => string | undefined
    pupretract?: (id: string, slot?: SlotName) => void
  }
}

const CANNED: Record<Kind, (text: string) => FeedbackMessage> = {
  notOk: (text) => FeedbackMessage.result('error', text, { ...KINDS.notOk }),
  terminalVerdict: (text) =>
    FeedbackMessage.terminalVerdict({ pillText: text, infoColText: text, outcome: 'won' }),
  standingState: (text) => FeedbackMessage.standingState('lost', text),
  result: (text) => FeedbackMessage.result('lost', text),
  acknowledgment: (text) => FeedbackMessage.acknowledgment('neutral', text),
  hint: (text) => FeedbackMessage.hint('noted', text),
  // Builds its own words from the member, so the console's text is ignored.
  waiting: () => FeedbackMessage.waiting({ username: 'moth', color: 'green' }),
  standingNote: (text) => FeedbackMessage.note(text),
  prompt: (text) => FeedbackMessage.prompt(text),
  chat: (text) => FeedbackMessage.chat({ username: 'moth', color: 'green' }, text),
  peer: (text) => FeedbackMessage.peer({ username: 'moth', color: 'green' }, 'won', text),
  peerStatus: (text) => FeedbackMessage.peerStatus({ username: 'moth', color: 'green' }, text),
}

// Installed in production too, not only in dev, for the reason its twin
// `window.puptoast` gives.
window.puppill = (text = 'A hand-triggered test message (window.puppill).', kind = 'result', slot = 'local') => {
  const target = mounted.get(slot)
  if (target === undefined) {
    console.warn(`puppill: no '${slot}' feedback slot is mounted`)
    return undefined
  }
  return target.show(CANNED[kind](text))
}
window.pupretract = (id, slot = 'local') => mounted.get(slot)?.retract(id)
