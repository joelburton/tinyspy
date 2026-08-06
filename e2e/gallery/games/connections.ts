import { createConnectionsGame, type E2EClub } from '../../helpers/fixtures'
import type { Cell, GameGallery } from '../types'

/**
 * WordKnit (connections) gallery states (docs/gallery-plan.md).
 *
 * FRESH only so far. Its later states need per-game work — a guess is four TILE IDS from the fixture\x27s categories, which have to be read off the created board — so
 * they're left undeclared rather than faked, and the runner's "cells never
 * declared" note lists them every run until someone writes them.
 */
export const connectionsGallery: GameGallery = {
  game: 'connections',
  brand: 'WordKnit',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'compete', phase: 'fresh' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createConnectionsGame(club, cell.mode)
    return { gametype, id, viewer: club.members[0] }
  },
}
