import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_MONKEYGRAM_SETUP, type MonkeyGramSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * MonkeyGram's registration with the shell — a SINGLE manifest.
 *
 * MonkeyGram is compete-only, so (like tinyspy, which is coop-only)
 * it's one `common.gametypes` row and one Start button — no
 * coop/compete sibling pair, hence the bare `gametype: 'monkeygram'`
 * (the `_compete` suffix only earns its keep when there's a `_coop`
 * sibling sharing the schema). `mode: 'compete'` still tags the
 * interaction axis for any code that reads it.
 *
 * Solo is allowed: `numberOfPlayers` starts at 1 (a one-player race
 * is "finish your own tiles"), unlike the psychicnum/wordknit/freebee
 * compete siblings whose lower bound is 2.
 */
export const monkeygramGame: GameManifest = {
  gametype: 'monkeygram',
  schema: 'monkeygram',
  baseGametype: 'monkeygram',
  mode: 'compete',
  name: 'MonkeyGram',
  shortDescription: 'Race to lay out all your tiles',
  logoUrl,

  help: lazy(() =>
    import('./components/Help').then((m) => ({ default: m.Help })),
  ),

  // Solo race up to a 6-player table. MUST AGREE with the
  // require_player_count_max(6) call in monkeygram.create_game. See
  // docs/code-conventions.md → "Per-game player counts".
  numberOfPlayers: [1, 6],

  PlayArea: lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
  ),

  setupForm: {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_MONKEYGRAM_SETUP,
  },

  // Single gametype → no `mode` in the payload (the RPC writes
  // 'monkeygram' directly). The server deals the starter hands and
  // validates the setup shape; the FE-collected setup isn't trusted.
  startGameInClub: async (clubHandle, setup, playerUserIds) => {
    const s = setup as MonkeyGramSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? 'failed to start MonkeyGram game' }
    }
    return { id: data.id }
  },

  // Per-row label for the ClubPage games list. Pure + synchronous.
  // We don't write a mid-game status to common.games (progress lives
  // on monkeygram.progress), so "in progress" is the live label; the
  // 'won' label reads the winner from status, which is written when a
  // player goes out — that terminal is detected inside `peel`, not by
  // a dedicated RPC. The 'ended' label covers the manual end_game stop.
  labelFor: (row) => {
    if (row.play_state === 'playing') return 'in progress'
    if (row.play_state === 'won') {
      const s = (row.status ?? {}) as Record<string, unknown>
      const name = (s.winner_username as string | undefined) ?? 'someone'
      return `won — ${name} finished first`
    }
    // Manual stop (end_game): terminal with no winner. Without this the
    // ClubPage would show the raw enum 'ended'.
    if (row.play_state === 'ended') return 'game ended'
    return row.play_state
  },

  // v1 is untimed (setup.timer is always { kind: 'none' }), so the
  // GamePage countdown never fires this. Present to satisfy the
  // manifest contract; no monkeygram timeout RPC exists.
  submitTimeout: async () => ({}),
}
