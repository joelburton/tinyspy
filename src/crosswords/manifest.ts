import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { invokeStartGameEdgeFn, makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
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
 * NYT-by-date path (the `crosswords-import-nyt` edge function) creates a
 * self-contained game inline instead; see `docs/games/crosswords.md` §6.
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

/**
 * Start branches on the puzzle source:
 *  - **library** → straight to the `create_game` RPC (like stackdown);
 *  - **NYT** → the `crosswords-import-nyt` edge function (fetch → import →
 *    create), which owns the error-context unwrap via `invokeStartGameEdgeFn`;
 *  - **upload** → the FE already parsed the file into `setup.board`, so we call
 *    `create_game` directly with the inline `board` arg (self-contained game,
 *    like NYT). The board is STRIPPED from the persisted `setup` blob so the
 *    solution never lands in the unshielded status / saved-default.
 */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (clubHandle: string, setup: unknown, playerUserIds: string[]) => {
    const s = setup as CrosswordsSetup
    if (s.source === 'nyt') {
      return invokeStartGameEdgeFn(
        'crosswords-import-nyt',
        { target_club: clubHandle, setup: s, player_user_ids: playerUserIds, mode },
        brand,
      )
    }
    // Upload: pass the parsed board inline (create_game's `board` arg). The
    // board + filename are stripped from the setup that create_game stores as
    // status / saved-default — UNCONDITIONALLY, not just on the upload tab. A
    // parsed board can linger in `s` after a tab-switch (the SetupForm segment
    // buttons spread the prior setup: `onChange({ ...s, source: 'library' })`),
    // so a library/NYT start could otherwise persist a stale solution grid into
    // the unshielded `setup`, whence it self-perpetuates through the club's
    // saved default. See docs/games/crosswords.md §5 and the server backstop in
    // create_game (`setup - 'board' - 'filename'`).
    const board = s.source === 'upload' ? s.board : undefined
    const setupToStore: CrosswordsSetup = { ...s }
    delete setupToStore.board
    delete setupToStore.filename
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: setupToStore,
        player_user_ids: playerUserIds,
        mode,
        ...(board ? { board } : {}),
      })
      .single()
    if (error || !data) return { error: error?.message ?? `failed to start ${brand} (${mode})` }
    return { id: data.id }
  }
}

const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

/** Start is blocked until a puzzle is chosen (library) / a date is set (NYT) /
 *  a file is parsed (upload). */
const validate = (setup: unknown): string | null => {
  const s = setup as CrosswordsSetup
  if (s.source === 'nyt') return s.date ? null : 'Pick a date.'
  if (s.source === 'upload') return s.board ? null : 'Choose a .puz or .ipuz file.'
  return s.puzzle_id ? null : 'Pick a puzzle to start.'
}

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
  // Shared notepad (coop) / private per-player pad (compete — a shared pad
  // would leak solving progress).
  scratchpad: { enabled: true, perPlayerInCompete: true },
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
  // Shared notepad (coop) / private per-player pad (compete — a shared pad
  // would leak solving progress).
  scratchpad: { enabled: true, perPlayerInCompete: true },
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
