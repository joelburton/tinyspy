import type { Session } from '@supabase/supabase-js'
import type { ComponentType } from 'react'

/**
 * What `<GamePage>` exposes to each game's PlayArea via its
 * render-prop children:
 *
 *     <GamePage gameId={...} session={...} gametype={...}>
 *       {(ctx) => <manifest.PlayArea {...ctx} />}
 *     </GamePage>
 *
 * GamePage runs `useCommonGame` and hands these values down.
 * Anything chrome-related (paused, missing, manuallyPausedBy,
 * the suspend-confirm dialog) stays inside GamePage and never
 * enters a per-game render.
 */
export type GamePageCtx = {
  session: Session
  gameId: string
  /** Everyone in this game's `common.game_players`. See
   *  [Member] for why this is `players` (game context) and
   *  not `members` (club context). */
  players: Member[]
  /** Gametype-specific play_state string from
   *  `common.games.play_state`. Pair with `isTerminal` for the
   *  gate; use the string itself for specific banner copy. See
   *  docs/states.md. */
  playState: string
  /** Materialized "any terminal play_state" from
   *  `common.games.is_terminal`. */
  isTerminal: boolean
  timer: {
    displaySeconds: number
    expired: boolean
  }
}

/**
 * One person's identity, with the three fields every render
 * site needs: id, username, color.
 *
 * Same shape covers chat-message sender (club context) and
 * game player (game context). The naming distinction is at the
 * **variable** level — `members: Member[]` in club code,
 * `players: Player[]` in game code, where each game declares
 * its own `Player` alias on top of `Member`. See
 * docs/naming.md → "member" and "player" for the full
 * rationale.
 */
export type Member = {
  user_id: string
  username: string
  /** Palette name from `common.profiles.color`. Pass through
   *  `colorVarFor` (src/common/lib/peerColor.ts) for the
   *  matching CSS variable. */
  color: string
}

/**
 * Props the per-game setup-form body receives from the common
 * `SetupGameDialog` wrapper. **Controlled**: state lives in the
 * wrapper, the body renders `value` and signals edits via
 * `onChange`.
 *
 * `value` and `onChange` are `unknown` here so `GameManifest`
 * can stay non-generic (the registry holds `GameManifest[]`,
 * which can't carry per-game type parameters). Each game's
 * setup component starts with `value as MySetup` at the top
 * and is fully typed inside.
 */
export type SetupBodyProps = {
  members: Member[]
  /** Club the game would start in. Per-game setup forms that
   *  need club-scoped data read it; the rest ignore it. */
  clubId: string
  value: unknown
  onChange: (next: unknown) => void
}

/**
 * Per-game setup-form declaration: the lazy-loaded body
 * component plus the initial value the wrapper seeds state with
 * when the dialog opens.
 *
 * `Component` is lazy so the form ships in the game's chunk.
 * `defaults` is NOT lazy because the wrapper needs an initial
 * value the moment the modal opens — before the chunk arrives.
 * It's a tiny literal so the size cost is negligible.
 */
export type GameSetupForm = {
  Component: ComponentType<SetupBodyProps>
  defaults: unknown
}

/**
 * Manifest exported by each game's `manifest.ts`. The shell
 * consumes the registry of manifests (`src/games.ts`) and never
 * names a specific game directly — see docs/common.md for the
 * "removability in three actions" rule that motivates this.
 */
