// cs-blessed-feedback

import { useEffect, useRef } from 'react'
import type { FeedbackMessage } from './FeedbackMessage'
import type { FeedbackSlot } from './feedbackSlotStore'

/**
 * Narrate a peer's events into the global slot: watch an append-only stream
 * (a teammate's accepted word, an opponent's solve) and show a message for
 * each NEW one, never replaying the backlog that was already there when this
 * client loaded or remounted.
 *
 * Four things the caller decides:
 *   - `enabled` — the mode gate, `mode === 'coop'` or `=== 'compete'`;
 *   - `ready` — whether `items` holds the real backlog yet. Leave it alone
 *     unless the game loads its header and its rows in SEPARATE fetches, in
 *     which case pass "the rows have arrived once" or the backlog replays;
 *   - `keyOf` — what makes a peer event unique;
 *   - `messageFor` — the `FeedbackMessage` to show for it, or `null` to skip
 *     (your own action, or an event not worth surfacing).
 *
 * `keyOf` and `messageFor` are read through refs, so passing fresh closures
 * each render is fine: the effect re-runs only when `items` changes.
 *
 * For an event STREAM only. A signal read off a changing scalar — a rank
 * climbed, a `solved` flag flipping — is a delta detector rather than a
 * seen-set, and those stay hand-rolled in the games that need them.
 */
export function usePeerFeedback<T>({
  enabled,
  ready = true,
  items,
  keyOf,
  messageFor,
  globalFeedbackSlot,
}: {
  enabled: boolean
  // Whether `items` holds the real backlog yet. Defaults true (single-fetch
  // callers). Two-fetch hooks pass their "rows loaded once" flag so the seed
  // doesn't run against an empty pre-rows `items` and then replay the backlog.
  ready?: boolean
  items: readonly T[]
  keyOf: (item: T) => string
  // The message to show for a new peer event, or `null` to skip it.
  messageFor: (item: T) => FeedbackMessage | null
  globalFeedbackSlot: FeedbackSlot
}): void {
  // `seen` keys every event already accounted for; `null` means "not yet
  // bootstrapped" (distinct from an empty-but-seeded set).
  const seenRef = useRef<Set<string> | null>(null)
  // Read the callbacks through refs so a caller passing inline closures doesn't
  // re-run the effect every render — it should fire only when `items` changes.
  // Synced in a passive effect (never written during render — react-hooks/refs
  // forbids that); declared before the item-watching effect so the refs are
  // current when it reads them.
  const keyOfRef = useRef(keyOf)
  const messageForRef = useRef(messageFor)
  useEffect(function syncCallbackRefs() {
    keyOfRef.current = keyOf
    messageForRef.current = messageFor
  })

  useEffect(function narrateNewItems() {
    // Gate BEFORE seeding: don't seed until the game narrates this mode
    // (`enabled`) AND its backlog has actually arrived (`ready`), so the first
    // seed captures the real `items`. Seeding against the empty loading value
    // makes every row that follows look new, and the whole history replays as
    // a burst of pills.
    if (!enabled || !ready) return
    const key = keyOfRef.current
    if (seenRef.current === null) {
      // First loaded render: adopt the existing backlog silently.
      seenRef.current = new Set(items.map(key))
      return
    }
    const seen = seenRef.current
    for (const item of items) {
      const k = key(item)
      if (seen.has(k)) continue
      seen.add(k)
      const feedbackMsg = messageForRef.current(item)
      if (feedbackMsg) globalFeedbackSlot.show(feedbackMsg)
    }
  }, [enabled, ready, items, globalFeedbackSlot])
}
