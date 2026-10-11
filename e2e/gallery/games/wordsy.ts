// cs-unmet

import {
  createWordsyGame,
  endWordsyRound,
  submitWordsyWord,
  type E2EClub,
  type E2EMember,
} from '../../helpers/fixtures'
import { stopGame } from '../stopGame'
import type { Cell, GameGallery } from '../types'

/** Seven real band-1 words with roots of their own, a round each. */
const WORDS = ['cab', 'elf', 'bold', 'fable', 'cobra', 'dragon', 'crab']

/**
 * wordsy's gallery states (docs/testing.md → The screenshot gallery), on the
 * fixtures' planted round-1 table. Compete only.
 *
 * A round ends through `endWordsyRound`, which runs the server's count to 30 by
 * direct SQL before the real `submit_timeout` — the clock only moves while a
 * page ticks it, and nobody's page is open while a cell is built.
 *
 * The game's own loss is a place below first: the viewer played every round
 * and the rival out-scored them, so the cell shows a ranked ending rather than
 * the shell's concession.
 */
export const wordsyGallery: GameGallery = {
  game: 'wordsy',
  brand: 'FlipWord',
  members: 2,
  cells: [
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'round 2, the clock running on the viewer' },
    { mode: 'compete', phase: 'won', note: 'seven rounds, the rival never submitted' },
    { mode: 'compete', phase: 'lost', note: 'seven rounds, out-scored: 2nd' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createWordsyGame(club)
    const [viewer, rival] = club.members as [E2EMember, E2EMember]

    /** One round: each listed player submits that round's word, then the
     *  clock runs out. */
    async function playRound(round: number, players: E2EMember[]) {
      for (const p of players) await submitWordsyWord(p, id, WORDS[round]!)
      await endWordsyRound(viewer, id)
    }

    if (cell.phase === 'mid') {
      await playRound(0, [viewer, rival])
      // Round 2 under way: the rival is in, and the clock runs on the viewer.
      await submitWordsyWord(rival, id, WORDS[1]!)
    }
    if (cell.phase === 'won') {
      for (let r = 0; r < 7; r++) await playRound(r, [viewer])
    }
    if (cell.phase === 'lost') {
      // The rival plays every round's word and the viewer only round 1's.
      for (let r = 0; r < 7; r++) await playRound(r, r === 0 ? [viewer, rival] : [rival])
    }
    if (cell.phase === 'ended') {
      await playRound(0, [viewer, rival])
      await stopGame(club, 'wordsy', id)
    }

    return { gametype, id, viewer }
  },
}
