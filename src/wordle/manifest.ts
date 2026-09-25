// cs-blessed-wordle

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CommonGameListRow, CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, dictLabel, verdict, setupNum, statusLine, wonBy } from '@/common/manifest/statusLabel'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { DEFAULT_WORDLE_SETUP, legalError, type WordleSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * wordle's registration with the shell. Codename `wordle` everywhere
 * in code (schema, folder, gametype strings); the brand lives only in
 * the BRAND const below. The game itself is `doc.md`'s.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `wordle` schema and the PlayArea / SetupForm / Help; they differ on
 * gametype string, mode, and numberOfPlayers. The per-game setup is
 * `lib/setup.ts`'s; a countdown timer ends the game server-side via
 * `submitTimeout`.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/** Shared start-game caller. `mode` is the per-manifest constant; the
 *  RPC routes on it to write the right gametype string and pick the
 *  target. No edge function — picking a random target is one SQL line. */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup: setup as WordleSetup,
        player_user_ids: playerUserIds,
        mode,
      }),
    )
}

// Timeout (fired by every client on countdown expiry) + manual end — the shared
// one-arg RPC dispatchers (see common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

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
      winner_username?: string; reason?: string
      // Coop only — compete never updates these (a live count leaks how close
      // a racer is), so they're absent there rather than a permanent 0.
      guesses_used?: number; max_guesses?: number
      // The WINNER's own count, written at terminal (see _finish_compete).
      winner_guesses?: number
    }
    const dict = answerDictLabel(setupNum(row.setup, 'answer_band'))
    const used =
      mode === 'coop' && s.guesses_used != null && s.max_guesses != null
        ? `${s.guesses_used}/${s.max_guesses} guesses`
        : null
    switch (row.play_state) {
      case 'playing':
        return statusLine(verdict('Playing'), used, dict)
      case 'won':
        return statusLine(verdict('Won'), used, dict)
      case 'won_compete':
        return statusLine(wonBy(s.winner_username), count(s.winner_guesses, 'guess', 'guesses'), dict)
      case 'lost':
        // The guess count is redundant once the reason IS "out of guesses".
        return s.reason === 'timeout'
          ? statusLine(verdict('Lost', 'out of time'), used, dict)
          : statusLine(verdict('Lost', 'out of guesses'), dict)
      case 'lost_compete':
        // "all conceded" already says nobody won; the others need spelling out.
        return s.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost', COMPETE_LOSS[s.reason ?? ''] ?? null), 'no winner')
      case 'ended':
        // No 'answer revealed' variant: revealing is a display decision on an
        // already-ended game, and the club list describes the ENDING, not what
        // the players have since looked at.
        return statusLine(verdict('Ended', null), dict)
      default:
        return row.play_state
    }
  }
}

/** Why a compete race ended with nobody winning (wordle._finish_compete). */
const COMPETE_LOSS: Record<string, string> = {
  timeout: 'out of time',
  exhausted: 'out of guesses',
  conceded: 'all conceded',
}

/**
 * `setup.answer_band`: 0 is the curated NYT-Wordle answer list, 1..6 are the
 * shared dictionary bands. Rendered in the same `dict "…"` slot the other
 * band-sensitive games use, because to a player it answers the same question —
 * how hard are the words here?
 */
function answerDictLabel(band: number | null): string | null {
  if (band === 0) return 'dict "Wordle"'
  return dictLabel(band)
}

// Single source of truth for this game's user-facing brand name — both
// manifests' `name` reads it, so a fork rebrands by editing this one line.
// Codename stays lowercase in code.
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
    validate: (setup) => legalError(setup as WordleSetup),
  },

  startGameInClub: startGameInClubFactory('coop'),

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

  // Compete needs an opposing PLAYER. Must agree with create_game, which
  // checks both ends for a race (PN498 below 2, require_player_count_max(6)).
  numberOfPlayers: [2, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLE_SETUP,
    // Gate Start until legal guesses reach the answer's hardest band (so every
    // possible answer is itself guessable). create_game re-checks.
    validate: (setup) => legalError(setup as WordleSetup),
  },

  startGameInClub: startGameInClubFactory('compete'),

  labelFor: labelFor('compete'),

  submitTimeout,
  endGame,
}
