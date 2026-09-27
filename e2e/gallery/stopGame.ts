// cs-unmet

import { asUser, type E2EClub } from '../helpers/fixtures'

/**
 * Stop a game by agreement — the neutral `ended` terminal.
 *
 * Every game exposes its own `stop_game(target_game)`: the group deciding to
 * stop, which is a different screen from winning or losing and the reason
 * `ended` has a column of its own. The RPC composes each game's own status
 * blob, which is why this goes through it rather than writing the row.
 *
 * Shared because it is byte-identical fifteen times over — the only thing that
 * varies is the schema name.
 */
export async function stopGame(club: E2EClub, schema: string, gameId: string): Promise<void> {
  const res = await asUser(club.members[0].session.access_token)
    .schema(schema)
    .rpc('stop_game', { target_game: gameId })
  if (res.error) throw new Error(`${schema}.stop_game: ${res.error.message}`)
}
