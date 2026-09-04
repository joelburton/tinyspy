// cs-blessed-game-lib

import type { Member } from '../members/member'

/**
 * Pure derivation: given the set of currently-connected user_ids
 * (from a realtime channel's presence state) and the players
 * expected to be present, is the game paused?
 *
 * Expected means THIS GAME's roster, not the club's — a club of
 * five can be running a two-player game, so the club list would
 * report three people missing forever. `useCommonGame` passes
 * `common.game_players` for the game, minus anyone who conceded;
 * why a conceder stops counting is argued at that call site.
 *
 * "Paused" is the transient gameplay-pause state — same UX as
 * a video player's pause: clock stops, no moves accepted, an
 * overlay shows. Triggers: someone disconnected (presence) OR
 * someone clicked the Pause button (manual). Distinct from
 * "suspended" (the club-level "this game isn't the active
 * one" concept).
 *
 * This is a pure function rather than a hook because the
 * presence tracker has to live on the same realtime channel as
 * the game's other listeners (postgres_changes, broadcast) —
 * supabase-js requires all `.on()` calls to happen before
 * `.subscribe()`, so one hook owns the channel and attaches
 * every handler synchronously. That hook derives `presentUserIds`
 * via this helper.
 *
 * Both words — paused, suspended — are defined once in
 * docs/states.md → paused, which also holds the wider pattern: the
 * two trigger sources, the overlay and its two escapes, and why a
 * paused game and a suspended one can never be the same game.
 */
export function computePause(
  presentUserIds: Set<string>,
  players: Member[],
): { paused: boolean; missing: Member[] } {
  const missing = players.filter((m) => !presentUserIds.has(m.user_id))
  const paused = players.length > 0 && missing.length > 0
  return { paused, missing }
}