export type GameManifest = {
  /**
   * Stable identifier for the gametype — URL-safe, matches the
   * Postgres schema name by convention. Used for registry
   * lookups and as the URL segment in `/g/<gametype>/<id>`.
   * Lowercase one-word (`gametype`, not `gameType`); see
   * docs/naming.md.
   */
  gametype: string

  /**
   * Postgres schema where the game's tables and RPCs live. Same
   * as `gametype` by convention. Kept separate so "DB-side
   * address" stays distinct from "FE-side address" — if they
   * ever diverge, one string doesn't have to do both jobs.
   */
  schema: string

  /** Human-readable name shown in pickers and titles. */
  name: string

  /** One-line description for use in pickers and previews. */
  blurb: string

  /**
   * Per-gametype baseline timer. Optional; default is no timer.
   * When set, every game of this gametype runs with it. When
   * the manifest omits it, individual games may still opt into
   * a timer per-game via their setup form (`common.games.setup.timer`).
   */
  timerMode?: TimerMode

  /**
   * Supported player-count range `[min, max | null]`. `null` =
   * no upper bound. Exact-match games use the same number for
   * both ends (e.g. `[2, 2]`).
   *
   * The shell uses this to decide whether the "Start" button is
   * hidden / disabled / enabled (in combination with the
   * club's `common.clubs_gametypes` row).
   *
   * MUST AGREE with the member-count check in this gametype's
   * `create_game` RPC — no automated sync, just paired
   * cross-reference comments. Drift fails loudly (RPC rejects);
   * see docs/code-conventions.md → "Per-game player counts."
   */
  numberOfPlayers: [number, number | null]

  /**
   * The gametype-specific play surface. Mounted inside
   * `<GamePage>` and receives `GamePageCtx` (see above).
   * Lazy-loaded so each game ships as its own Vite chunk.
   */
  PlayArea: ComponentType<GamePageCtx>

  /**
   * Per-game setup-form declaration shown in a modal before
   * `create_game` fires. `null` skips the dialog and calls
   * `startGameInClub` directly — preserved for a future
   * zero-setup game.
   */
  setupForm: GameSetupForm | null

  /**
   * Start a new game of this gametype inside the given club.
   * Receives:
   *   - clubId
   *   - setup: the typed value the dialog wrapper collected
   *     (or `null` when `setupForm: null`)
   *   - playerUserIds: who's actually playing. The dialog
   *     defaults this to every current club member; the caller
   *     does NOT have to be in the list.
   *
   * Returns `{ id }` on success or `{ error }` whose message
   * the UI surfaces verbatim. Server-side validation is the
   * trust boundary — the FE-collected setup is not trusted.
   *
   * Lives on the manifest so common code (ClubPage,
   * SetupGameDialog) can iterate `games` without importing from
   * a game folder, preserving the import-direction rules.
   */
  startGameInClub: (
    clubId: string,
    setup: unknown,
    playerUserIds: string[],
  ) => Promise<{ id: string } | { error: string }>

  /**
   * Render a one-line label for a single `common.games` row,
   * for the ClubPage games list. **Pure and synchronous** — no
   * I/O, no follow-up queries — everything labelFor needs comes
   * off the row.
   *
   * That contract is what keeps the listing one-query: ClubPage
   * fetches `common.games` for the club, then dispatches each
   * row to the matching manifest's labelFor. The state-transition
   * RPCs are responsible for writing whatever the gametype's
   * labelFor needs into `common.games.status` (jsonb) — the
   * duplicate-write discipline; see docs/states.md.
   */
  labelFor: (row: CommonGameListRow) => string

  /**
   * Fire this gametype's timeout RPC. Called by GamePage when
   * `useGameTimer.expired` flips true in countdown mode.
   *
   * Each gametype's RPC is idempotent on its terminal-state
   * check — the FE swallows the "already terminal" error so
   * peers racing to fire the timeout is fine.
   *
   * Per-gametype rather than one common.submit_timeout because
   * each RPC writes its own gametype-specific terminal state +
   * status jsonb. Dispatching at the FE keeps the SQL side from
   * needing per-gametype branches.
   */
  submitTimeout: (gameId: string) => Promise<{ error?: string }>
}

/**
 * The slice of a `common.games` row the per-gametype `labelFor`
 * sees. Stays narrow on purpose: anything labelFor needs must
 * live on `common.games` (status jsonb covers the gametype-
 * specific payload). That's the contract that keeps the
 * listing path one-query and synchronous.
 */
export type CommonGameListRow = {
  id: string
  gametype: string
  play_state: string
  is_terminal: boolean
  status: Record<string, unknown> | null
}

/**
 * Per-game timer declaration, consumed by `useGameTimer`:
 *
 *   - `none` — no timer.
 *   - `countup` — display-only; ticks up from game-creation
 *     time. Doesn't drive state changes.
 *   - `countdown` — ticks down from `seconds`. At zero,
 *     `useGameTimer.expired` flips true; the per-gametype
 *     `submitTimeout` fires; the game flips to a terminal
 *     play_state.
 *
 * See docs/wordknit.md → "Timer" for the browser-side / no-
 * server-sync choice.
 */
export type TimerMode =
  | { kind: 'none' }
  | { kind: 'countup' }
  | { kind: 'countdown'; seconds: number }

/**
 * Does a player count fall inside a gametype's supported range?
 * `range[1] === null` means "no upper bound." Used by ClubPage
 * (Start button enable/disable) and HomePage (which solo-game
 * buttons to surface).
 */
export function playerCountFits(
  range: GameManifest['numberOfPlayers'],
  count: number,
): boolean {
  const [min, max] = range
  if (count < min) return false
  if (max !== null && count > max) return false
  return true
}

/**
 * Human-readable description of the player-count requirement,
 * for tooltip text on a disabled Start button.
 *
 *   [2, 2]    → "Needs exactly 2 members"
 *   [1, 4]    → "Needs 1–4 members"
 *   [3, null] → "Needs at least 3 members"
 */
export function playerCountLabel(
  range: GameManifest['numberOfPlayers'],
): string {
  const [min, max] = range
  if (max === null) {
    return `Needs at least ${min} ${min === 1 ? 'member' : 'members'}`
  }
  if (min === max) {
    return `Needs exactly ${min} ${min === 1 ? 'member' : 'members'}`
  }
  return `Needs ${min}–${max} members`
}
