// cs-unmet

import {
  createWordleoneGame,
  seedWordleoneMisses,
  solveWordleone,
  type E2EClub,
} from '../../helpers/fixtures'
import { stopGame } from '../stopGame'
import { timeOut } from '../timeOut'
import type { Cell, GameGallery } from '../types'

/**
 * wordleone's gallery states (docs/testing.md → The screenshot gallery), every
 * one on the fixtures' fixed puzzle, so a solve is the known answer and no
 * cell reads the hidden column.
 *
 * Guesses are unlimited, so nothing runs out: the loss is the clock's.
 */
export const wordleoneGallery: GameGallery = {
  game: 'wordleone',
  brand: 'WordNerdier',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'two misses in' },
    { mode: 'coop', phase: 'won', note: 'solved after two misses' },
    { mode: 'coop', phase: 'lost', note: 'out of time' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'two misses in' },
    { mode: 'compete', phase: 'won', note: 'fewest misses' },
    { mode: 'compete', phase: 'lost', note: 'out of time, nobody solved' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createWordleoneGame(club, cell.mode)
    const viewer = club.members[0]

    if (cell.phase === 'mid') await seedWordleoneMisses(viewer, id, 2)
    if (cell.phase === 'won') {
      await seedWordleoneMisses(viewer, id, 2)
      await solveWordleone(viewer, id)
      // A compete solve ends only the solver: the race ends when nobody is
      // still racing. The rival solves on more misses, so the viewer wins.
      if (cell.mode === 'compete') {
        for (const m of club.members) {
          if (m.userId === viewer.userId) continue
          await seedWordleoneMisses(m, id, 3)
          await solveWordleone(m, id)
        }
      }
    }
    if (cell.phase === 'lost') {
      await seedWordleoneMisses(viewer, id, 2)
      await timeOut(club, 'wordleone', id)
    }
    if (cell.phase === 'ended') await stopGame(club, 'wordleone', id)

    return { gametype, id, viewer }
  },
}
