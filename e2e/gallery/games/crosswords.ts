import { createCrosswordsGame, type E2EClub } from '../../helpers/fixtures'
import type { Cell, GameGallery } from '../types'

/**
 * CrossPlay (crosswords) gallery states (docs/gallery-plan.md).
 *
 * FRESH only so far. Its later states need per-game work — a move is a per-cell write; a win is the whole grid, which is the puzzle\x27s solution — so
 * they're left undeclared rather than faked, and the runner's "cells never
 * declared" note lists them every run until someone writes them.
 */
export const crosswordsGallery: GameGallery = {
  game: 'crosswords',
  brand: 'CrossPlay',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'compete', phase: 'fresh' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createCrosswordsGame(club, cell.mode)
    return { gametype, id, viewer: club.members[0] }
  },
}
