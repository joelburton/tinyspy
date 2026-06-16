import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_WORDKNIT_SETUP, type WordknitSetup } from './lib/setup'

/**
 * Wordknit's registration with the shell.
 *
 * "Wordknit" is the codename for our Connections-style word-
 * grouping game (analogous to "Tinyspy" for Codenames Duet).
 * The user-facing copy reads however we like; gametype /
 * schema / folder are all `wordknit`.
 *
 * See docs/wordknit.md for the rules, the architectural
 * decisions (FE-knows-the-answer, Presence + Broadcast for
 * shared selection, pause-on-disconnect), and the deferred
 * features list.
 */
export const wordknitGame: GameManifest = {
  gametype: 'wordknit',
  schema: 'wordknit',
  name: 'Wordknit',
  blurb: 'Match the four hidden categories of four words.',

  // Plays solo (1 player at their solo club) or coop (any number
  // of club members poke at the same board). Must agree with the
  // (absence of a) member-count check in wordknit.create_game.
  // See docs/code-conventions.md → "Per-game player counts".
  numberOfPlayers: [1, null],

  // No manifest-level `timerMode`: wordknit's timer is a
  // per-game choice (the setup dialog has the None / Up / Down
  // radio). BoardScreen reads `game.config.timer` to drive
  // useGameTimer. The GameManifest field is preserved for
  // future games that want a fixed per-gametype timer (e.g. a
  // hypothetical Boggle with a fixed-3-minute round).

  PlayArea: lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
  ),

  // Setup form: timer-mode picker (None / Up / Down with MM:SS).
  // The Component is lazy-loaded so the form ships in wordknit's
  // chunk (not the registry); `defaults` is a tiny literal that
  // travels with the manifest.
  setupForm: {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_WORDKNIT_SETUP,
  },

  // SetupGameDialog calls this on submit. The RPC validates the
  // payload shape and writes the new game; the board is hardcoded
  // server-side for the POC.
  //
  // playerUserIds defaults to "everyone in the club" today via the
  // dialog wrapper — the picker-UI for selecting a subset hasn't
  // landed yet (deferred). Behavior matches today: every game has
  // every club member in its game_players.
  startGameInClub: async (clubId, setup, playerUserIds) => {
    const s = setup as WordknitSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubId,
        setup: s,
        player_user_ids: playerUserIds,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? 'failed to start wordknit game' }
    }
    return { id: data.id }
  },

  // Render the per-row label from a common.games row. Pure,
  // synchronous: every piece comes off the row.
  //
  // Mid-game `status` carries `{ matched_count, mistake_count }`
  // (written by submit_guess via common.update_state). Terminal
  // `status` carries `{ outcome, matched_count, mistake_count }`
  // (set by submit_guess / submit_timeout via common.end_game).
  labelFor: (row) => {
    const s = (row.status ?? {}) as Record<string, unknown>
    const matched = (s.matched_count as number | undefined) ?? 0
    const mistakes = (s.mistake_count as number | undefined) ?? 0
    if (row.play_state === 'playing') {
      return `${matched}/4 categories · ${mistakes}/4 mistakes`
    }
    if (row.play_state === 'solved') {
      return `solved · ${mistakes} mistakes`
    }
    return `lost · ${matched}/4 matched`
  },

  // Called by common's GamePage when its countdown timer hits 0.
  // The RPC flips wordknit.games.status to 'lost' and writes
  // status_summary.outcome='lost_timeout'. Idempotent on the
  // terminal-state check.
  submitTimeout: async (gameId) => {
    const { error } = await db.rpc('submit_timeout', { target_game: gameId })
    if (error) return { error: error.message }
    return {}
  },
}

