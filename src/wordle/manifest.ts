import { lazy } from 'react'
import type { CommonGameListRow, GameManifest } from '../common/lib/games'
import { db } from './db'
import { count, dictLabel, outcome, setupNum, statusLine, wonBy } from '../common/lib/game/statusLabel'
import { makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
import { DEFAULT_WORDLE_SETUP, legalGuessError, type WordleSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * wordle's registration with the shell. Codename `wordle` everywhere
 * in code (schema, folder, gametype strings); the brand lives only in
 * the BRAND const below. A NYT-Wordle-style guess-the-word game — see
 * docs/games/wordle.md.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `wordle` schema and the PlayArea / SetupForm / Help; they differ on
 * gametype string, name, mode, and numberOfPlayers. The per-game setup
 * is a guess budget (5–8) + an optional countdown timer, ended
 * server-side via `submitTimeout`.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
)

const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/** Shared start-game caller. `mode` is the per-manifest constant; the
 *  RPC routes on it to write the right gametype string and pick the
 *  target. No edge function — picking a random target is one SQL line. */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => {
    const s = setup as WordleSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
        mode,
      })
      .single()
    if (error || !data) {
      return { error: error ?? { message: `failed to start ${brand} (${mode})`, answered: true as const } }
    }
    return { id: data.id }
  }
}

// Timeout (fired by every client on countdown expiry) + manual end — the shared
// one-arg RPC dispatchers (see common/lib/game/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

/** One-line label for the ClubPage games list — pure + synchronous.
 *  The coop/compete mode is shown by the card's <ModePill>, so it's no
 *  longer prefixed here; `modeLabel` only picks the mid-game verb. */
/**
 * wordle's club-page status line. The answer-source band rides on every row —
 * a game drawn from the curated Wordle answer list plays very differently from
 * one drawn from the "Expert" end of the dictionary.
 *
 * Coop shows the guess count; compete doesn't — guesses are private until the
 * end-of-game reveal, and this line is club-wide readable.
 */
function labelFor(mode: 'coop' | 'compete') {
  return (row: CommonGameListRow): string => {
    const s = (row.status ?? {}) as {
      winner_username?: string; outcome?: string
      // Coop only — compete never updates these (a live count leaks how close
      // a racer is), so they're absent there rather than a permanent 0.
      guesses_used?: number; max_guesses?: number
      /** The WINNER's own count, written at terminal (see _maybe_finish_compete). */
      winner_guesses?: number
    }
    const dict = answerSourceLabel(setupNum(row.setup, 'answer_source'))
    const used =
      mode === 'coop' && s.guesses_used != null && s.max_guesses != null
        ? `${s.guesses_used}/${s.max_guesses} guesses`
        : null
    switch (row.play_state) {
      case 'playing':
        return statusLine(outcome('Playing'), used, dict)
      case 'won':
        return statusLine(outcome('Won'), used, dict)
      case 'won_compete':
        return statusLine(wonBy(s.winner_username), count(s.winner_guesses, 'guess', 'guesses'), dict)
      case 'lost':
        // The guess count is redundant once the reason IS "out of guesses".
        return s.outcome === 'timeout'
          ? statusLine(outcome('Lost', 'out of time'), used, dict)
          : statusLine(outcome('Lost', 'out of guesses'), dict)
      case 'lost_compete':
        // "all conceded" already says nobody won; the others need spelling out.
        return s.outcome === 'conceded'
          ? outcome('Lost', 'all conceded')
          : statusLine(outcome('Lost', COMPETE_LOSS[s.outcome ?? ''] ?? null), 'no winner')
      case 'ended':
        // No 'answer revealed' variant: the mid-game give-up that wrote
        // outcome='revealed' is gone (2026-08-03). Revealing is now a display
        // decision on an already-ended game, and the club list describes the
        // ENDING, not what the players have since looked at.
        return statusLine(outcome('Ended', null), dict)
      default:
        return row.play_state
    }
  }
}

/** Why a compete race ended with nobody winning (wordle._maybe_finish_compete). */
const COMPETE_LOSS: Record<string, string> = {
  timeout: 'out of time',
  exhausted: 'out of guesses',
  conceded: 'all conceded',
}

/**
 * `setup.answer_source`: 0 is the curated NYT-Wordle answer list, 1..6 are the
 * shared dictionary bands. Rendered in the same `dict "…"` slot the other
 * band-sensitive games use, because to a player it answers the same question —
 * how hard are the words here?
 */
function answerSourceLabel(source: number | null): string | null {
  if (source === 0) return 'dict "Wordle"'
  return dictLabel(source)
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'WordNerd'

export const wordleCoopGame: GameManifest = {
  gametype: 'wordle_coop',
  schema: 'wordle',
  baseGametype: 'wordle',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Guess the word together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with require_player_count_max(6).
  numberOfPlayers: [1, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLE_SETUP,
    // Gate Start until legal guesses reach the answer's hardest band (so every
    // possible answer is itself guessable). create_game re-checks.
    validate: (setup) => legalGuessError(setup as WordleSetup),
  },

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: labelFor('coop'),

  submitTimeout,
  endGame,
}

export const wordleCompeteGame: GameManifest = {
  gametype: 'wordle_compete',
  schema: 'wordle',
  baseGametype: 'wordle',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to guess the word',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. Lower bound 2; the RPC enforces it.
  numberOfPlayers: [2, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLE_SETUP,
    // Gate Start until legal guesses reach the answer's hardest band (so every
    // possible answer is itself guessable). create_game re-checks.
    validate: (setup) => legalGuessError(setup as WordleSetup),
  },

  startGameInClub: startGameInClubFactory('compete', BRAND),

  labelFor: labelFor('compete'),

  submitTimeout,
  endGame,
}
