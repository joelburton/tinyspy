import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { supabase } from '../common/lib/supabase/supabase'
import { db } from './db'
import { makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
import {
  DEFAULT_SPELLINGBEE_SETUP_COMPETE,
  DEFAULT_SPELLINGBEE_SETUP_COOP,
  spellingbeeLegalError,
  type SpellingbeeSetup,
} from './lib/setup'
import { RANKS } from './lib/ranks'
import logoUrl from './logo.svg?url'

/**
 * spellingbee's registration with the shell — **two manifests, one
 * schema, one folder.**
 *
 * "spellingbee" is the codename for our NYT-Spelling-Bee-style word
 * finder. The user-facing brand lives in `name` below; gametype /
 * schema / folder are all `spellingbee`. See docs/games/spellingbee.md for the
 * rules + the wider architectural decisions (hidden wordlists
 * via the games_state view, the diverse builder in the edge
 * function, sibling-manifest split).
 *
 * Both manifests share the same `PlayArea`, `SetupForm`, `Help`,
 * `useGame`, and CSS. The mode branches at render time on
 * `game.mode` (read from `spellingbee.games_state.mode`, denormalized
 * for RLS + RPC branching). The DB inserts **two rows in
 * `common.gametypes`** but a **single set of spellingbee tables**;
 * the `spellingbee.create_game` RPC takes a `mode text` param and
 * routes accordingly. The edge function passes mode through.
 *
 * The sibling-manifest pattern's canonical write-up is in
 * [`docs/games/psychicnum.md`](../../docs/games/psychicnum.md);
 * spellingbee follows it line-for-line.
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
// Lazy so the prose ships in spellingbee's chunk.
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
 * Shared start-game caller. Each manifest's `startGameInClub`
 * forwards `mode` as a top-level field on the edge function's
 * request body. The edge function strips `setup.mode` if present
 * (defense against stale FE), builds the board, and calls
 * `spellingbee.create_game(target_club, setup, players, mode, board)`.
 *
 * Returns `{ id }` on success or `{ error }` whose message the
 * dialog surfaces verbatim.
 */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => {
    const s = setup as SpellingbeeSetup
    const { data, error } = await supabase.functions.invoke(
      'spellingbee-build-board',
      {
        body: {
          target_club: clubHandle,
          setup: s,
          player_user_ids: playerUserIds,
          mode,
        },
      },
    )
    if (error) {
      // `supabase.functions.invoke` returns its own generic
      // "Edge Function returned a non-2xx status code" message
      // when the response has a 4xx/5xx status. The actual
      // server error sits on `error.context` (a Response we can
      // read once). Surface it so the dialog shows what the
      // server actually objected to.
      const ctx = (error as { context?: Response }).context
      let serverMsg: string | null = null
      if (ctx) {
        try {
          const parsed = (await ctx.json()) as { error?: string }
          if (parsed && typeof parsed.error === 'string') {
            serverMsg = parsed.error
          }
        } catch {
          // body wasn't JSON; fall through to the generic message
        }
      }
      return { error: serverMsg ?? error.message }
    }
    const payload = data as { id?: string; error?: string } | null
    if (!payload || payload.error || !payload.id) {
      return {
        error:
          payload?.error ?? `failed to start ${brand} (${mode}) game`,
      }
    }
    return { id: payload.id }
  }
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/lib/game/manifestRpcs). submit_timeout is mode-aware server-side
// (per-mode terminal vocab lives in spellingbee.submit_timeout) + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

type StatusBlob = Record<string, unknown>

// The single source of truth for this game's user-facing brand name.
// Both sibling manifests set `name: BRAND`, and the start-game error
// reads it too — so a fork rebrands by editing this one line. The
// codename (`spellingbee`) is unrelated and stays lowercase everywhere
// in code.
const BRAND = 'FreeBee'

export const spellingbeeCoopGame: GameManifest = {
  gametype: 'spellingbee_coop',
  schema: 'spellingbee',
  baseGametype: 'spellingbee',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find words on a 7-letter honeycomb',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player in their solo club) or coop (up to 6).
  // Must agree with the player-count guard in
  // spellingbee.create_game.
  numberOfPlayers: [1, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_SPELLINGBEE_SETUP_COOP,
    validate: (setup) => spellingbeeLegalError(setup as SpellingbeeSetup),
  },

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    const foundScore = (s.found_words_score as number | undefined) ?? 0
    const requiredScore = (s.required_words_score as number | undefined) ?? 0
    const foundCount = (s.found_words_count as number | undefined) ?? 0
    const requiredCount = (s.required_words_count as number | undefined) ?? 0

    if (row.play_state === 'playing') {
      return `${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words`
    }
    // Terminal coop outcomes: only 'timeout' (countdown ran out)
    // or 'manual' (someone hit End game). There's no auto-end
    // at 100%-found in spellingbee — players keep going past the
    // displayed denominator (bonus words climb the score past
    // required_words_score, the Words counter past required_words_count).
    const outcome = s.outcome as string | undefined
    if (outcome === 'timeout') {
      return `time up · ${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words`
    }
    if (outcome === 'manual') {
      return `done · ${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words`
    }
    return `done · ${foundScore}/${requiredScore} pts`
  },

  submitTimeout,
  endGame,
}

export const spellingbeeCompeteGame: GameManifest = {
  gametype: 'spellingbee_compete',
  schema: 'spellingbee',
  baseGametype: 'spellingbee',
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
    defaults: DEFAULT_SPELLINGBEE_SETUP_COMPETE,
    validate: (setup) => spellingbeeLegalError(setup as SpellingbeeSetup),
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
    const targetRank = (s.target_rank as number | undefined) ?? 0
    const targetRankName = RANKS[targetRank] ?? '?'

    if (row.play_state === 'playing') {
      return `race to ${targetRankName}`
    }
    if (row.play_state === 'won_compete') {
      return `winner at ${targetRankName}`
    }
    // 'ended' (timeout or manual end) without a winner.
    const outcome = s.outcome as string | undefined
    if (outcome === 'timeout') {
      return `time up · no winner at ${targetRankName}`
    }
    return `ended · no winner at ${targetRankName}`
  },

  submitTimeout,
  endGame,
}
