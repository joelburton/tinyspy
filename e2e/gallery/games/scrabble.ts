import { execFileSync } from 'node:child_process'
import { asUser, createScrabbleGame, type E2EClub, type E2EMember } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import { timeOut } from '../timeOut'
import { seatWithVerdict } from '../verdict'
import type { Cell, GameGallery } from '../types'

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Standard Scrabble tile values — enough to report a plausible score. */
const VALUE: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
}

function q(sql: string): string {
  return execFileSync('psql', [LOCAL_DB, '-X', '-tA', '-c', sql], { encoding: 'utf8' }).trim()
}

/**
 * The acting rack: coop shares one, compete gives each seat its own.
 *
 * Read as the superuser — a rack is hidden from everyone but its owner, and the
 * gallery has to know it to play from it. Reading is fine here (friends, not
 * adversaries); the MOVE still goes through the real `play_word`, which checks
 * the tiles really are in this rack.
 */
function rackOf(gameId: string, mode: 'coop' | 'compete'): string {
  const sql =
    mode === 'coop'
      ? `select array_to_string(shared_rack, '') from scrabble.games where id = '${gameId}';`
      : `select array_to_string(p.rack, '') from scrabble.players p
           join scrabble.games g on g.id = p.game_id
          where p.game_id = '${gameId}' and p.seat = g.current_seat;`
  return q(sql).replace(/[^A-Z]/g, '')
}

/**
 * A REAL word this rack can spell.
 *
 * The alternative was calling `scrabble-suggest-move`, which runs the actual
 * solver — better fidelity, but it needs the edge runtime and may be gated to
 * coop. This is the cheap half of the same idea: `play_word` checks the
 * dictionary and the rack, so a word that's genuinely in `common.words` and
 * genuinely spellable from these tiles satisfies it.
 *
 * The SQL narrows to words built only from rack letters; the count check has to
 * happen here, since "uses no letter more often than the rack holds it" is
 * awkward to say in SQL and trivial in a loop.
 */
function wordFromRack(rack: string, band: number): { word: string; score: number } | null {
  if (rack.length < 3) return null
  const letters = [...new Set(rack.split(''))].join('').toLowerCase()
  const rows = q(
    `select word from common.words
      where length(word) between 3 and 5 and difficulty <= ${band}
        and word ~ '^[${letters}]+$'
      order by length(word) desc limit 400;`,
  )
  for (const word of rows.split('\n').filter(Boolean)) {
    const pool = rack.split('')
    const fits = [...word.toUpperCase()].every((ch) => {
      const at = pool.indexOf(ch)
      if (at < 0) return false
      pool.splice(at, 1)
      return true
    })
    if (fits) {
      const score = [...word.toUpperCase()].reduce((s, ch) => s + (VALUE[ch] ?? 0), 0)
      return { word: word.toUpperCase(), score }
    }
  }
  return null
}

/**
 * RackAttack (scrabble) gallery states (docs/testing.md → The screenshot gallery).
 *
 * Placement is deliberately naive — the word goes on a free row, left to right,
 * without the centre-star or connectivity rules a player obeys. Those live in
 * the FE (`lib/play.ts`), not the server, so `play_word` accepts it; and the
 * gallery's question is "how does this LAYOUT look", which a tidy word on a row
 * answers as well as a legal one. Everything the server does police — the tiles
 * are really in the rack, the squares are free, the word is really a word — is
 * still true of every move here.
 */
export const scrabbleGallery: GameGallery = {
  game: 'scrabble',
  brand: 'RackAttack',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'two words down' },
    { mode: 'coop', phase: 'lost', note: 'time ran out' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'two words down' },
    { mode: 'compete', phase: 'won', note: 'both players passed out' },
    { mode: 'compete', phase: 'lost', note: 'time ran out' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createScrabbleGame(club, cell.mode)
    const viewer = club.members[0]
    if (cell.phase === 'fresh') return { gametype, id, viewer }

    /** Whoever's turn it is (coop has one shared rack, so it's always seat 0). */
    const onTurn = (): E2EMember => {
      if (cell.mode === 'coop') return viewer
      const seat = q(`select current_seat from scrabble.games where id = '${id}';`)
      return club.members.find((_m, i) => String(i) === seat) ?? viewer
    }
    const version = () => Number(q(`select version from scrabble.games where id = '${id}';`))

    /** Play a word off the acting rack onto `row`. False if the rack can't. */
    const playWord = async (row: number): Promise<boolean> => {
      const pick = wordFromRack(rackOf(id, cell.mode), 3)
      if (!pick) return false
      const actor = onTurn()
      const placements = [...pick.word].map((letter, i) => ({ x: 3 + i, y: row, letter }))
      const res = await asUser(actor.session.access_token)
        .schema('scrabble')
        .rpc('play_word', {
          target_game: id,
          base_version: version(),
          placements,
          words: [pick.word],
          score: pick.score,
        })
      if (res.error) throw new Error(`scrabble.play_word(${pick.word}): ${res.error.message}`)
      return true
    }

    const pass = async (): Promise<void> => {
      const actor = onTurn()
      const res = await asUser(actor.session.access_token)
        .schema('scrabble')
        .rpc('pass_turn', { target_game: id, base_version: version() })
      if (res.error) throw new Error(`scrabble.pass_turn: ${res.error.message}`)
    }

    /**
     * A compete table's own ending: with the bag nowhere near empty, the way a
     * real game stops is everyone passing in turn — two active seats means two
     * consecutive passes finish it.
     *
     * ONE seat does all the scoring, which is the point. Letting both play
     * produced a TIE on the first run: two small words plus a random rack
     * penalty land within a point or two of each other often enough that a
     * "won" tile showed the word "Tie". A lopsided game is the one that
     * reliably photographs a victory.
     */
    if (cell.phase === 'won') {
      await playWord(7)
      await pass() // the rival, who never scores
      await playWord(9)
      await pass() // the rival again — one more pass now ends it
      await pass()
      return { gametype, id, viewer: seatWithVerdict(club, id, true) }
    }

    // Two words, on rows 7 and 9 — far enough apart that neither can collide
    // with the other, which keeps this free of any board bookkeeping.
    for (const row of [7, 9]) if (!(await playWord(row))) break

    if (cell.phase === 'lost') await timeOut(club, 'scrabble', id)
    if (cell.phase === 'ended') await endGame(club, 'scrabble', id)

    // `lost` is the same terminal from a losing chair — ask the game which that
    // is rather than assuming the first seat.
    if (cell.phase === 'lost' && cell.mode === 'compete') {
      return { gametype, id, viewer: seatWithVerdict(club, id, false) }
    }

    return { gametype, id, viewer }
  },
}
