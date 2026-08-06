import { execFileSync } from 'node:child_process'
import type { E2EClub, E2EMember } from '../helpers/fixtures'

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/**
 * The seat that won (or lost) a finished game.
 *
 * A compete terminal hands out both verdicts at once — the `won` and `lost`
 * tiles are the SAME game photographed from two chairs — so the builder has to
 * pick a chair. Hard-coding "member 0 won" is a guess that the scoring happens
 * to reward whoever the fixture had move first, and scrabble is a standing
 * counter-example: the end-of-game rack penalty can hand the win to the player
 * who scored less on the board.
 *
 * So ask the game. `common.game_players.result` is where every `end_game` writes
 * its per-player verdict, whatever the game's own idea of winning is, which
 * makes this the one lookup that works for all fifteen.
 *
 * Falls back to the first member if nothing matches, so a game with no verdict
 * to give still produces a screenshot rather than an exception.
 */
export function seatWithVerdict(club: E2EClub, gameId: string, won: boolean): E2EMember {
  const ids = execFileSync(
    'psql',
    [
      LOCAL_DB,
      '-X',
      '-tA',
      '-c',
      `select user_id from common.game_players
        where game_id = '${gameId}' and coalesce((result->>'won')::boolean, false) = ${won};`,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
  return club.members.find((m) => ids.includes(m.userId)) ?? club.members[0]
}
