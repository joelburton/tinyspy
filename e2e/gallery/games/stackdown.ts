import { asUser, createStackdownGame, seedStackdownFirstWord, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import { timeOut } from '../timeOut'
import type { Cell, GameGallery } from '../types'

/**
 * StackDown (stackdown) gallery states (docs/testing.md → The screenshot gallery).
 *
 * `seedStackdownFirstWord` clears the first of the stack's six words through
 * the real `submit_word` — a tile-id path rather than a typed string, since a
 * stackdown move IS a set of tiles.
 *
 * Clearing the whole stack is the remaining five sequences. They come from the
 * pgTAP fixture (supabase/tests/stackdown/setup.psql), which pins the same
 * board — a stackdown move is a set of TILES, and the board's words can only be
 * taken in solution order, so these are the only five that work.
 */
/** The fixture board's six words, as the tile ids that spell them, in the order
 *  the stack allows them to be taken. */
const SEQUENCES: number[][] = [
  [19, 11, 15, 24, 10], // EAGLE
  [6, 20, 5, 2, 0], //     TABLE
  [7, 12, 16, 3, 8], //    PLANS
  [1, 18, 25, 14, 9], //   APPLE
  [23, 22, 26, 4, 28], //  JUICE
  [17, 21, 27, 29, 13], // LEMON
]
export const stackdownGallery: GameGallery = {
  game: 'stackdown',
  brand: 'StackDown',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'one word cleared' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'one word cleared' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },

    { mode: 'compete', phase: 'won', note: 'first to clear' },
    { mode: 'compete', phase: 'lost', note: 'time ran out' },
    { mode: 'coop', phase: 'won', note: 'stack cleared' },
    { mode: 'coop', phase: 'lost', note: 'time ran out' },

  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createStackdownGame(club, cell.mode)
    // The seed pins the fixture board AND clears the first word, so every path
    // below starts from it — including the win, which just carries on.
    if (cell.phase !== 'fresh') await seedStackdownFirstWord(club.members[0], id)
    if (cell.phase === 'won') {
      for (const tileIds of SEQUENCES.slice(1)) {
        const res = await asUser(club.members[0].session.access_token)
          .schema('stackdown')
          .rpc('submit_word', { target_game: id, tile_ids: tileIds })
        if (res.error) throw new Error(`stackdown.submit_word: ${res.error.message}`)
      }
    }
    if (cell.phase === 'lost') await timeOut(club, 'stackdown', id)
    if (cell.phase === 'ended') await endGame(club, 'stackdown', id)

    return { gametype, id, viewer: club.members[0] }
  },
}
