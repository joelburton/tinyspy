import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_WORDKNIT_SETUP, type WordknitSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

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
  shortDescription: 'Find categories, like Connections',
  logoUrl,

  // Help / rules modal opened from the GamePage menu's "Help"
  // item. Lazy-loaded so the help content ships in wordknit's
  // chunk, not the main bundle.
  help: lazy(() =>
    import('./components/Help').then((m) => ({ default: m.Help })),
  ),

  // Plays solo (1 player at their solo club) or coop (up to 6 club
  // members poke at the same board). Must agree with the
  // member-count check in wordknit.create_game. See
  // docs/code-conventions.md → "Per-game player counts".
  numberOfPlayers: [1, 6],

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
  // payload shape and writes the new game.
  //
  // **Find-or-create**: wordknit's one-game-per-(club, puzzle)
  // model means that if this club has already started a game on
  // the picked puzzle, we open the existing game rather than
  // create a duplicate. The setup form's calendar widget shows
  // this status visually (colored squares for played dates); the
  // dialog's Start button maps to "open it" or "create it"
  // depending on which it is, with no FE branching above this
  // function — `SetupGameDialog` always navigates to the
  // returned id regardless.
  //
  // RLS makes the lookup safe: `wordknit.games.select where
  // club_id = X and puzzle_id = Y` only returns rows this user
  // can see (i.e. games in clubs they're a member of), so the
  // .eq('club_id', clubId) is belt-and-braces. maybeSingle()
  // tolerates the no-existing-game case as `data === null`.
  //
  // playerUserIds defaults to "everyone in the club" today via
  // the dialog wrapper — the picker-UI for selecting a subset
  // hasn't landed yet (deferred). Behavior matches today: every
  // newly-created game has every club member in its game_players.
  startGameInClub: async (clubId, setup, playerUserIds) => {
    const s = setup as WordknitSetup

    // Existing-game check first. A real id in `data` means the
    // friends played this puzzle before in this club; we open
    // that game rather than create a new one. `maybeSingle()`
    // returns `data: null` cleanly when nothing matches.
    const existing = await db
      .from('games')
      .select('id')
      .eq('club_id', clubId)
      .eq('puzzle_id', s.puzzleId)
      .maybeSingle()
    if (existing.data) return { id: existing.data.id }

    // No prior game — create one. The RPC is the same as before.
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
  // The RPC flips common.games.play_state to 'lost' and writes
  // status.outcome='lost_timeout'. Idempotent on the terminal-
  // state check.
  submitTimeout: async (gameId) => {
    const { error } = await db.rpc('submit_timeout', { target_game: gameId })
    if (error) return { error: error.message }
    return {}
  },
}

