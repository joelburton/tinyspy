import { createGame, type E2EClub } from '../../helpers/fixtures'
import type { GameGallery } from '../types'

/**
 * PsychicNum (psychicnum) gallery states (docs/gallery-plan.md).
 *
 * FRESH only so far. Its later states need per-game work — a guess needs a board word, and a WIN needs the three hidden secrets — a psql read like wordle\x27s target — so
 * they're left undeclared rather than faked, and the runner's "cells never
 * declared" note lists them every run until someone writes them.
 */
export const psychicnumGallery: GameGallery = {
  game: 'psychicnum',
  brand: 'PsychicNum',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
  ],

  async build(club: E2EClub) {
    // `createGame` — psychicnum's fixture predates the per-game naming and is
    // coop-only, so the gallery has no compete row for it either.
    const { id, gametype } = await createGame(club)
    return { gametype, id, viewer: club.members[0] }
  },
}
