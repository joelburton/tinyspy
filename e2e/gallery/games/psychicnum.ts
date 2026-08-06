import { execFileSync } from 'node:child_process'
import { asUser, createGame, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/**
 * The board's words and its three hidden secrets, read as the superuser.
 *
 * A guess has to be a word that's actually on the board, and a WIN is the three
 * secrets — neither of which the client is told, and both of which the board
 * picks at random from the dictionary at create time. So the gallery looks.
 * Reading hidden state is fine here (the trust model is friends, not
 * adversaries — CLAUDE.md), and every state below is still produced by the real
 * `submit_guess`.
 */
function boardOf(gameId: string): { words: string[]; secrets: string[] } {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) throw new Error(`bad game id: ${gameId}`)
  const raw = execFileSync(
    'psql',
    [LOCAL_DB, '-X', '-tA', '-c',
     `select array_to_string(words, ',') || '|' || array_to_string(secrets, ',')
        from psychicnum.games where id = '${gameId}';`],
    { encoding: 'utf8' },
  ).trim()
  const [words, secrets] = raw.split('|')
  return { words: words.split(','), secrets: secrets.split(',') }
}

/**
 * PsychicNum (psychicnum) gallery states (docs/testing.md → The screenshot gallery).
 *
 * Coop only — its fixture predates the per-game naming (it's just `createGame`)
 * and hardcodes coop, which is also the only mode the gallery can show.
 */
export const psychicnumGallery: GameGallery = {
  game: 'psychicnum',
  brand: 'PsychicNum',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'two guesses, one hit' },
    { mode: 'coop', phase: 'won', note: 'all three secrets' },
    { mode: 'coop', phase: 'lost', note: 'guesses spent' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },

  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createGame(club)
    const viewer = club.members[0]
    if (cell.phase === 'fresh') return { gametype, id, viewer }

    const { words, secrets } = boardOf(id)
    const misses = words.filter((w) => !secrets.includes(w))
    const guess = async (word: string) => {
      const res = await asUser(viewer.session.access_token)
        .schema('psychicnum')
        .rpc('submit_guess', { target_game: id, guess: word })
      // Finding the last secret ends the game, so anything after it is refused
      // — for a win-building path that's the success signal, not a failure.
      if (res.error?.message.includes('not in progress')) return
      if (res.error) throw new Error(`psychicnum.submit_guess(${word}): ${res.error.message}`)
    }

    if (cell.phase === 'mid') await guess(misses[0]).then(() => guess(secrets[0]))
    if (cell.phase === 'won') for (const s of secrets) await guess(s)
    // The budget is seven; seven misses spend it without finding anything.
    if (cell.phase === 'lost') for (const w of misses.slice(0, 7)) await guess(w)

    if (cell.phase === 'ended') await endGame(club, 'psychicnum', id)

    return { gametype, id, viewer }
  },
}
