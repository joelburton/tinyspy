import { useEffect, useRef } from 'react'
import type { GenericFeedbackApi, GenericFeedbackMsg } from '../lib/games'

/**
 * The shared **peer-narration machinery** for the global feedback area: watch an
 * append-only stream of peer events (a teammate's accepted guess, an opponent's
 * solve) and fire a header pill for each NEW one — without replaying the backlog
 * that already existed when this client loaded or remounted.
 *
 * Every coop/compete game narrated peers by hand-rolling the same "seen-set
 * bootstrap": a `Set` of already-accounted-for keys, seeded silently on first
 * load. Five copies drifted, and the seed *timing* was wrong in three of them
 * (see docs/peer-feedback-audit.md → §1.1). This owns the one correct bootstrap.
 *
 * **The correct bootstrap — gate BEFORE you seed.** The bug was seeding the ref
 * on the first effect run, which happens while the game is still loading and
 * `items` is `[]`: the seed captures an empty set, then the real backlog arrives
 * and every row looks "new", so the whole history replays as a burst of pills.
 * The fix: return early when `!enabled` *before* touching the ref, so the seed
 * runs on the first render where the game is actually loaded — at which point
 * `items` holds the real backlog (game row + its rows arrive in one fetch), the
 * seed captures it, and nothing replays. On a fresh game (`items` genuinely
 * empty at load) the seed is an empty set, so the peer's FIRST event is new and
 * fires — fixing the opposite bug (psychicnum/connections silently dropping it).
 *
 * `enabled` is the mode gate (e.g. `mode === 'coop'`, or `=== 'compete'` for a
 * solve stream). `keyOf` identifies a peer event uniquely; `messageFor` returns
 * the pill to fire, or `null` to skip it (own actions, or an event that isn't
 * worth surfacing). `keyOf`/`messageFor` are read through refs, so callers may
 * pass fresh closures each render without re-running the effect — it re-runs
 * only when `items` (or `enabled`) actually changes.
 *
 * This is the coop *event-stream* flavor. Compete *state-transition* signals
 * that read a threat level off a changing scalar (rank climbs, milestone flips)
 * are a genuinely different mechanism — a delta detector, not a seen-set — and
 * stay hand-rolled (docs/peer-feedback-audit.md → bucket B).
 */
export function useGlobalFeedback<T>({
  enabled,
  items,
  keyOf,
  messageFor,
  globalFeedback,
}: {
  enabled: boolean
  items: readonly T[]
  keyOf: (item: T) => string
  /** The pill to fire for a new peer event, or `null` to skip it. */
  messageFor: (item: T) => GenericFeedbackMsg | null
  globalFeedback: GenericFeedbackApi
}): void {
  // `seen` keys every event already accounted for; `null` means "not yet
  // bootstrapped" (distinct from an empty-but-seeded set).
  const seenRef = useRef<Set<string> | null>(null)
  // Read the callbacks through refs so a caller passing inline closures doesn't
  // re-run the effect every render — it should fire only when `items` changes.
  const keyOfRef = useRef(keyOf)
  keyOfRef.current = keyOf
  const messageForRef = useRef(messageFor)
  messageForRef.current = messageFor

  useEffect(() => {
    // Gate BEFORE seeding (the §1.1 fix): if the game isn't loaded / this mode
    // doesn't narrate, don't seed — so the first seed happens once `items` is
    // real, not while it's still the empty loading value.
    if (!enabled) return
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
      const msg = messageForRef.current(item)
      if (msg) globalFeedback.show(msg)
    }
  }, [enabled, items, globalFeedback])
}
