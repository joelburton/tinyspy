import { asUser, createWaffleGame, type E2EClub, type E2EMember } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

/**
 * SyrupSwap (waffle) gallery states (docs/testing.md → The screenshot gallery).
 *
 * The fixture's scramble differs from its solution by ONE transposition (the
 * first two cells), with `par_swaps: 1` — so a win is a single `submit_swap` of
 * positions 0 and 1, and any OTHER swap is a wrong move that leaves the board
 * mid-game. That makes both terminal and mid-game states one RPC each.
 *
 * COMPETE ENDS ONLY WHEN NOBODY IS STILL RACING (`_maybe_finish_compete`:
 * not conceded, not solved, swaps left). The viewer solving is a LOCAL
 * terminal — the rival must run out of swaps too before the game ends and a
 * winner (fewest swaps among the solved) is crowned. The same rule that bit
 * wordle's builder; both compete terminals below spend the rival's budget.
 */
async function swap(member: E2EMember, gameId: string, a: number, b: number): Promise<void> {
  const res = await asUser(member.session.access_token)
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
    const viewer = club.members[0]
    const rival = club.members[1]
    // The budget is par (1) + extra_swaps (5) = six — per player in compete,
    // shared in coop. Swapping 2↔3 back and forth spends swaps without ever
    // solving; a single 0↔1 solves.
    const spendAllSwaps = async (member: E2EMember) => {
      for (let i = 0; i < 6; i++) await swap(member, id, 2, 3)
    }
    if (cell.phase === 'mid') await swap(viewer, id, 2, 3)
    if (cell.phase === 'won') {
      await swap(viewer, id, 0, 1)
      // Compete: the viewer's solve is only locally terminal (see the
      // docstring) — the rival spending their budget is what ends the race,
      // and fewest-swaps then crowns the viewer.
      if (cell.mode === 'compete') await spendAllSwaps(rival)
    }
    if (cell.phase === 'lost') {
      await spendAllSwaps(viewer)
      // Compete budgets are per player; the loss needs every one spent.
      if (cell.mode === 'compete') await spendAllSwaps(rival)
    }
    if (cell.phase === 'ended') await endGame(club, 'waffle', id)

    return { gametype, id, viewer }
  },
}
