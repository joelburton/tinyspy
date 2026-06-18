import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { supabase } from '../common/lib/supabase'
import { db } from './db'
import { DEFAULT_FREEBEE_SETUP, type FreebeeSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * FreeBee's registration with the shell.
 *
 * "FreeBee" is the codename for our NYT-Spelling-Bee-style word
 * finder (ported from the standalone ~/freebee-ws codebase).
 * User-facing copy is "FreeBee"; folder / schema / RPC names are
 * all `freebee`. See docs/freebee.md for the rules, scope, and
 * the wider architectural decisions (hidden wordlists via the
 * games_state view + helpers, designed-for-compete from day
 * one, the diverse builder living in an edge function).
 */
export const freebeeGame: GameManifest = {
  gametype: 'freebee',
  schema: 'freebee',
  name: 'FreeBee',
  shortDescription: 'Find words on a 7-letter honeycomb',
  logoUrl,

  // Help / rules modal. Lazy so the prose ships in freebee's
  // chunk, not the main bundle.
  help: lazy(() =>
    import('./components/Help').then((m) => ({ default: m.Help })),
  ),

  // Plays solo (one player in their solo club) or coop (any
  // number of club members). Must agree with the (absence of a)
  // member-count check in freebee.create_game. See
  // docs/code-conventions.md → "Per-game player counts."
  numberOfPlayers: [1, null],

  // No manifest-level `timerMode`: freebee's timer is a per-game
  // choice from the setup dialog. Same shape wordknit + psychic-
  // num use.

  PlayArea: lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
  ),

  setupForm: {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_FREEBEE_SETUP,
  },

  /**
   * SetupGameDialog calls this on submit. The freebee path is
   * **edge-function-mediated**: the diverse builder + dictionary
   * intersection live in `supabase/functions/freebee-build-board`,
   * and it calls `freebee.create_game` internally over PostgREST
   * with the caller's JWT.
   *
   * Returns `{ id }` on success, `{ error }` whose message the
   * dialog surfaces verbatim. Server-side validation (membership,
   * setup shape, board structure, ≥30-words gate) is the trust
   * boundary — the FE-collected setup is not trusted.
   *
   * Same shape as the other manifests' `startGameInClub`: takes
   * `clubId`, `setup`, `playerUserIds`. The function call is the
   * "go" point — until the user clicks Start in the dialog, no
   * DB write or board-build computation happens.
   */
  startGameInClub: async (clubId, setup, playerUserIds) => {
    const s = setup as FreebeeSetup
    const { data, error } = await supabase.functions.invoke(
      'freebee-build-board',
      {
        body: {
          target_club: clubId,
          setup: s,
          player_user_ids: playerUserIds,
        },
      },
    )
    if (error) {
      // `supabase.functions.invoke` returns its own generic
      // "Edge Function returned a non-2xx status code" message
      // when the response has a 4xx/5xx status. The actual
      // server error sits on `error.context` (a Response we
      // can read once). Surface it so the dialog shows what
      // the server actually objected to.
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
      return { error: payload?.error ?? 'failed to start freebee game' }
    }
    return { id: payload.id }
  },

  /**
   * Render the per-row label for the ClubPage games list. Pure
   * and synchronous: every piece comes off the row's status
   * jsonb (written by submit_word's `common.update_state` calls
   * and submit_timeout / the terminal end_game calls).
   *
   * Mid-game (coop) shape:
   *   { mode, score, total_score, rank_idx, words_found,
   *     total_words }
   *
   * Terminal shapes:
   *   completed:  { outcome: 'completed', score, total_score,
   *                 rank_idx, words_found, total_words, mode }
   *   timeout:    { outcome: 'timeout', score, total_score,
   *                 rank_idx, words_found, total_words, mode }
   *
   * Phase 3 keeps this simple — the score + words count is the
   * canonical "where are we?" answer for FreeBee. Compete-mode
   * label (with leaderboard) is part of the deferred compete UI.
   */
  labelFor: (row) => {
    const s = (row.status ?? {}) as Record<string, unknown>
    const score = (s.score as number | undefined) ?? 0
    const totalScore = (s.total_score as number | undefined) ?? 0
    const wordsFound = (s.words_found as number | undefined) ?? 0
    const totalWords = (s.total_words as number | undefined) ?? 0

    if (row.play_state === 'playing') {
      return `${score}/${totalScore} pts · ${wordsFound}/${totalWords} words`
    }
    if (row.play_state === 'won_compete') {
      return `compete won · ${score}/${totalScore} pts`
    }
    // 'ended' — either 100%-found or timeout.
    const outcome = s.outcome as string | undefined
    if (outcome === 'completed') {
      return `solved · ${score}/${totalScore} pts`
    }
    if (outcome === 'timeout') {
      return `time up · ${score}/${totalScore} pts · ${wordsFound}/${totalWords} words`
    }
    return `done · ${score}/${totalScore} pts`
  },

  /**
   * Called by `<GamePage>` when its countdown timer hits 0.
   * The RPC flips `common.games.play_state='ended'` and writes
   * `status.outcome='timeout'`. Idempotent on the terminal-
   * state check — second concurrent call from a racing peer
   * raises P0001, which we swallow.
   */
  submitTimeout: async (gameId) => {
    const { error } = await db.rpc('submit_timeout', { target_game: gameId })
    if (error) return { error: error.message }
    return {}
  },
}
