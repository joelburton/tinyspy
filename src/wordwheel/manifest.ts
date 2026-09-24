// cs-met-wordwheel

import { lazy } from 'react'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { verdict, statusLine, tally, wonBy } from '@/common/manifest/statusLabel'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { runEdgeFn } from '@/common/supabase/dbResult'
import {
  DEFAULT_WORDWHEEL_SETUP_COMPETE,
  DEFAULT_WORDWHEEL_SETUP_COOP,
  wordwheelSetupError,
  type WordwheelSetup,
} from './lib/setup'
import { RANKS } from '@/shared/rank-ladder/rankLadder'
import logoUrl from './logo.svg?url'

/**
 * wordwheel's registration with the shell — **two manifests, one
 * schema, one folder.** "wordwheel" is the codename; the brand is `BRAND`
 * below. The game itself is `doc.md`.
 *
 * Both manifests share the same `PlayArea`, `SetupForm`, `Help`, `useGame`
 * and CSS; the mode branches at render time on `game.mode`, which
 * `create_game` writes onto `wordwheel.games` from its own `mode`
 * argument. Two rows in `common.gametypes`, one set of tables — the
 * sibling-manifest pattern (docs/common.md → The sibling-manifest pattern).
 *
 * What differs between the two: the `gametype` string (the URL segment and
 * registry key), `mode`, `numberOfPlayers` (compete needs an opponent), the
 * setup defaults (compete seeds a target rank), the dialog's intro, and
 * `labelFor`'s vocabulary.
 */

// Help loader is shared — both modes link to the same rules modal.
// Lazy so the prose ships in wordwheel's chunk.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// One surface for both modes — it branches on `game.mode` for the
// compete-only OpponentStrip and the win-vs-loss verdict.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

// SetupForm is shared — the target-rank picker's caption and its "None"
// option follow the SetupBodyProps.mode prop.
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * Shared start-game caller. Forwards `mode` as a top-level body field to the
 * edge function, which builds the board and calls
 * `wordwheel.create_game(target_club, setup, players, mode, board)`.
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The wheel is chosen in Deno, so this goes through an edge function rather
    // than straight to the RPC — but it comes back the same envelope a direct
    // create_game returns, relayed untouched (see _shared/startGame.ts).
    runEdgeFn<CreatedGame>('wordwheel-build-board', {
      target_club: clubHandle,
      setup: setup as WordwheelSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/manifest/manifestRpcs). submit_timeout is mode-aware server-side
// (per-mode terminal vocab lives in wordwheel.submit_timeout) + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

type StatusBlob = Record<string, unknown>

// The single source of truth for this game's user-facing brand name.
// Both sibling manifests set `name: BRAND`, and the start-game error
// reads it too — so a fork rebrands by editing this one line. The
// codename (`wordwheel`) is unrelated and stays lowercase everywhere
// in code.
const BRAND = 'MooseWheel'

export const wordwheelCoopGame: GameManifest = {
  gametype: 'wordwheel_coop',
  schema: 'wordwheel',
  baseGametype: 'wordwheel',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find words on a 9-letter wheel',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player in their solo club) or coop (up to 6).
  // Must agree with the player-count guard in
  // wordwheel.create_game.
  numberOfPlayers: [1, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Everyone in the club types words into the same wheel and the team racks up the score together.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDWHEEL_SETUP_COOP,
    validate: (setup) => wordwheelSetupError(setup as WordwheelSetup),
  },

  startGameInClub: startGameInClubFactory('coop'),

  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    const pts = `${(s.found_words_score as number | undefined) ?? 0}/${(s.required_words_score as number | undefined) ?? 0} pts`
    const words = tally(
      s.found_words_count as number | undefined,
      s.required_words_count as number | undefined, 'words')

    // The rank a coop win names is the one the team set out for; a status with
    // none is not a won game, so the fallback is never read there.
    const rank = RANKS[(s.target_rank as number | undefined) ?? 6]
    switch (row.play_state) {
      case 'playing':
        return statusLine(verdict('Playing'), pts, words)
      case 'won':
        // "Won at …" is one phrase, not two facts — no separator inside it.
        return statusLine(`${verdict('Won')} at "${rank}"`, pts)
      // Ran out WITH a target to hit. (Ran out with nothing to fail at is
      // 'ended' below — the neutral close of an open hunt.)
      case 'lost':
        return statusLine(verdict('Lost', 'out of time'), pts, words)
      case 'ended':
        return statusLine(
          verdict('Ended', (s.reason as string) === 'timeout' ? 'out of time' : null), pts, words)
      default:
        return row.play_state
    }
  },

  submitTimeout,
  endGame,
}

export const wordwheelCompeteGame: GameManifest = {
  gametype: 'wordwheel_compete',
  schema: 'wordwheel',
  baseGametype: 'wordwheel',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to your chosen rank',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. The RPC enforces ≥2 too.
  numberOfPlayers: [2, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Each player works the same wheel independently. First to the target rank wins; the rest of the time you only see each other\'s rank, not the words you found.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDWHEEL_SETUP_COMPETE,
    validate: (setup) => wordwheelSetupError(setup as WordwheelSetup),
  },

  startGameInClub: startGameInClubFactory('compete'),

  // Compete's label reads the status's target rank mid-game and its
  // winner_username at the end; no player's score reaches the listing row.
  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    const rank = RANKS[(s.target_rank as number | undefined) ?? 0] ?? '?'

    // The all-conceded terminal comes through common.concede as
    // play_state='lost_compete' + status {reason:'conceded'} with NO
    // target_rank, so it must be caught BEFORE anything that prints the rank —
    // otherwise the rank falls back to 0 and the label reads the wrong
    // "…at Start". (Keyed on the outcome, not the state, so it also sits ahead
    // of the lost_compete arm below, which is the CLOCK's version of the loss.)
    if ((s.reason as string) === 'conceded') return verdict('Lost', 'all conceded')

    switch (row.play_state) {
      case 'playing':
        return statusLine(verdict('Playing'), `race to "${rank}"`)
      case 'won_compete':
        return `${wonBy(s.winner_username as string | undefined)} at "${rank}"`
      // The clock beat everyone to the rank — a real loss for the table.
      case 'lost_compete':
        return statusLine(verdict('Lost', 'out of time'), `nobody reached "${rank}"`)
      // The one neutral race ending, the players agreeing to stop: the clock
      // running out is `lost_compete` above.
      case 'ended':
        return statusLine(verdict('Ended'), `nobody reached "${rank}"`)
      default:
        return row.play_state
    }
  },

  submitTimeout,
  endGame,
}
