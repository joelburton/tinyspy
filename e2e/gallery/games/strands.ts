import { createStrandsGame, type E2EClub } from '../../helpers/fixtures'
import type { Cell, GameGallery } from '../types'

/**
 * PaulPath (strands) gallery states (docs/gallery-plan.md).
 *
 * FRESH only so far. Its later states need per-game work — a move is a PATH of cells, and the fixture plays a real NYT puzzle whose theme-word paths need looking up — so
 * they're left undeclared rather than faked, and the runner's "cells never
 * declared" note lists them every run until someone writes them.
 */
export const strandsGallery: GameGallery = {
  game: 'strands',
  brand: 'PaulPath',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'compete', phase: 'fresh' },
  ],

  async build(club: E2EClub, cell: Cell) {
    // (club, puzzleDate, mode) — the date sits between them.
    const { id, gametype } = await createStrandsGame(club, undefined, cell.mode)
    return { gametype, id, viewer: club.members[0] }
  },
}
