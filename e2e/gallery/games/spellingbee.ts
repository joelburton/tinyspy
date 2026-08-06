import { asUser, createSpellingbeeGame, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

/** These games are TRUSTING-COMMIT: the FE scores a word and sends the score
 *  with it, so the gallery has to do the same rather than pass a bare string. */
type Word = { word: string; points: number }

/**
 * FreeBee (spellingbee) gallery states (docs/gallery-plan.md).
 *
 * Moves go through `spellingbee.submit_word` on the same synthetic board the e2e
 * fixture builds, so every run photographs the same game.
 */
async function play(club: E2EClub, gameId: string, words: Word[]): Promise<void> {
  for (const w of words) {
    const res = await asUser(club.members[0].session.access_token)
      .schema('spellingbee')
      .rpc('submit_word', { target_game: gameId, word: w.word, points: w.points, is_pangram: false, is_bonus: false })
    // Reaching the target rank ENDS the game, so the remaining words come back
    // "not in progress" — which for a win-building path is the success signal,
    // not a failure. Stop there rather than submitting into a finished game.
    if (res.error?.message.includes('not in progress')) return
    if (res.error) throw new Error(`spellingbee.submit_word(${w.word}): ${res.error.message}`)
  }
}

/** The fixture's required list, with the score the FE would compute for each
 *  (7 letters = 17, 4 = 1, otherwise the length). Submitting all of it reaches
 *  100% of the board, so any target rank is passed — which beats guessing at
 *  the ladder's thresholds. */
const REQUIRED: Word[] = [
  'bead', 'beef', 'face', 'fade', 'cage', 'cafe', 'deaf', 'aged', 'bade', 'feed',
  'edge', 'abed', 'gabe', 'babe', 'dade', 'abef', 'abeg', 'abce', 'acef', 'aceg',
  'adef', 'adeg', 'afeg', 'bcef', 'bceg', 'bdef', 'bdeg', 'bfeg', 'faced', 'abcdefg',
].map((word) => ({ word, points: word.length === 7 ? 17 : word.length === 4 ? 1 : word.length }))

export const spellingbeeGallery: GameGallery = {
  game: 'spellingbee',
  brand: 'FreeBee',
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
    // Compete refuses to start without a target rank (it's the race's finish
    // line); coop is the open-ended hunt, so it's left unset there.
    const { id, gametype } = await createSpellingbeeGame(
      club,
      cell.mode,
      undefined,
      // A LOW target in both modes: the sheet wants the won screen, not a long
      // hunt, and rank 1 is one word away. Compete refuses to start without one.
      1,
    )
    if (cell.phase === 'mid') await play(club, id, REQUIRED.slice(0, 3))
    if (cell.phase === 'won') await play(club, id, REQUIRED)
    if (cell.phase === 'ended') await endGame(club, 'spellingbee', id)

    return { gametype, id, viewer: club.members[0] }
  },
}
