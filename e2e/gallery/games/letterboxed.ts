import { asUser, createLetterboxedGame, type E2EClub } from '../../helpers/fixtures'
import type { Cell, GameGallery } from '../types'

/**
 * letterboxed's gallery states (docs/gallery-plan.md).
 *
 * The fixture board is the synthetic `abcdefghijkl` the e2e tests use, so every
 * run photographs the SAME board — two runs are comparable, which is the point
 * of committing the output.
 *
 * Its seeded pair `adgjbehk` + `kcfil` chains and covers all twelve letters, so
 * a win is two RPC calls rather than a hunt.
 */
async function play(club: E2EClub, gameId: string, words: string[]): Promise<void> {
  for (const w of words) {
    const res = await asUser(club.members[0].session.access_token)
      .schema('letterboxed')
      .rpc('submit_word', { target_game: gameId, submitted: w })
    if (res.error) throw new Error(`letterboxed.submit_word(${w}): ${res.error.message}`)
  }
}

export const letterboxedGallery: GameGallery = {
  game: 'letterboxed',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'one word played' },
    { mode: 'coop', phase: 'won', note: 'all twelve covered' },
    { mode: 'coop', phase: 'lost', note: 'timed out' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'one word played' },
    { mode: 'compete', phase: 'won', note: 'first to cover' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createLetterboxedGame(club, cell.mode)
    const viewer = club.members[0]

    if (cell.phase === 'mid') await play(club, id, ['adg'])
    if (cell.phase === 'won') await play(club, id, ['adgjbehk', 'kcfil'])
    if (cell.phase === 'lost') {
      // A coop loss is the clock running out short of twelve — one word played,
      // then the timeout resolution. `submit_timeout` is the same RPC the FE's
      // timer fires, so the status blob and verdict are the real ones.
      await play(club, id, ['adg'])
      const res = await asUser(viewer.session.access_token)
        .schema('letterboxed')
        .rpc('submit_timeout', { target_game: id })
      if (res.error) throw new Error(`letterboxed.submit_timeout: ${res.error.message}`)
    }

    return { gametype, id, viewer }
  },
}
