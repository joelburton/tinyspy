import type { Session } from '@supabase/supabase-js'
import type { ComponentType } from 'react'

/**
 * Props the shell hands to a game's Root component. A Root takes
 * over once the user is authenticated and the shell has resolved the
 * URL to a specific game. The shell stays game-agnostic; it parses
 * `/g/<gametype>/<gameId>`, looks up the manifest by `<gametype>`,
 * and mounts that manifest's Root with the extracted `gameId`.
 *
 * Per-game Roots no longer parse URLs themselves — they receive
 * `gameId` as a prop. App.tsx also keys each Root by `gameId`, so
 * navigating from one game to another remounts the Root and gets
 * a clean state slate (no stale subscriptions or cached fetches).
 *
 * As cross-cutting needs emerge (theme switching, presence, club
 * selection), they get added here in one place and every game's
 * Root gets them automatically.
 */
export type GameRootProps = {
  session: Session
  /**
   * The id of the specific game to load. Extracted from the URL by
   * App.tsx (the second path segment of `/g/<gametype>/<gameId>`).
   * Roots can trust this is non-empty — App.tsx wouldn't have
   * mounted them otherwise.
   */
  gameId: string
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
 * `value as TinyspyConfig` cast at the top and is then fully
 * typed inside.
 */
export type SetupBodyProps = {
  members: SetupMember[]
  value: unknown
  onChange: (next: unknown) => void
}

/**
 * What a game's manifest declares about its setup form: the
 * lazy-loaded body component plus the initial config the wrapper
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
 * because the wrapper needs an initial config the moment the
 * modal opens — before the chunk has arrived. It's a tiny
 * object literal so the size cost is negligible.
 */
export type GameSetup = {
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
   * The game's root component. Renders whatever the game needs once
   * the shell has resolved a `/g/<gametype>/<gameId>` URL and found
   * this manifest by `gametype`. Lazy-loaded so each game's bundle
   * ships as a separate Vite chunk.
   */
  Root: ComponentType<GameRootProps>

  /**
   * Per-game setup options shown in a modal before `create_game`
   * fires. `null` for games whose start-button needs no choices —
   * the dialog is bypassed and `startGameInClub` is called
   * directly. (No game uses `null` today now that both Tinyspy
   * and Psychic Num have configurable options, but the shape is
   * preserved so a future zero-config game can opt out without
   * needing an empty form.)
   */
  setup: GameSetup | null

  /**
   * Start a new game of this gametype inside the given club.
   * Receives the typed config the dialog wrapper collected from
   * the setup form, or `null` when the manifest declared
   * `setup: null`. The game's own implementation casts the
   * config to its narrow shape and forwards it to its
   * `create_game` RPC (which validates the shape server-side —
   * the FE config is not trusted).
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
    config: unknown,
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
