import type { Session } from '@supabase/supabase-js'
import type { ComponentType } from 'react'

/**
 * What `<GamePage>` exposes to each game's PlayArea via its
 * render-prop children. The shell wraps PlayArea in a `<GamePage>`
 * at the route level (`<GamePage>{(ctx) => <PlayArea {...ctx} />}</GamePage>`);
 * GamePage runs `useCommonGame` and hands these values down.
 *
 * Anything cross-cutting that PlayArea needs to render game-
 * specific content (members for attribution; timer for
 * "Out of time" copy) lives here. Anything chrome-related
 * (paused, missing, manuallyPausedBy, sendManualPause, the
 * commonGame.title) stays inside GamePage and never enters
 * the game's render.
 *
 * `session` and `gameId` are re-exposed so the shell can write
 * `<PlayArea {...ctx} />` without separately threading them.
 */
export type GamePageCtx = {
  session: Session
  gameId: string
  members: SetupMember[]
  timer: {
    displaySeconds: number
    expired: boolean
  }
}

/**
 * One club member's identity, surfaced into per-game setup forms
 * so they can render member-aware choices (e.g. Tinyspy's "who
 * gives the first clue?" picker). Shape matches what ClubPage
 * already builds for its roster + chat panel — passed straight
 * through, no transformation.
 */
export type SetupMember = {
  user_id: string
  username: string
}

/**
 * Props a per-game setup-form body receives from the common
 * `SetupGameDialog` wrapper. The body is **controlled**: state
 * lives in the wrapper, the body renders `value` and signals
 * edits via `onChange`. The wrapper is the one place that holds
 * the form state, persists defaults, and decides when to fire
 * `startGameInClub`.
 *
 * `value` and `onChange` are typed `unknown` at this boundary so
 * `GameManifest` can stay non-generic (the registry holds
 * `GameManifest[]`, which can't carry per-game type parameters).
 * Each game's setup component starts with a single
 * `value as TinyspySetup` cast at the top and is then fully
 * typed inside.
 */
export type SetupBodyProps = {
  members: SetupMember[]
  value: unknown
  onChange: (next: unknown) => void
}

/**
 * What a game's manifest declares about its setup form: the
 * lazy-loaded body component plus the initial values the wrapper
 * uses to seed its state when the dialog opens.
 *
 * Lazy-loading means the form ships in the game's chunk, not in
 * the registry bundle. A first-time click on "Start" pays a tiny
 * fetch (cached for the session afterwards); the trade is that
 * the registry stays a thin manifest of gametypes — the same
 * argument that justifies lazy-loading `Root`. See
 * docs/common.md for the "inline what the club page renders
 * idle; lazy-load what's gated behind user intent" rule.
 *
 * `defaults` lives directly in the manifest (NOT lazy-loaded)
 * because the wrapper needs an initial setup value the moment
 * the modal opens — before the chunk has arrived. It's a tiny
 * object literal so the size cost is negligible.
 *
 * Naming note: the manifest field is `setupForm` (the *form
 * definition*) to keep it cleanly distinct from `<gametype>.games.setup`
 * (the form *output*, frozen onto the game row). Same root word
 * because they're two faces of the same concept; the suffix tells
 * you which face you have. See docs/naming.md.
 */
export type GameSetupForm = {
  Component: ComponentType<SetupBodyProps>
  defaults: unknown
}

/**
 * Manifest exported by each game's `manifest.ts`. The shell consumes
 * the registry of manifests (`src/games.ts`) and never names a
 * specific game directly. This is what makes adding or removing a
 * game a one-line change in the registry.
 *
 * See docs/common.md for the "removability in three actions" rule
 * that motivates the manifest pattern.
 */
