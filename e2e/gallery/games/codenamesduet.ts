import { execFileSync } from 'node:child_process'
import { asUser, createCodenamesduetGame, type E2EClub, type E2EMember } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

type Table = { userA: string; userB: string; cardA: string[]; cardB: string[] }

/**
 * Both key cards, read as the superuser.
 *
 * Duet's whole point is that neither seat sees the other's card, so a script
 * that plays it has to look — the alternative is guessing at random and hoping,
 * which would photograph a different game every run. Fine here (friends, not
 * adversaries), and every move below still goes through the real
 * `submit_clue` / `submit_guess`.
 */
function tableOf(gameId: string): Table {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) throw new Error(`bad game id: ${gameId}`)
  const raw = execFileSync(
    'psql',
    [LOCAL_DB, '-X', '-tA', '-c',
     `select user_a_id || '|' || user_b_id || '|' || key_card_a::text || '|' || key_card_b::text
        from codenamesduet.games where id = '${gameId}';`],
    { encoding: 'utf8' },
  ).trim()
  const [userA, userB, cardA, cardB] = raw.split('|')
  return { userA, userB, cardA: JSON.parse(cardA), cardB: JSON.parse(cardB) }
}

/** Whose turn it is to give a clue, right now — 'A' or 'B'. */
function giverSeat(gameId: string): string {
  return execFileSync(
    'psql',
    [LOCAL_DB, '-X', '-tA', '-c',
     `select current_clue_giver from codenamesduet.games where id = '${gameId}';`],
    { encoding: 'utf8' },
  ).trim()
}

/** Positions carrying `label` on a card. 'G' green, 'A' assassin, 'N' neutral. */
const positions = (card: string[], label: string) =>
  card.map((l, i) => (l === label ? i : -1)).filter((i) => i >= 0)

/**
 * TinySpy (codenamesduet) gallery states (docs/gallery-plan.md).
 *
 * A turn is two moves by two different people: the giver's clue, then the OTHER
 * seat's guesses — scored against the GIVER's card, which is what makes the
 * peek necessary. Coop only; duet is a two-player co-operative game with no
 * compete sibling.
 */
export const codenamesduetGallery: GameGallery = {
  game: 'codenamesduet',
  brand: 'TinySpy',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'a clue and two agents' },
    { mode: 'coop', phase: 'won', note: 'all fifteen found' },
    { mode: 'coop', phase: 'lost', note: 'hit the assassin' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },

  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createCodenamesduetGame(club)
    const viewer = club.members[0]
    if (cell.phase === 'fresh') return { gametype, id, viewer }

    const t = tableOf(id)
    const seat = (userId: string): E2EMember =>
      club.members.find((m) => m.userId === userId) ?? club.members[0]
    const clue = async (giver: E2EMember, word: string, count: number) => {
      const res = await asUser(giver.session.access_token)
        .schema('codenamesduet')
        .rpc('submit_clue', { target_game: id, clue_word: word, clue_count: count })
      if (res.error) throw new Error(`submit_clue: ${res.error.message}`)
    }
    /** Returns false once the game has ended, so callers can stop. */
    const pick = async (guesser: E2EMember, position: number): Promise<boolean> => {
      const res = await asUser(guesser.session.access_token)
        .schema('codenamesduet')
        .rpc('submit_guess', { target_game: id, target_position: position })
      if (res.error?.message.match(/not in|guessable state/)) return false
      if (res.error) throw new Error(`submit_guess(${position}): ${res.error.message}`)
      return true
    }

    // The fixture seats members[0] as the first clue-giver, so the first turn
    // is: A clues, B guesses against A's card.
    const giverA = seat(t.userA)
    const guesserB = seat(t.userB)

    if (cell.phase === 'mid') {
      await clue(giverA, 'signal', 2)
      for (const p of positions(t.cardA, 'G').slice(0, 2)) await pick(guesserB, p)
    }

    if (cell.phase === 'lost') {
      // The assassin ends it instantly — the shortest loss any game here has.
      await clue(giverA, 'danger', 1)
      await pick(guesserB, positions(t.cardA, 'A')[0])
    }

    if (cell.phase === 'won') {
      // The two cards' greens OVERLAP and together make up the fifteen agents,
      // so clearing A's greens and then B's finds them all. A correct guess
      // lets the guesser carry on, so each card's run fits inside one turn.
      //
      // The seats DON'T swap on their own, though: a run of correct guesses
      // leaves the turn where it was, and the guesser has to hand it back with
      // `pass_turn` — the first version assumed the swap and was told "not your
      // turn to give a clue". So each round asks the game whose turn it is
      // rather than predicting it.
      const done = new Set<number>()
      for (let round = 0; round < 4; round++) {
        const giverIsA = giverSeat(id) === 'A'
        const giver = giverIsA ? giverA : guesserB
        const guesser = giverIsA ? guesserB : giverA
        const greens = positions(giverIsA ? t.cardA : t.cardB, 'G').filter((p) => !done.has(p))
        if (!greens.length) break
        await clue(giver, `round${round}`, greens.length)
        let alive = true
        for (const p of greens) {
          alive = await pick(guesser, p)
          done.add(p)
          if (!alive) break
        }
        if (!alive) break
        const res = await asUser(guesser.session.access_token)
          .schema('codenamesduet')
          .rpc('pass_turn', { target_game: id })
        // A pass on a finished game is refused ("can only pass during active
        // play"), which just means the round before it ended the game — the
        // fifteenth agent can fall anywhere in a run.
        if (res.error?.message.includes('active play')) break
        if (res.error && !res.error.message.match(/not in|state/)) {
          throw new Error(`pass_turn: ${res.error.message}`)
        }
      }
    }

    if (cell.phase === 'ended') await endGame(club, 'codenamesduet', id)

    return { gametype, id, viewer }
  },
}
