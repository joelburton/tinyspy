import { asUser, createConnectionsGame, type E2EClub, type E2EMember } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

/**
 * WordKnit (connections) gallery states (docs/testing.md → The screenshot gallery).
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

/**
 * Four DISTINCT wrong sets — one tile from each category, rotating which:
 * `[A0,B0,C0,D0]`, `[A1,B1,C1,D1]`, … Each is wrong by construction, and no
 * two are the same set, which matters because the server DEDUPS a repeated
 * (order-insensitive) tile set instead of counting it again. The old builder
 * submitted one wrong set four times — one mistake registered, the game never
 * left 'playing', and the lost cells were holes in the sheet for months.
 */
const WRONG_SETS = [0, 1, 2, 3].map((i) => CATEGORIES.map((c) => c[i]))

async function guess(
  member: E2EMember,
  gameId: string,
  tiles: string[],
  result: 'correct' | 'wrong',
  rank: number | null,
): Promise<void> {
  const res = await asUser(member.session.access_token)
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
    const viewer = club.members[0]
    const rival = club.members[1]
    if (cell.phase === 'mid') await guess(viewer, id, CATEGORIES[0], 'correct', 0)
    if (cell.phase === 'won') {
      for (let r = 0; r < CATEGORIES.length; r++) await guess(viewer, id, CATEGORIES[r], 'correct', r)
    }
    if (cell.phase === 'lost') {
      // Four mistakes eliminate a player. Coop shares one mistake budget, so
      // the viewer alone loses it; compete counts per player and the game only
      // ends when the LAST racer is eliminated — so the rival goes out too.
      for (const set of WRONG_SETS) await guess(viewer, id, set, 'wrong', null)
      if (cell.mode === 'compete') {
        for (const set of WRONG_SETS) await guess(rival, id, set, 'wrong', null)
      }
    }
    if (cell.phase === 'ended') await endGame(club, 'connections', id)

    return { gametype, id, viewer }
  },
}
