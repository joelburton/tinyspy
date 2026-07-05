import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
import { db } from './db'
import { CROSSWORDS_DEFAULTS, type CrosswordsSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * crosswords' registration with the shell — **two manifests, one schema,
 * one folder.** Codename `crosswords`; the user-facing brand is `BRAND`.
 * Both manifests share the PlayArea, SetupForm, Help, and CSS; mode
 * branches in the RPCs / at render time. See docs/games/crosswords.md.
 *
 * Start-game goes straight to `crosswords.create_game` (the library path,
 * like stackdown) — the puzzle already exists in the library. The
 * NYT-by-date path (an edge function) lands in a later stage.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
)
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/** Direct `create_game` RPC (contrast boggle's board-builder edge fn). */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (clubHandle: string, setup: unknown, playerUserIds: string[]) => {
    const s = setup as CrosswordsSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
        mode,
      })
      .single()
    if (error || !data) return { error: error?.message ?? `failed to start ${brand} (${mode})` }
    return { id: data.id }
  }
}

const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

/** Start is blocked until a library puzzle is chosen. */
const validate = (setup: unknown): string | null =>
  (setup as CrosswordsSetup).puzzle_id ? null : 'Pick a puzzle to start.'

type StatusBlob = Record<string, unknown>

/** Coop club-page label: the puzzle title, plus the terminal outcome. */
function coopLabel(row: { play_state: string; status: StatusBlob | null }): string {
  const title = (row.status?.title as string | undefined) ?? 'Crossword'
  if (row.play_state === 'playing') return title
  if (row.play_state === 'won') return `${title} · solved`
  return `${title} · ended`
}

/** Compete club-page label: rank-only, no per-player progress in the listing. */
function competeLabel(row: { play_state: string; status: StatusBlob | null }): string {
  const title = (row.status?.title as string | undefined) ?? 'Crossword'
  if (row.play_state === 'playing') return `${title} · racing`
  if (row.play_state === 'won_compete') {
    const winner = row.status?.winner_username as string | undefined
    return winner ? `${title} · ${winner} won` : `${title} · won`
  }
  return `${title} · ended`
}

// The single source of truth for this game's user-facing brand name.
const BRAND = 'CrossPlay'

export const crosswordsCoopGame: GameManifest = {
  gametype: 'crosswords_coop',
  schema: 'crosswords',
  baseGametype: 'crosswords',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Solve a crossword together',
  logoUrl,
  help: helpLoader,
  // Solo (1, in a solo club) or coop (up to 8). Agrees with create_game.
  numberOfPlayers: [1, 8],
  PlayArea: playAreaLoader,
  setupForm: {
    Component: setupFormLoader,
    defaults: CROSSWORDS_DEFAULTS,
    validate,
  },
  startGameInClub: startGameInClubFactory('coop', BRAND),
  labelFor: coopLabel,
  submitTimeout,
  // Coop has a whole-table "end now" (a neutral mutual give-up).
  endGame,
}

export const crosswordsCompeteGame: GameManifest = {
  gametype: 'crosswords_compete',
  schema: 'crosswords',
  baseGametype: 'crosswords',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race the same crossword',
  logoUrl,
  help: helpLoader,
  // Compete needs an opponent; the RPC enforces ≥2 too.
  numberOfPlayers: [2, 8],
  PlayArea: playAreaLoader,
  setupForm: {
    Component: setupFormLoader,
    defaults: CROSSWORDS_DEFAULTS,
    validate,
  },
  startGameInClub: startGameInClubFactory('compete', BRAND),
  labelFor: competeLabel,
  submitTimeout,
  // No whole-table end in compete — dropping out is per-player `concede`.
}
