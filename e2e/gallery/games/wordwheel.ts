import { asUser, createWordwheelGame, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
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
    // Reaching the target rank ENDS the game, so the remaining words come back
    // "not in progress" — which for a win-building path is the success signal,
    // not a failure. Stop there rather than submitting into a finished game.
    if (res.error?.message.includes('not in progress')) return
    if (res.error) throw new Error(`wordwheel.submit_word(${w.word}): ${res.error.message}`)
  }
}

/** The fixture's required list with the FE's scores: ten four-letter words at
 *  1, five five-letter at 5, and the nine-letter pangram at 9 + 15. */
const REQUIRED: Word[] = [
  ...['bead', 'face', 'fade', 'cafe', 'deaf', 'abed', 'chef', 'dice', 'hade', 'bice'].map(
    (word) => ({ word, points: 1 }),
  ),
  ...['beach', 'chafe', 'fiche', 'abide', 'ached'].map((word) => ({ word, points: 5 })),
  { word: 'abcdefghi', points: 24 },
]

export const wordwheelGallery: GameGallery = {
  game: 'wordwheel',
  brand: 'MooseWheel',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'three words found' },
    { mode: 'coop', phase: 'won', note: 'target rank reached' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'three words found' },
    { mode: 'compete', phase: 'won', note: 'first to the rank' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },

  ],

  async build(club: E2EClub, cell: Cell) {
    // A low target rank in both modes: the sheet wants the won screen, not a
    // long hunt. Compete refuses to start without one.
    const { id, gametype } = await createWordwheelGame(club, cell.mode, undefined, 1)
    if (cell.phase === 'mid') await play(club, id, REQUIRED.slice(0, 3))
    if (cell.phase === 'won') await play(club, id, REQUIRED)
    if (cell.phase === 'ended') await endGame(club, 'wordwheel', id)

    return { gametype, id, viewer: club.members[0] }
  },
}
