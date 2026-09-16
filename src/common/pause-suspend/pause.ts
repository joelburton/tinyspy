// cs-blessed-pause-suspend

import type { Member } from '../members/member'

/**
 * Answers "is this game paused because somebody is missing?" — the presence
 * half of a pause, which `useCommonGame` then unions with the manual one.
 *
 * Pass the user ids realtime reports as connected on the game's channel, and
 * the players expected on it. Who is expected is the CALLER's call, and it is
 * this game's roster rather than the club's: a club of five can be playing a
 * two-player game, and the club list would report three people missing forever.
 * Who exactly is missing is not answered here — the overlay draws the whole
 * roster and marks each player present or away itself.
 *
 * Two edge cases the test pins, both of which show up in front of players: an
 * empty roster is NOT everyone missing (a fresh mount has no roster for a tick,
 * and would otherwise flash the overlay), and an id on the channel that is on
 * no roster is nobody (it can make the game neither more nor less paused).
 *
 * Paused is the transient gameplay stop — the clock stops, no moves are taken,
 * the overlay stands in for the board. It is not "suspended", which is about
 * whether the club is still looking at this game at all; docs/states.md →
 * paused defines both words and is the only place that does.
 */
export function computePause(presentUserIds: Set<string>, players: Member[]): boolean {
  return players.length > 0 && players.some((m) => !presentUserIds.has(m.user_id))
}
