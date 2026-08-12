import { execFileSync } from 'node:child_process'
import { asUser, createGame, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import { gameAlreadyOver } from '../serverError'
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
 * A full coop/compete sibling pair, like the game itself. (Until 2026-08-06
 * this file was coop-only, on the claim that coop "is also the only mode the
 * gallery can show" — false; the real limitation was the shared `createGame`
 * fixture hardcoding coop, and the run's gap report couldn't flag the
 * missing column because an undeclared mode reads as a mode the game
 * doesn't have.)
 *
 * Compete semantics the cells lean on: each racer has their OWN 7-guess
 * budget and must find all three secrets themselves; the first to complete
 * the set ends the race on the spot (`won_compete` — no wordle-style
 * wait-for-the-rest), and the loss is every non-conceded budget spent with
 * nobody done (`lost_compete`). Mid-race, a rival's guesses are hidden —
 * only their public found-count shows — so the compete `mid` cell has the
 * rival find a secret too, putting a nonzero number on the opponent strip.
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
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'one hit each; rival shows as a count' },
    { mode: 'compete', phase: 'won', note: 'viewer completes the set first' },
    { mode: 'compete', phase: 'lost', note: 'both budgets spent, nobody done' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createGame(club, cell.mode)
    const viewer = club.members[0]
    const rival = club.members[1]
    if (cell.phase === 'fresh') return { gametype, id, viewer }

    const { words, secrets } = boardOf(id)
    const misses = words.filter((w) => !secrets.includes(w))
    const guessAs = async (member: typeof viewer, word: string) => {
      const res = await asUser(member.session.access_token)
        .schema('psychicnum')
        .rpc('submit_guess', { target_game: id, guess: word })
      // Finding the last secret ends the game, so anything after it is refused
      // — for a win-building path that's the success signal, not a failure.
      if (gameAlreadyOver(res.error)) return
      if (res.error) throw new Error(`psychicnum.submit_guess(${word}): ${res.error.message}`)
    }
    const guess = (word: string) => guessAs(viewer, word)

    if (cell.phase === 'mid') {
      await guess(misses[0])
      await guess(secrets[0])
      // Compete: the rival finds one too — their guesses are RLS-hidden from
      // the viewer mid-race, but the public found-count on the opponent strip
      // is the whole tension readout, so give it something to say.
      if (cell.mode === 'compete') await guessAs(rival, secrets[1])
    }
    // Compete ends the moment the CALLER's own set completes, so the viewer
    // winning needs nothing from the rival.
    if (cell.phase === 'won') for (const s of secrets) await guess(s)
    if (cell.phase === 'lost') {
      // The budget is seven; seven misses spend it without finding anything.
      // Compete budgets are per-player, and the loss needs EVERY budget gone —
      // the same 7 misses again as the rival (word-dedup is per-caller there).
      for (const w of misses.slice(0, 7)) await guess(w)
      if (cell.mode === 'compete') {
        for (const w of misses.slice(0, 7)) await guessAs(rival, w)
      }
    }

    if (cell.phase === 'ended') await endGame(club, 'psychicnum', id)

    return { gametype, id, viewer }
  },
}
