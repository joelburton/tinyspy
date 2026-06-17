import type { Member } from './games'

/**
 * Pure derivation: given the set of currently-connected user_ids
 * (from a realtime channel's presence state) and the expected
 * member list (from the club's roster), is the game paused?
 *
 * "Paused" is the transient gameplay-pause state — same UX as
 * a video player's pause: clock stops, no moves accepted, an
 * overlay shows. Triggers: someone disconnected (presence) OR
 * someone clicked the Pause button (manual; future). Distinct
 * from "suspended" (the club-level "this game isn't the active
 * one" concept — see docs/common.md → three-state lifecycle).
 *
 * This is a pure function rather than a hook because the
 * presence tracker has to live on the same realtime channel as
 * the game's other listeners (postgres_changes, broadcast) —
 * supabase-js requires all `.on()` calls to happen before
 * `.subscribe()`, so one hook owns the channel and attaches
 * every handler synchronously. That hook derives `presentUserIds`
 * via this helper.
 *
 * See docs/wordknit.md → "Pause on disconnect" for the wider
 * pattern, including the future rollout to tinyspy and
 * psychic-num. The pattern's storage shape is what migrates
 * to those games — they'll grow their own presence handler
 * on their own useGame channel and call this helper to compute
 * `{paused, missing}` the same way.
 */
export function computePause(
  presentUserIds: Set<string>,
  // Variable name is `players` because every call site is in a
  // game context (useCommonGame for wordknit today; the same
  // shape will roll out to tinyspy + psychic-num). See Member's
  // doc in `./games.ts` for the type-vs-variable naming rule.
  players: Member[],
): { paused: boolean; missing: Member[] } {
  const missing = players.filter((m) => !presentUserIds.has(m.user_id))
  const paused = players.length > 0 && missing.length > 0
  return { paused, missing }
}
