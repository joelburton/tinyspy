import { asUser, createStrandsGame, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import { timeOut } from '../timeOut'
import type { Cell, GameGallery } from '../types'

/**
 * PaulPath (strands) gallery states (docs/testing.md → The screenshot gallery).
 *
 * A strands move is a PATH, not a word — the board repeats letters, so a typed
 * string can't identify one. The fixture hands back every hidden word with its
 * coordinates, so the paths are already known and `submit_path` takes them
 * straight ([[r,c], …]).
 *
 * The theme words plus the spangram TILE the board exactly, which is why
 * finding them all IS the win — there's nothing left to find.
 */
async function trace(
  club: E2EClub,
  gameId: string,
  paths: Array<Array<[number, number]>>,
): Promise<void> {
  for (const path of paths) {
    const res = await asUser(club.members[0].session.access_token)
      .schema('strands')
      .rpc('submit_path', { target_game: gameId, path })
    if (res.error) throw new Error(`strands.submit_path: ${res.error.message}`)
  }
}

export const strandsGallery: GameGallery = {
  game: 'strands',
  brand: 'PaulPath',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'two words found' },
    { mode: 'coop', phase: 'won', note: 'board consumed' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'two words found' },
    { mode: 'compete', phase: 'won', note: 'fewest hints wins' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },

    { mode: 'compete', phase: 'lost', note: 'time ran out' },
    { mode: 'coop', phase: 'lost', note: 'time ran out' },

  ],

  async build(club: E2EClub, cell: Cell) {
    // (club, puzzleDate, mode) — the date sits between them.
    const { id, gametype, words } = await createStrandsGame(club, undefined, cell.mode)
    const paths = words.map((w) => w.coords)
    if (cell.phase === 'mid') await trace(club, id, paths.slice(0, 2))
    if (cell.phase === 'won') await trace(club, id, paths)
    if (cell.phase === 'lost') await timeOut(club, 'strands', id)
    if (cell.phase === 'ended') await endGame(club, 'strands', id)

    return { gametype, id, viewer: club.members[0] }
  },
}
