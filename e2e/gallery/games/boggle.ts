import { asUser, createBoggleGame, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

/** These games are TRUSTING-COMMIT: the FE scores a word and sends the score
 *  with it, so the gallery has to do the same rather than pass a bare string. */
type Word = { word: string; points: number }

/**
 * MothCubes (boggle) gallery states (docs/gallery-plan.md).
 *
 * Moves go through `boggle.submit_word` on the same synthetic board the e2e
 * fixture builds, so every run photographs the same game.\n *\n * The fixture board is CATR in the top row, so 'cat' and 'art' are the two\n * short words it can spell.
 */
async function play(club: E2EClub, gameId: string, words: Word[]): Promise<void> {
  for (const w of words) {
    const res = await asUser(club.members[0].session.access_token)
      .schema('boggle')
      .rpc('submit_word', { target_game: gameId, word: w.word, points: w.points, is_bonus: false })
    if (res.error) throw new Error(`boggle.submit_word(${w.word}): ${res.error.message}`)
  }
}

export const boggleGallery: GameGallery = {
  game: 'boggle',
  brand: 'MothCubes',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'one word found' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'one word found' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },

  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createBoggleGame(club, cell.mode)
    if (cell.phase === 'mid') await play(club, id, [{ word: 'cat', points: 1 }])
    if (cell.phase === 'ended') await endGame(club, 'boggle', id)

    return { gametype, id, viewer: club.members[0] }
  },
}
