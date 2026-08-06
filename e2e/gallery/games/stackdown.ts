import { createStackdownGame, seedStackdownFirstWord, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

/**
 * StackDown (stackdown) gallery states (docs/gallery-plan.md).
 *
 * `seedStackdownFirstWord` clears the first of the stack's six words through
 * the real `submit_word` — a tile-id path rather than a typed string, since a
 * stackdown move IS a set of tiles.
 *
 * No terminal cells yet: clearing the stack means five more tile-id sets, and
 * a loss means the clock. Both are reachable, nobody has written them — which
 * is what the runner's "cells never declared" note is for.
 */
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

  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createStackdownGame(club, cell.mode)
    if (cell.phase === 'mid') await seedStackdownFirstWord(club.members[0], id)
    if (cell.phase === 'ended') await endGame(club, 'stackdown', id)

    return { gametype, id, viewer: club.members[0] }
  },
}
