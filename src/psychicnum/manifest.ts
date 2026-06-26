import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_PSYCHICNUM_SETUP, type PsychicnumSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * psychicnum's registration with the shell — **two manifests,
 * one schema, one folder.**
 *
 * psychicnum exists in coop and compete modes, each a separate
 * row in `common.gametypes` ('psychicnum_coop',
 * 'psychicnum_compete') and a separate Start button on the
 * club page. Both share:
 *
 *   - the `psychicnum` schema (tables, RPCs, RLS — see
 *     supabase/migrations/20260615000002_psychicnum.sql)
 *   - the folder `src/psychicnum/` (PlayArea, SetupForm, Help,
 *     useGame, theme.css, logo.svg)
 *   - the docs file `docs/games/psychicnum.md`
 *
 * They differ on:
 *
 *   - `gametype` string, used as the URL segment + registry key.
 *   - `name` shown in titles and Start-button copy.
 *   - `mode` declaration (the canonical axis for downstream
 *     code that wants to distinguish behavior — see
 *     GameManifest.mode in src/common/lib/games.ts).
 *   - `numberOfPlayers`: coop allows solo (`[1, 6]`), compete
 *     requires an opposing player (`[2, 6]`).
 *   - `labelFor`: terminal copy reads differently per mode.
 *
 * Both share `baseGametype: 'psychicnum'` — the family key any
 * code wanting "treat these as siblings" reads. Today the
 * registry filters by gametype string; tomorrow, ClubPage may
 * render baseGametype siblings as a single grouped block.
 *
 * The single shared `startGameInClub` builds the RPC payload
 * with the per-manifest mode injected — `psychicnum.create_game`
 * routes on it server-side.
 */

// Help loader is shared — both modes link to the same rules
// modal. Lazy so the prose ships in psychicnum's chunk.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared — branches on `manifest.mode` (or, at
// runtime, on `common.games.gametype` to derive mode) when
// rendering history + budget strip.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
)

// SetupForm is shared — guesses + timer, no mode picker (mode
// is locked at gametype level now, not a setup choice).
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

// Shared start-game caller. `mode` is the per-manifest constant
// — the RPC routes on it to write the right gametype string +
// per-mode end-game vocabulary.
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => {
    const s = setup as PsychicnumSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
        mode,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? `failed to start ${brand} (${mode}) game` }
    }
    return { id: data.id }
  }
}

// Shared per-row label for the ClubPage games list. Pure,
// synchronous — everything comes off the row.
//
// Mid-game `status` carries `{ guesses_remaining }`. Terminal-
// on-win carries `{ outcome, guesses_used, winner_username }`.
// Terminal-on-loss carries `{ outcome, guesses_used }`.
//
// play_state vocabulary:
//   coop:    'playing' / 'won' / 'lost'
//   compete: 'playing' / 'won_compete' / 'lost_compete'
//
// Each mode's labelFor handles its own play_state set; the
// shared helper below covers what's identical between them.
type StatusBlob = Record<string, unknown>
// Mode is no longer prefixed (the card's <ModePill> shows it); this is
// just the bare mid-game progress.
function labelMidGame(row: { status: StatusBlob | null }) {
  const s = (row.status ?? {}) as StatusBlob
  const remaining = (s.guesses_remaining as number | undefined) ?? 0
  const word = remaining === 1 ? 'guess' : 'guesses'
  return `${remaining} ${word} left`
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it. The brand
// keeps its display casing; code identifiers are the lowercase codename.
const BRAND = 'PsychicNum'

export const psychicnumCoopGame: GameManifest = {
  gametype: 'psychicnum_coop',
  schema: 'psychicnum',
  baseGametype: 'psychicnum',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Guess the secret number together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with the server-side
  // require_player_count_max(6) call in psychicnum.create_game.
  numberOfPlayers: [1, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_PSYCHICNUM_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    if (row.play_state === 'playing') return labelMidGame(row)
    if (row.play_state === 'won') {
      const name = (s.winner_username as string | undefined) ?? 'someone'
      return `won — ${name} guessed it`
    }
    // 'ended' is the neutral manual-stop terminal (end_game).
    if (row.play_state === 'ended') return 'ended'
    return 'lost'
  },

  submitTimeout: async (gameId) => {
    const { error } = await db.rpc('submit_timeout', { target_game: gameId })
    if (error) return { error: error.message }
    return {}
  },
}

export const psychicnumCompeteGame: GameManifest = {
  gametype: 'psychicnum_compete',
  schema: 'psychicnum',
  baseGametype: 'psychicnum',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to guess the secret number',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER — racing yourself is
  // degenerate. Lower bound 2 hides the Start button in solo
  // clubs; the RPC also enforces this server-side.
  numberOfPlayers: [2, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_PSYCHICNUM_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete', BRAND),

  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    if (row.play_state === 'playing') return labelMidGame(row)
    if (row.play_state === 'won_compete') {
      const name = (s.winner_username as string | undefined) ?? 'someone'
      return `${name} won the race`
    }
    // 'ended' is the neutral manual-stop terminal (end_game).
    if (row.play_state === 'ended') return 'ended'
    return 'time/budget out — no winner'
  },

  submitTimeout: async (gameId) => {
    const { error } = await db.rpc('submit_timeout', { target_game: gameId })
    if (error) return { error: error.message }
    return {}
  },
}
