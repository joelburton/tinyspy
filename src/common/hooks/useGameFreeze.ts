import type { SetupMember } from '../lib/games'

/**
 * Pure derivation: given the set of currently-connected user_ids
 * (from a realtime channel's presence state) and the expected
 * member list (from the club's roster), is the game frozen?
 *
 * "Frozen" means a peer is missing — game stays open and active
 * at the club level, but the UI renders a `FrozenOverlay` and
 * blocks clicks. Distinct from "paused" (which is the existing
 * club-level "not the active game" concept).
 *
 * This is a pure function rather than a hook because the
 * presence tracker has to live on the same realtime channel as
 * the game's other listeners (postgres_changes, broadcast) —
 * supabase-js requires all `.on()` calls to happen before
 * `.subscribe()`, so one hook owns the channel and attaches
 * every handler synchronously. That hook derives `presentUserIds`
 * via this helper.
 *
 * See docs/wordknit.md → "Freeze on disconnect" for the wider
 * pattern, including the future rollout to tinyspy and
 * psychic-num. The pattern's storage shape is what migrates
 * to those games — they'll grow their own presence handler
 * on their own useGame channel and call this helper to compute
 * `{frozen, missing}` the same way.
 */
export function computeFreeze(
  presentUserIds: Set<string>,
  members: SetupMember[],
): { frozen: boolean; missing: SetupMember[] } {
  const missing = members.filter((m) => !presentUserIds.has(m.user_id))
  const frozen = members.length > 0 && missing.length > 0
  return { frozen, missing }
}
