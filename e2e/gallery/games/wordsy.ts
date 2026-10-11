// cs-unmet

import {
  createWordsyCoopGame,
  createWordsyGame,
  endWordsyRound,
  plantWordsyWord,
  startWordsyRound,
  submitWordsyWord,
  wordsyTableLetters,
  type E2EClub,
  type E2EMember,
} from '../../helpers/fixtures'
import { stopGame } from '../stopGame'
import type { Cell, GameGallery } from '../types'

/** Seven real band-1 words with roots of their own, a round each. */
const WORDS = ['cab', 'elf', 'bold', 'fable', 'cobra', 'dragon', 'crab']

/**
 * wordsy's gallery states (docs/testing.md → The screenshot gallery), on the
 * fixtures' planted round-1 table.
 *
 * Compete: a round ends through `endWordsyRound`, which runs the server's
 * count to 30 by direct SQL before the real `submit_timeout` — the clock only
 * moves while a page ticks it, and nobody's page is open while a cell is
 * built. The game's own loss is a place below first: the viewer played every
 * round and the rival out-scored them, so the cell shows a ranked ending
 * rather than the shell's concession.
 *
 * Coop: the two members play the solo card as a team, free-for-all; a word
 * ends its round, and both press Start. The won cell plays a planted word made
 * of each round's whole table (`wordsyTableLetters`, `plantWordsyWord`) — the
 * only way to a title, since only round 1's table is planted and no dictionary
 * word clears 20 on an unknown one; the lost cell plays the real words above,
 * which fall short of 90 and walk the card's timer off the bottom.
 */
export const wordsyGallery: GameGallery = {
  game: 'wordsy',
  brand: 'FlipWord',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh', note: 'the solo card beside the entry, the clock running' },
    { mode: 'coop', phase: 'mid', note: 'round 3, the card on red 3' },
    { mode: 'coop', phase: 'won', note: 'seven whole-table words: Wordmaster' },
    { mode: 'coop', phase: 'lost', note: 'seven small words: under 90, two penalties' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'round 2, the clock running on the viewer' },
    { mode: 'compete', phase: 'won', note: 'seven rounds, the rival never submitted' },
    { mode: 'compete', phase: 'lost', note: 'seven rounds, out-scored: 2nd' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const [viewer, rival] = club.members as [E2EMember, E2EMember]

    if (cell.mode === 'coop') {
      const { id, gametype } = await createWordsyCoopGame(club)

      /** One coop round: the writer's word ends it; then everyone presses
       *  Start unless the game is over. */
      async function playCoopRound(round: number, word: string, writer: E2EMember) {
        await submitWordsyWord(writer, id, word)
        if (round < 6) {
          await startWordsyRound(viewer, id)
          await startWordsyRound(rival, id)
        }
      }

      if (cell.phase === 'mid') {
        // Two words under 20 walk the timer down to 3.
        await playCoopRound(0, WORDS[0]!, viewer)
        await playCoopRound(1, WORDS[1]!, rival)
      }
      if (cell.phase === 'won') {
        for (let r = 0; r < 7; r++) {
          const word = `${wordsyTableLetters(id)}${'a'.repeat(r + 1)}`
          plantWordsyWord(word)
          await playCoopRound(r, word, r % 2 === 0 ? viewer : rival)
        }
      }
      if (cell.phase === 'lost') {
        for (let r = 0; r < 7; r++) await playCoopRound(r, WORDS[r]!, r % 2 === 0 ? viewer : rival)
      }
      if (cell.phase === 'ended') {
        await playCoopRound(0, WORDS[0]!, viewer)
        await stopGame(club, 'wordsy', id)
      }
      return { gametype, id, viewer }
    }

    const { id, gametype } = await createWordsyGame(club)

    /** One compete round: each listed player submits that round's word, then
     *  the clock runs out, and unless that was the last round both press Start
     *  for the next. */
    async function playRound(round: number, players: E2EMember[]) {
      for (const p of players) await submitWordsyWord(p, id, WORDS[round]!)
      await endWordsyRound(viewer, id)
      if (round < 6) {
        await startWordsyRound(viewer, id)
        await startWordsyRound(rival, id)
      }
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
