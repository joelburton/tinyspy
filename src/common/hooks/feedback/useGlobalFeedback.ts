import { useEffect, useRef } from 'react'
import type { GenericFeedbackApi, GenericFeedbackMsg } from '../../lib/games'

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
 * `items` holds the real backlog, the seed captures it, and nothing replays. On
 * a fresh game (`items` genuinely empty at load) the seed is an empty set, so the
 * peer's FIRST event is new and fires — fixing the opposite bug
 * (psychicnum/connections silently dropping it).
 *
 * **Two-fetch hooks need `ready`.** The above holds only when the game row and
 * its rows arrive in ONE fetch. The found-words hooks (spellingbee / wordwheel /
 * wordiply / boggle) load the immutable header in one fetch and the rows in a
 * SEPARATE realtime-refetch, so `enabled` (derived from the header) can flip true
 * while `items` (the rows) is still `[]` — the seed captures nothing and the
 * backlog replays. Such callers pass `ready` = "the rows have loaded at least
 * once", so the seed waits for the real backlog. Single-fetch callers leave
 * `ready` at its default `true` and are unaffected.
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
  ready = true,
  items,
  keyOf,
  messageFor,
  globalFeedback,
}: {
  enabled: boolean
  /** Whether `items` holds the real backlog yet. Defaults true (single-fetch
   *  callers). Two-fetch hooks pass their "rows loaded once" flag so the seed
   *  doesn't run against an empty pre-rows `items` and then replay the backlog. */
  ready?: boolean
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
  // Synced in a passive effect (never written during render — react-hooks/refs
  // forbids that); declared before the item-watching effect so the refs are
  // current when it reads them.
  const keyOfRef = useRef(keyOf)
  const messageForRef = useRef(messageFor)
  useEffect(() => {
    keyOfRef.current = keyOf
    messageForRef.current = messageFor
  })

  useEffect(() => {
    // Gate BEFORE seeding (the §1.1 fix): don't seed until the game narrates
    // this mode (`enabled`) AND its backlog has actually arrived (`ready`) — so
    // the first seed captures the real `items`, not the empty loading value or a
    // pre-rows-fetch snapshot (see the `ready` note in the header).
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
      const msg = messageForRef.current(item)
      if (msg) globalFeedback.show(msg)
    }
  }, [enabled, ready, items, globalFeedback])
}