export type GameManifest = {
  /**
   * Stable identifier for the gametype — URL-safe, matches the game's
   * Postgres schema name by convention. Used for registry lookups and
   * (eventually) the URL slug when more than one gametype is registered.
   *
   * Terminology: `gametype` is the *category* (`tinyspy`, `boggle`,
   * `crosswords`), distinct from `game` (a specific playing instance)
   * and `board` (a static starting configuration that can be shared).
   * Treated as one word like `username`, so the field is lowercase,
   * not `gameType`.
   */
  gametype: string

  /**
   * Postgres schema where the game's tables and RPCs live. Same as
   * `gametype` by convention, but kept as a separate field so the type
   * communicates "the schema is the address of the DB side" alongside
   * "gametype is the address of the FE side." If they ever diverge, we
   * don't have to overload one string.
   */
  schema: string

  /** Human-readable name shown in pickers and titles. */
  name: string

  /** One-line description for use in pickers and previews. */
  blurb: string

  /**
   * Optional timer declaration. Default (omitted) = no timer.
   * Wordknit sets `{ kind: 'countdown', seconds: 600 }` today;
   * tinyspy and psychic-num omit. See `TimerMode` above for the
   * shape and `useGameTimer` for the consumer.
   */
  timerMode?: TimerMode

  /**
   * Supported player-count range. The shell uses this to decide
   * whether a "Start X" button is rendered for a given club:
   *
   *   - hidden if there's no `common.clubs_gametypes` row for
   *     (club, gametype)
   *   - visible-but-disabled (with a "needs N members" tooltip)
   *     if the row exists but the club's member count is outside
   *     `numberOfPlayers`
   *   - enabled if both checks pass
   *
   * Shape: `[min, max | null]`. Use `null` for no upper bound
   * (e.g. psychic-num plays with any number of members).
   * Exact-match games use the same number for both ends
   * (tinyspy is `[2, 2]`).
   *
   * MUST AGREE with the member-count check in this gametype's
   * `create_game` RPC — there's no automated sync, just a
   * cross-reference comment in both places. See
   * docs/code-conventions.md → "Per-game player counts" for the
   * convention. If they drift, the failure mode is loud (FE
   * shows Start, RPC rejects with the actual member-count
   * constraint) rather than silent.
   */
  numberOfPlayers: [number, number | null]

  /**
   * The game's PlayArea — the gametype-specific play surface
   * the shell mounts inside `<GamePage>` once the URL resolves
   * to a specific game. Lazy-loaded so each game's bundle ships
   * as a separate Vite chunk.
   *
   * The shell renders this as the render-prop child of GamePage:
   *
   *     <GamePage gameId={...} session={...} gametype={...}>
   *       {(ctx) => <manifest.PlayArea {...ctx} />}
   *     </GamePage>
   *
   * So PlayArea receives `GamePageCtx` (session, gameId, members,
   * timer) at the JSX site and never needs to thread any of it
   * itself.
   */
  PlayArea: ComponentType<GamePageCtx>

  /**
   * Per-game setup-form declaration shown in a modal before
   * `create_game` fires. `null` for games whose start-button
   * needs no choices — the dialog is bypassed and
   * `startGameInClub` is called directly. (No game uses `null`
   * today now that all three games have setup options, but the
   * shape is preserved so a future zero-setup game can opt out
   * without needing an empty form.)
   */
  setupForm: GameSetupForm | null

  /**
   * Start a new game of this gametype inside the given club.
   * Receives:
   *   - clubId: the club to start the game in
   *   - setup: the typed setup value the dialog wrapper collected
   *     from the setup form, or `null` for `setupForm: null`
   *   - playerUserIds: explicit list of who's actually playing this
   *     game. The FE's setup dialog defaults this to all current
   *     club members; a future player-picker UI lets the player
   *     pick a subset. The caller does NOT have to be in the list
   *     (a club member can facilitate a game between others).
   *
   * The game's own implementation casts setup to its narrow shape
   * and forwards everything to its `create_game` RPC (which
   * validates server-side — the FE setup is not trusted).
   *
   * Returns the new game's id on success, or `{error}` whose
   * message the UI surfaces verbatim.
   *
   * Each game implements this against its own RPCs. The function
   * lives ON the manifest so common code (`ClubPage`,
   * `SetupGameDialog`) can iterate `games` and offer a setup
   * dialog + start affordance per gametype without ever importing
   * from a game folder — preserving the import-direction rules
   * from docs/code-conventions.md.
   */
  startGameInClub: (
    clubId: string,
    setup: unknown,
    playerUserIds: string[],
  ) => Promise<{ id: string } | { error: string }>

  /**
   * List this gametype's games for a club. The common ClubPage
   * iterates the games registry, calls each manifest's
   * fetchClubGames in parallel, and merges + classifies the results
   * into active/paused/completed sections.
   *
   * Each entry tells us:
   *   - `gameId`        — the id to route to (`/g/<gameType>/<gameId>`)
   *   - `gameType`      — back-pointer to the manifest's gametype
   *                        (redundant but keeps merged arrays
   *                        self-describing)
   *   - `startedAt`     — for sort + "started <date>" display
   *   - `isTerminal`    — game has ended (won, lost, solved, etc.).
   *                        ClubPage uses this + the club's active
   *                        pointer to classify the row as one of
   *                        active / paused / completed.
   *   - `statusLabel`   — free-form display string the game owns
   *                        ("in progress", "won", "lost (assassin)",
   *                        "13/15 agents", etc.). ClubPage renders
   *                        verbatim.
   */
  fetchClubGames: (clubId: string) => Promise<ClubGameEntry[]>

  /**
   * Fire the per-gametype timeout RPC. Called by the common
   * `GamePage` when `useGameTimer.expired` flips true in
   * countdown mode. Each gametype's RPC is idempotent on its
   * terminal-state check (P0001 'game is not active' on a second
   * concurrent call) — the FE swallows that, so peers racing to
   * fire the timeout is fine.
   *
   * Why per-gametype instead of one common.submit_timeout: the
   * RPCs each flip their own `<gametype>.games.status` to the
   * gametype-specific lost-state (wordknit's 'lost', tinyspy's
   * 'lost_clock', psychic-num's 'lost') and call common.end_game
   * with a `status_summary` carrying gametype-specific counters
   * (mistake_count, turns_used, guesses_used). A consolidated
   * common RPC would force per-gametype dispatch on the SQL side;
   * dispatching here is cleaner.
   */
  submitTimeout: (gameId: string) => Promise<{ error?: string }>
}

