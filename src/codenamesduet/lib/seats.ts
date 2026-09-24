// cs-blessed-codenamesduet

import type { Member } from '@/common/members/member'
import type { Seat } from './phase'

/**
 * One of the game's two seated players: the shared `Member` plus the
 * `seat` they hold. Seat A gives the first clue; after that the seat on
 * the game row's `current_clue_giver` gives it.
 */
export type Player = Member & {
  seat: Seat
}

/**
 * The two seated players, A then B: the game row's seat ids, dressed in the
 * profiles the shell already holds for this game's players (`GamePageCtx`'s
 * `players`). Null when either id is not among them, which `create_game`
 * never produces — the loader treats it as no game to draw.
 */
export function seatPlayers(
  seats: { user_a_id: string; user_b_id: string },
  players: Member[],
): Player[] | null {
  const byId = new Map(players.map((p) => [p.user_id, p]))
  const a = byId.get(seats.user_a_id)
  const b = byId.get(seats.user_b_id)
  if (!a || !b) return null
  return [
    { user_id: a.user_id, username: a.username, color: a.color, seat: 'A' },
    { user_id: b.user_id, username: b.username, color: b.color, seat: 'B' },
  ]
}
