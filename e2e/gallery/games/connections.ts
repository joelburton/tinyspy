import { asUser, createConnectionsGame, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

/**
 * WordKnit (connections) gallery states (docs/gallery-plan.md).
 *
 * connections is the FE-KNOWS game: the client holds the whole puzzle and
 * `submit_guess` is told the verdict rather than working it out, so a move here
 * passes the four tiles, the result, and the matched rank — exactly what the
 * board sends.
 *
 * The fixture's puzzle is four alphabetical categories (A/B/C/D words), so the
 * groups are constants rather than something to look up.
 */
const CATEGORIES: string[][] = [
  ['ALPHA', 'ANGEL', 'APPLE', 'ARROW'],
  ['BANANA', 'BIRCH', 'BREAD', 'BRICK'],
  ['CASTLE', 'CIRCLE', 'CLOUD', 'CROWN'],
  ['DAGGER', 'DELTA', 'DIAMOND', 'DRAGON'],
]

/** One tile from each category — wrong by construction, four times over. */
const WRONG = CATEGORIES.map((c) => c[0])

async function guess(
  club: E2EClub,
  gameId: string,
  tiles: string[],
  result: 'correct' | 'wrong',
  rank: number | null,
): Promise<void> {
  const res = await asUser(club.members[0].session.access_token)
    .schema('connections')
    .rpc('submit_guess', {
      target_game: gameId,
      tiles,
      result,
      matched_category_rank: rank,
    })
  if (res.error) throw new Error(`connections.submit_guess: ${res.error.message}`)
}

export const connectionsGallery: GameGallery = {
  game: 'connections',
  brand: 'WordKnit',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'one group found' },
    { mode: 'coop', phase: 'won', note: 'all four groups' },
    { mode: 'coop', phase: 'lost', note: 'four mistakes' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'one group found' },
    { mode: 'compete', phase: 'won', note: 'all four groups' },
    { mode: 'compete', phase: 'lost', note: 'four mistakes' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },

  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createConnectionsGame(club, cell.mode)
    if (cell.phase === 'mid') await guess(club, id, CATEGORIES[0], 'correct', 0)
    if (cell.phase === 'won') {
      for (let r = 0; r < CATEGORIES.length; r++) await guess(club, id, CATEGORIES[r], 'correct', r)
    }
    if (cell.phase === 'lost') {
      // The mistake budget is four; the same cross-category set each time is
      // wrong every time, which is all this needs.
      for (let i = 0; i < 4; i++) await guess(club, id, WRONG, 'wrong', null)
    }
    if (cell.phase === 'ended') await endGame(club, 'connections', id)

    return { gametype, id, viewer: club.members[0] }
  },
}
