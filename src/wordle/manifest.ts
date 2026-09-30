// cs-blessed-wordle

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, dictLabel, verdict, statusLine, tally, wonBy } from '@/common/manifest/statusLabel'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import type { GameEndedReason } from '@/common/terminal/gameEnding'
import { DEFAULT_WORDLE_SETUP, legalError, type WordleSetup } from './lib/setup'
import type { WordleClubpageInfo } from './lib/statuses'
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
        p_club_handle: clubHandle,
        p_setup: setup as WordleSetup,
        p_player_user_ids: playerUserIds,
        p_mode: mode,
      }),
    )
}

// Timeout (fired by every client on countdown expiry) + manual end — the shared
// one-arg RPC dispatchers (see common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

// The club-list line reads the list row's `gameEnding` and its `clubpage_info`
// (`WordleClubpageInfo`: coop's shared guess count, null in compete, compete's
// winner and their count, and the answer band). The answer band rides on
// every line — a game drawn from the curated Wordle answer list plays very
// differently from one drawn from the "Expert" end of the dictionary. Each
// mode's labelFor handles its own endings.

/** Why a game ended with nobody winning (wordle's losses). */
const LOSS: Partial<Record<GameEndedReason, string>> = {
  resource_exhausted: 'out of guesses',
  timeout: 'out of time',
  conceded: 'all conceded',
}

/** A member's username, or undefined for an id that names nobody. */
function usernameOf(members: readonly Member[], userId: string | null) {
  return userId === null ? undefined : memberById(members, userId)?.username
}

/**
 * The answer band (`clubpage_info.answer_band`, copied from the setup): 0 is
 * the curated NYT-Wordle answer list, 1..6 are the shared dictionary bands.
 * Rendered in the same `dict "…"` slot the other band-sensitive games use,
 * because to a player it answers the same question — how hard are the words
 * here?
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

  // Solo or coop up to 6. Must agree with _require_player_count_max(6).
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

  labelFor: (row) => {
    const clubpageInfo = row.clubpageInfo as WordleClubpageInfo
    const dict = answerDictLabel(clubpageInfo.answer_band)
    const used = tally(clubpageInfo.guesses_used, clubpageInfo.max_guesses, 'guesses')
    if (row.gameEnding === null) return statusLine(verdict('Playing'), used, dict)
    switch (row.gameEnding.outcome) {
      case 'won':
        return statusLine(verdict('Won'), used, dict)
      case 'lost':
        // The guess count is redundant once the reason IS "out of guesses".
        return row.gameEnding.reason === 'timeout'
          ? statusLine(verdict('Lost', LOSS.timeout), used, dict)
          : statusLine(verdict('Lost', LOSS.resource_exhausted), dict)
      // A Stop (stop_game). No 'answer revealed' variant: revealing is a
      // display decision on an already-ended game, and the club list describes
      // the ENDING, not what the players have since looked at.
      case 'neutral':
        return statusLine(verdict('Ended'), dict)
      default:
        return row.gameEnding.outcome
    }
  },

  submitTimeout,
  stopGame,
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
  // checks both ends for a race (PN498 below 2, _require_player_count_max(6)).
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

  labelFor: (row, members) => {
    const clubpageInfo = row.clubpageInfo as WordleClubpageInfo
    const dict = answerDictLabel(clubpageInfo.answer_band)
    // No progress: guesses are private until the game ends, and this line is
    // readable by the whole club.
    if (row.gameEnding === null) return statusLine(verdict('Playing'), dict)
    switch (row.gameEnding.outcome) {
      case 'won':
        return statusLine(
          wonBy(usernameOf(members, clubpageInfo.winner_user_id)),
          count(clubpageInfo.winner_guesses_count, 'guess', 'guesses'),
          dict,
        )
      case 'lost':
        // "all conceded" already says nobody won; the others need spelling out.
        return row.gameEnding.reason === 'conceded'
          ? verdict('Lost', LOSS.conceded)
          : statusLine(verdict('Lost', LOSS[row.gameEnding.reason] ?? null), 'no winner')
      // A Stop (stop_game).
      case 'neutral':
        return statusLine(verdict('Ended'), dict)
      default:
        return row.gameEnding.outcome
    }
  },

  submitTimeout,
  stopGame,
}
