import { createBananagramsGame, type E2EClub } from '../../helpers/fixtures'
import type { GameGallery } from '../types'

/**
 * MonkeyGrams (bananagrams) gallery states (docs/gallery-plan.md).
 *
 * FRESH only so far. Its later states need per-game work — a move is a whole board snapshot plus a peel — so
 * they're left undeclared rather than faked, and the runner's "cells never
 * declared" note lists them every run until someone writes them.
 */
export const bananagramsGallery: GameGallery = {
  game: 'bananagrams',
  brand: 'MonkeyGrams',
  members: 2,
  cells: [
    { mode: 'compete', phase: 'fresh' },
  ],

  async build(club: E2EClub) {
    const { id, gametype } = await createBananagramsGame(club)
    return { gametype, id, viewer: club.members[0] }
  },
}
