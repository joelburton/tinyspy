import { execFileSync } from 'node:child_process'
import {
  asUser,
  createWordleGame,
  seedWordleGuesses,
  type E2EClub,
} from '../../helpers/fixtures'
import type { Cell, GameGallery } from '../types'

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/**
 * Read the hidden target as the local superuser.
 *
 * This is the escape hatch the contract warns about, and it's the benign kind:
 * it READS a column RLS hides until terminal, and writes nothing. Every state
 * below is still produced by `submit_guess`, so the board, the colours and the
 * verdict are all the ones a player would have produced. The alternative —
 * writing a "won" row directly — is what the contract forbids, because it can
 * build a game no player could have played.
 *
 * (wordle's schema isn't exposed to PostgREST, so psql is the only way in;
 * `seedWordleGuesses` reaches for it the same way.)
 */
function targetOf(gameId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) throw new Error(`bad game id: ${gameId}`)
  return execFileSync(
    'psql',
    [LOCAL_DB, '-X', '-tA', '-c', `select target from wordle.games where id = '${gameId}';`],
    { encoding: 'utf8' },
  ).trim()
}

/**
 * wordle's gallery states (docs/gallery-plan.md).
 *
 * A loss is six wrong guesses rather than a fixture with a shorter budget —
 * `createWordleGame` doesn't expose `max_guesses`, and six RPC calls with no
 * browser attached are quick. If it ever gets slow, the fix is a parameter on
 * the fixture, not a hand-written row.
 */
export const wordleGallery: GameGallery = {
  game: 'wordle',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'two guesses in' },
    { mode: 'coop', phase: 'won', note: 'target guessed' },
    { mode: 'coop', phase: 'lost', note: 'six wrong guesses' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'two guesses in' },
    { mode: 'compete', phase: 'won', note: 'first to solve' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createWordleGame(club, cell.mode)
    const viewer = club.members[0]

    if (cell.phase === 'mid') await seedWordleGuesses(viewer, id, 2)
    if (cell.phase === 'lost') await seedWordleGuesses(viewer, id, 6)
    if (cell.phase === 'won') {
      await seedWordleGuesses(viewer, id, 2)
      const res = await asUser(viewer.session.access_token)
        .schema('wordle')
        .rpc('submit_guess', { target_game: id, guess: targetOf(id) })
      if (res.error) throw new Error(`wordle.submit_guess(target): ${res.error.message}`)
    }

    return { gametype, id, viewer }
  },
}
