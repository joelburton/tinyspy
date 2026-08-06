import { asUser, createWordwheelGame, type E2EClub } from '../../helpers/fixtures'
import type { Cell, GameGallery } from '../types'

/** These games are TRUSTING-COMMIT: the FE scores a word and sends the score
 *  with it, so the gallery has to do the same rather than pass a bare string. */
type Word = { word: string; points: number }

/**
 * MooseWheel (wordwheel) gallery states (docs/gallery-plan.md).
 *
 * Moves go through `wordwheel.submit_word` on the same synthetic board the e2e
 * fixture builds, so every run photographs the same game.
 */
async function play(club: E2EClub, gameId: string, words: Word[]): Promise<void> {
  for (const w of words) {
    const res = await asUser(club.members[0].session.access_token)
      .schema('wordwheel')
      .rpc('submit_word', { target_game: gameId, word: w.word, points: w.points, is_pangram: false, is_bonus: false })
    if (res.error) throw new Error(`wordwheel.submit_word(${w.word}): ${res.error.message}`)
  }
}

export const wordwheelGallery: GameGallery = {
  game: 'wordwheel',
  brand: 'MooseWheel',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'three words found' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'three words found' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createWordwheelGame(club, cell.mode)
    if (cell.phase === 'mid') await play(club, id, [{ word: 'bead', points: 1 }, { word: 'beach', points: 5 }, { word: 'chafe', points: 5 }])
    return { gametype, id, viewer: club.members[0] }
  },
}
