import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_PSYCHICNUM_SETUP, type PsychicnumSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * Psychic Num's registration with the shell. Mirrors the shape
 * of `src/tinyspy/manifest.ts` — see that file for the deeper
 * commentary on lazy-loading the Root, why gametype/schema/name
 * are separate fields, and how the registry pattern preserves
 * "remove a game in three actions."
 *
 * Psychic Num is a deliberately minimal game added second to
 * prove the multi-game architecture works (the same shell, the
 * same ClubPage, the same chat — all unchanged — pick up a new
 * game by virtue of this one file plus an entry in
 * `src/games.ts`).
 */
export const psychicnumGame: GameManifest = {
  gametype: 'psychicnum',
  schema: 'psychicnum',
  name: 'Psychic Num',
  shortDescription: 'Guess the secret number',
  logoUrl,

  // Help / rules modal opened from the GamePage menu's "Help"
  // item. Lazy-loaded so the help content ships in psychic-num's
  // chunk, not the main bundle.
  help: lazy(() =>
    import('./components/Help').then((m) => ({ default: m.Help })),
  ),

  // Psychic Num plays solo or with up to 6 club members — the
  // game logic doesn't care how many people are guessing, the
  // cap is just the project-wide "open-N" default. Must agree
  // with the member-count check in psychicnum.create_game. See
  // docs/code-conventions.md → "Per-game player counts" for the
  // cross-reference convention.
  numberOfPlayers: [1, 6],

  PlayArea: lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
  ),

  // Per-game setup form: a single-fieldset guess-budget radio.
  // The Component is lazy-loaded so the form ships in
  // psychicnum's chunk (not the registry); `defaults` is a tiny
  // literal that travels with the manifest. See
  // src/common/lib/games.ts for the split's reasoning.
  setupForm: {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_PSYCHICNUM_SETUP,
  },

  // Called by SetupGameDialog when the player clicks Start. The
  // RPC picks the random target server-side, validates the setup
  // shape, initializes guesses_remaining from setup.guesses, and
  // (via common.create_game) flips is_current_view=true on the new
  // common.games row — auto-suspending any prior current-view game
  // in the club per the one-current-view-per-club invariant
  // enforced by the partial unique index on common.games.
  //
  // The `unknown` → PsychicnumSetup cast is safe because we own
  // both ends of the boundary (this manifest's setupForm
  // Component is the only thing populating the wrapper's value).
  startGameInClub: async (clubId, setup, playerUserIds) => {
    const s = setup as PsychicnumSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubId,
        setup: s,
        player_user_ids: playerUserIds,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? 'failed to start psychic num game' }
    }
    return { id: data.id }
  },

  // Render the per-row label from a common.games row. Pure,
  // synchronous: every piece comes off the row.
  //
  // Mid-game `status` carries `{ guesses_remaining }` (written by
  // submit_guess via common.update_state). Terminal-on-win
  // `status` carries `{ outcome, guesses_used, winner_username }`
  // — the username is frozen by the RPC at end-of-game time so
  // the label renders without a follow-up profile fetch. Stale
  // on rename is fine (rare; arguably the right thing to show
  // anyway, since it's "who they were when they won"). Terminal-
  // on-loss `status` carries `{ outcome, guesses_used }`.
  labelFor: (row) => {
    const s = (row.status ?? {}) as Record<string, unknown>
    if (row.play_state === 'playing') {
      const remaining = (s.guesses_remaining as number | undefined) ?? 0
      const word = remaining === 1 ? 'guess' : 'guesses'
      return `${remaining} ${word} left`
    }
    if (row.play_state === 'won') {
      const name = (s.winner_username as string | undefined) ?? 'someone'
      return `won — ${name} guessed it`
    }
    return 'lost'
  },

  // Called by common's GamePage when its countdown timer hits 0.
  // The RPC flips this gametype's play_state to 'lost' and writes
  // common.games.status.outcome='lost_timeout'. Idempotent on the
  // terminal-state check, so peers racing to fire is fine.
  submitTimeout: async (gameId) => {
    const { error } = await db.rpc('submit_timeout', { target_game: gameId })
    if (error) return { error: error.message }
    return {}
  },
}
