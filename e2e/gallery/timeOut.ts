import { asUser, type E2EClub } from '../helpers/fixtures'

/**
 * Run the clock out — the loss most games share.
 *
 * Every one of the fifteen exposes `submit_timeout`, the RPC the FE fires when
 * a countdown hits zero, and it resolves the game the way that game resolves an
 * unfinished one: a coop table that didn't get there loses, a race ranks
 * whoever got furthest. It doesn't require the game to have been created WITH a
 * timer — it's the resolution, not the clock — which is what makes it usable
 * here.
 *
 * So for most games a loss is "play a little, then let time run out", which is
 * also the most honest loss they have: the alternative, conceding, is shell
 * behaviour that looks identical everywhere (docs/testing.md → The screenshot gallery).
 */
export async function timeOut(club: E2EClub, schema: string, gameId: string): Promise<void> {
  const res = await asUser(club.members[0].session.access_token)
    .schema(schema)
    .rpc('submit_timeout', { target_game: gameId })
  if (res.error) throw new Error(`${schema}.submit_timeout: ${res.error.message}`)
}
