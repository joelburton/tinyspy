import { asUser, createWaffleGame, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

/**
 * SyrupSwap (waffle) gallery states (docs/testing.md → The screenshot gallery).
 *
 * The fixture's scramble differs from its solution by ONE transposition (the
 * first two cells), with `par_swaps: 1` — so a win is a single `submit_swap` of
 * positions 0 and 1, and any OTHER swap is a wrong move that leaves the board
 * mid-game. That makes both terminal and mid-game states one RPC each.
 */
async function swap(club: E2EClub, gameId: string, a: number, b: number): Promise<void> {
  const res = await asUser(club.members[0].session.access_token)
    .schema('waffle')
    .rpc('submit_swap', { target_game: gameId, pos_a: a, pos_b: b })
  if (res.error) throw new Error(`waffle.submit_swap(${a},${b}): ${res.error.message}`)
}

export const waffleGallery: GameGallery = {
  game: 'waffle',
  brand: 'SyrupSwap',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'one wrong swap' },
    { mode: 'coop', phase: 'won', note: 'solved in one swap' },
    { mode: 'coop', phase: 'lost', note: 'swaps spent unsolved' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'one wrong swap' },
    { mode: 'compete', phase: 'won', note: 'first to solve' },
    { mode: 'compete', phase: 'lost', note: 'swaps spent unsolved' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },

  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createWaffleGame(club, cell.mode)
    // 2↔3 is a legal but unhelpful swap: it moves the board without solving it.
    if (cell.phase === 'mid') await swap(club, id, 2, 3)
    if (cell.phase === 'won') await swap(club, id, 0, 1)
    if (cell.phase === 'lost') {
      // The budget is par (1) + extra_swaps (5) = six. Swapping the same pair
      // back and forth spends them all without ever solving the board.
      for (let i = 0; i < 6; i++) await swap(club, id, 2, 3)
    }
    if (cell.phase === 'ended') await endGame(club, 'waffle', id)

    return { gametype, id, viewer: club.members[0] }
  },
}
