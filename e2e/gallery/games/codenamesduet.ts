import { createCodenamesduetGame, type E2EClub } from '../../helpers/fixtures'
import type { GameGallery } from '../types'

/**
 * TinySpy (codenamesduet) gallery states (docs/gallery-plan.md).
 *
 * FRESH only so far. Its later states need per-game work — a turn is a clue and then guesses against a key card only one seat can see — so
 * they're left undeclared rather than faked, and the runner's "cells never
 * declared" note lists them every run until someone writes them.
 */
export const codenamesduetGallery: GameGallery = {
  game: 'codenamesduet',
  brand: 'TinySpy',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
  ],

  async build(club: E2EClub) {
    const { id, gametype } = await createCodenamesduetGame(club)
    return { gametype, id, viewer: club.members[0] }
  },
}
