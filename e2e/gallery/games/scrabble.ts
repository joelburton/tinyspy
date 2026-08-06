import { createScrabbleGame, type E2EClub } from '../../helpers/fixtures'
import type { Cell, GameGallery } from '../types'

/**
 * RackAttack (scrabble) gallery states (docs/gallery-plan.md).
 *
 * FRESH only so far. Its later states need per-game work — a move needs tiles from a private rack plus a legal board placement — so
 * they're left undeclared rather than faked, and the runner's "cells never
 * declared" note lists them every run until someone writes them.
 */
export const scrabbleGallery: GameGallery = {
  game: 'scrabble',
  brand: 'RackAttack',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'compete', phase: 'fresh' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createScrabbleGame(club, cell.mode)
    return { gametype, id, viewer: club.members[0] }
  },
}
