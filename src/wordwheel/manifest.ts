import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { outcome, statusLine, tally, wonBy } from '../common/lib/game/statusLabel'
import { makeRpcDispatcher, invokeStartGameEdgeFn } from '../common/lib/game/manifestRpcs'
import {
  DEFAULT_WORDWHEEL_SETUP_COMPETE,
  DEFAULT_WORDWHEEL_SETUP_COOP,
  wordwheelSetupError,
  type WordwheelSetup,
} from './lib/setup'
import { RANKS } from '../common/lib/game/rankLadder'
import logoUrl from './logo.svg?url'

/**
 * wordwheel's registration with the shell — **two manifests, one
 * schema, one folder.**
 *
 * "wordwheel" is the codename for our Guardian-Word-Wheel-style word
 * finder — a targeted fork of spellingbee (nine letters on a wheel, each
 * tile used ONCE per word). The user-facing brand lives in `name` below;
 * gametype / schema / folder are all `wordwheel`. See docs/games/wordwheel.md
 * for the rules + the wider architectural decisions (the shipped word list
 * the FE scores locally, the difficulty-tagged pangram seeds + diverse
 * builder in the edge function, sibling-manifest split).
 *
 * Both manifests share the same `PlayArea`, `SetupForm`, `Help`,
 * `useGame`, and CSS. The mode branches at render time on
 * `game.mode` (read from `wordwheel.games_state.mode`, denormalized
 * for RLS + RPC branching). The DB inserts **two rows in
 * `common.gametypes`** but a **single set of wordwheel tables**;
 * the `wordwheel.create_game` RPC takes a `mode text` param and
 * routes accordingly. The edge function passes mode through.
 *
 * The sibling-manifest pattern's canonical write-up is in
 * [`docs/games/psychicnum.md`](../../docs/games/psychicnum.md);
 * wordwheel follows it line-for-line.
 *
 * Differences between the two manifests:
 *   - `gametype` string, used as the URL segment + registry key.
 *   - `name` shown in titles and Start-button copy.
 *   - `mode` declaration (the canonical axis for downstream code
 *     that wants to distinguish behavior).
 *   - `numberOfPlayers`: coop allows solo (`[1, 6]`), compete
 *     requires an opposing player (`[2, 6]`).
 *   - `setupForm.defaults`: compete seeds `target_rank: 5`.
 *   - `labelFor`: per-mode club-page label vocabulary.
 */

// Help loader is shared — both modes link to the same rules modal.
// Lazy so the prose ships in wordwheel's chunk.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared — branches on `game.mode` for the compete-
// only OpponentStrip + win-vs-loss verdict copy.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
)

// SetupForm is shared — surfaces the target-rank picker iff
// `mode === 'compete'` via the SetupBodyProps.mode prop.
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * Shared start-game caller. Forwards `mode` as a top-level body field to the
 * edge function, which strips `setup.mode` if present (defense against a stale
 * FE), builds the board, and calls `wordwheel.create_game(target_club, setup,
 * players, mode, board)`. The shared helper owns the error-context unwrap.
 */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    invokeStartGameEdgeFn(
      'wordwheel-build-board',
      { target_club: clubHandle, setup: setup as WordwheelSetup, player_user_ids: playerUserIds, mode },
      brand,
    )
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/lib/game/manifestRpcs). submit_timeout is mode-aware server-side
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
    Component: setupFormLoader,
    defaults: DEFAULT_WORDWHEEL_SETUP_COOP,
    validate: (setup) => wordwheelSetupError(setup as WordwheelSetup),
  },

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    const pts = `${(s.found_words_score as number | undefined) ?? 0}/${(s.required_words_score as number | undefined) ?? 0} pts`
    const words = tally(
      s.found_words_count as number | undefined,
      s.required_words_count as number | undefined, 'words')

    // Terminal coop outcomes: 'target' (the team reached the rank they set out
    // for — the only coop WIN), 'timeout' (countdown ran out) or 'manual'
    // (someone hit End game). Without a target there's still no auto-end at
    // 100%-found — players keep going past the displayed denominator (bonus
    // words climb the score past required_words_score, the Words counter past
    // required_words_count).
    const rank = RANKS[(s.target_rank as number | undefined) ?? 6]
    switch (row.play_state) {
      case 'playing':
        return statusLine(outcome('Playing'), pts, words)
      case 'won':
        // "Won at …" is one phrase, not two facts — no separator inside it.
        return statusLine(`${outcome('Won')} at "${rank}"`, pts)
      // Ran out WITH a target to hit. (Ran out with nothing to fail at is
      // 'ended' below — the neutral close of an open hunt.)
      case 'lost':
        return statusLine(outcome('Lost', 'out of time'), pts, words)
      case 'ended':
        return statusLine(
          outcome('Ended', (s.outcome as string) === 'timeout' ? 'out of time' : null), pts, words)
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
    Component: setupFormLoader,
    defaults: DEFAULT_WORDWHEEL_SETUP_COMPETE,
    validate: (setup) => wordwheelSetupError(setup as WordwheelSetup),
  },

  startGameInClub: startGameInClubFactory('compete', BRAND),

  /**
   * Compete labels read from the status jsonb's target_rank +
   * leaderboard payload (mid-game) or winner_user_id +
   * winner_username (terminal). Numeric per-player scores are
   * intentionally NOT surfaced in the club-page label — the
   * "opponents see rank only" decision applies to the listing
   * row as well.
   */
  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    const rank = RANKS[(s.target_rank as number | undefined) ?? 0] ?? '?'

    // The all-conceded terminal comes through common.concede as
    // play_state='lost' + status {outcome:'conceded'} with NO target_rank, so
    // it must be caught BEFORE anything that prints the rank — otherwise the
    // rank falls back to 0 and the label reads the wrong "…at Start".
    if ((s.outcome as string) === 'conceded') return outcome('Lost', 'all conceded')

    switch (row.play_state) {
      case 'playing':
        return statusLine(outcome('Playing'), `race to "${rank}"`)
      case 'won_compete':
        return `${wonBy(s.winner_username as string | undefined)} at "${rank}"`
      // The clock beat everyone to the rank — a real loss for the table.
      case 'lost_compete':
        return statusLine(outcome('Lost', 'out of time'), `nobody reached "${rank}"`)
      case 'ended':
        return statusLine(
          outcome('Ended', (s.outcome as string) === 'timeout' ? 'out of time' : null),
          `nobody reached "${rank}"`)
      default:
        return row.play_state
    }
  },

  submitTimeout,
  endGame,
}
