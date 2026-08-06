import { asUser, createWordiplyGame, type E2EClub } from '../../helpers/fixtures'
import type { Cell, GameGallery } from '../types'

/**
 * WordWire (wordiply) gallery states (docs/gallery-plan.md).
 *
 * Moves go through `wordiply.submit_guess` on the same synthetic board the e2e
 * fixture builds, so every run photographs the same game.\n *\n * The base is `ar`, so every guess has to contain it — the fixture's legal\n * list is bar / car / arc / arts / cars / scar / stars / hangars.
 */
async function play(club: E2EClub, gameId: string, words: string[]): Promise<void> {
  for (const w of words) {
    const res = await asUser(club.members[0].session.access_token)
      .schema('wordiply')
      .rpc('submit_guess', { target_game: gameId, word: w, fe_legal: true })
    if (res.error) throw new Error(`wordiply.submit_guess(${w}): ${res.error.message}`)
  }
}

export const wordiplyGallery: GameGallery = {
  game: 'wordiply',
  brand: 'WordWire',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'two guesses in' },
    // Coop has no win or loss to reach — see docs/games/wordiply.md → Deferred.
    { mode: 'coop', phase: 'ended', note: 'five guesses spent' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'two guesses in' },
    { mode: 'compete', phase: 'won', note: 'best length score' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createWordiplyGame(club, cell.mode)
    if (cell.phase === 'mid') await play(club, id, ['bar', 'scar'])
    // Five guesses is the whole budget, so this reaches the terminal in both
    // modes — neutral in coop, the comparator's winner in compete. `hangars`
    // is the board's longest word, so the viewer is the one who took it.
    if (cell.phase === 'ended' || cell.phase === 'won') {
      await play(club, id, ['bar', 'car', 'arc', 'arts', 'hangars'])
    }
    return { gametype, id, viewer: club.members[0] }
  },
}
