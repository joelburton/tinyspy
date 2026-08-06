import {
  asUser,
  createWordiplyGame,
  type E2EClub,
  type E2EMember,
} from '../../helpers/fixtures'
import { endGame } from '../endGame'
import { timeOut } from '../timeOut'
import { seatWithVerdict } from '../verdict'
import type { Cell, GameGallery } from '../types'

/**
 * WordWire (wordiply) gallery states (docs/testing.md → The screenshot gallery).
 *
 * Moves go through `wordiply.submit_guess` on the same synthetic board the e2e
 * fixture builds, so every run photographs the same game. The base is `ar`, so
 * every guess has to contain it — the fixture's legal list is
 * bar / car / arc / arts / cars / scar / stars / hangars.
 */

/** The board's longest legal word, and so the winning guess. */
const LONGEST = ['bar', 'car', 'arc', 'arts', 'hangars']
/** Five legal guesses that top out at four letters — a losing set. */
const SHORT = ['bar', 'car', 'arc', 'arts', 'cars']

async function play(
  member: E2EMember,
  gameId: string,
  words: string[],
): Promise<void> {
  for (const w of words) {
    const res = await asUser(member.session.access_token)
      .schema('wordiply')
      .rpc('submit_guess', { target_game: gameId, word: w, fe_legal: true })
    if (res.error) throw new Error(`wordiply.submit_guess(${w}): ${res.error.message}`)
  }
}

export const wordiplyGallery: GameGallery = {
  game: 'wordiply',
  brand: 'WordWire',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'two guesses in' },
    // Coop has no WIN to reach — spending the guesses is just finishing, and
    // there's no verdict to earn (docs/games/wordiply.md → Deferred). The clock
    // is the one exception, and the only way a coop table can lose.
    { mode: 'coop', phase: 'lost', note: 'time ran out' },
    { mode: 'coop', phase: 'ended', note: 'five guesses spent' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'two guesses in' },
    { mode: 'compete', phase: 'won', note: 'best length score' },
    { mode: 'compete', phase: 'lost', note: "the rival's view of the same game" },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createWordiplyGame(club, cell.mode)
    const [me, rival] = club.members

    if (cell.phase === 'mid') await play(me, id, ['bar', 'scar'])

    // COMPETE GIVES EACH PLAYER THEIR OWN FIVE, so one player spending theirs
    // does NOT end the game — everyone has to. (Photographing only the first
    // player's five produced a "won" tile that was still mid-race, with no
    // verdict on it at all.) The rival plays a full, legal, LOSING set: five
    // guesses topping out at four letters against the seven-letter `hangars`.
    if (cell.phase === 'won' || (cell.phase === 'lost' && cell.mode === 'compete')) {
      await play(me, id, LONGEST)
      await play(rival, id, SHORT)
      // Both verdicts come out of the same terminal — which one you see is
      // purely which chair you're in, so ask the game rather than assume.
      return { gametype, id, viewer: seatWithVerdict(club, id, cell.phase === 'won') }
    }

    // Coop shares one budget, so five guesses from one player is the whole
    // thing — and it finishes NEUTRAL: there's no verdict to earn
    // (docs/games/wordiply.md → Deferred).
    if (cell.phase === 'ended' && cell.mode === 'coop') await play(me, id, LONGEST)

    // The clock, played a little first so the terminal has something to report.
    // It's the only way a coop table can lose.
    if (cell.phase === 'lost' && cell.mode === 'coop') {
      await play(me, id, ['bar', 'scar'])
      await timeOut(club, 'wordiply', id)
    }

    // Compete's neutral finish can only be the group agreeing to stop — every
    // spent-guesses ending picks a winner instead. So this one stops mid-race.
    if (cell.phase === 'ended' && cell.mode === 'compete') {
      await play(me, id, ['bar', 'scar'])
      await play(rival, id, ['car'])
      await endGame(club, 'wordiply', id)
    }

    return { gametype, id, viewer: me }
  },
}