/**
 * One game's-eye view of itself within a club, for the ClubPage's
 * games section. See `GameManifest.fetchClubGames` for fields.
 */
export type ClubGameEntry = {
  gameType: string
  gameId: string
  startedAt: string
  isTerminal: boolean
  statusLabel: string
}

/**
 * Per-gametype timer declaration. Read by the `useGameTimer` hook
 * inside each game's BoardScreen to decide which mode to render.
 *
 *   - `none` — no timer; the header shows just whatever the game
 *     uses for at-a-glance status. Tinyspy and Psychic Num today.
 *   - `countup` — informational, ticks up from game-creation
 *     time. "It took us 8 minutes to solve." Display-only;
 *     doesn't drive any state change.
 *   - `countdown` — ticks down from `seconds` toward zero.
 *     When it hits zero, `useGameTimer` flips `expired: true`,
 *     which the game's BoardScreen uses to fire a per-game
 *     timeout RPC (e.g. `wordknit.submit_timeout`). The game's
 *     status flips to a terminal value; realtime propagates the
 *     loss to all clients.
 *
 * See docs/wordknit.md → "Timer" for the broader pattern,
 * including the deliberate "browser-side, no server sync"
 * choice and the drift it implies.
 */
export type TimerMode =
  | { kind: 'none' }
  | { kind: 'countup' }
  | { kind: 'countdown'; seconds: number }

/**
 * Does a club's member count fall inside a gametype's supported
 * range? `range[1] === null` means "no upper bound."
 *
 * Pure helper — used by both ClubPage (deciding to enable/disable
 * a Start button) and HomePage (deciding which solo-game buttons
 * to surface).
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
 * Examples:
 *   [2, 2]    → "Needs exactly 2 members"
 *   [1, 4]    → "Needs 1–4 members"
 *   [3, null] → "Needs at least 3 members"
 *   [1, null] → "Needs at least 1 member" (but this never disables)
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
