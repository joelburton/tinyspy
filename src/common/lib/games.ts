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
 * Manifest exported by each game's `manifest.ts`. The shell consumes
 * the registry of manifests (`src/games.ts`) and never names a
 * specific game directly. This is what makes adding or removing a
 * game a one-line change in the registry.
 *
 * See docs/naming.md for the "removability in three actions" rule
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
   * Start a new game of this gametype inside the given club. Called
   * by the club page's "Start X" button (one per registered game).
   * Returns the new game's id on success, or null + an error message
   * the UI can surface verbatim.
   *
   * Each game implements this against its own RPCs (Tinyspy calls
   * tinyspy.create_game(target_club); Boggle eventually will call
   * boggle.create_game with whatever shape it wants). The function
   * lives ON the manifest so common code (ClubPage) can iterate
   * `games` and offer a button per gametype without ever importing
   * from a game folder — preserving the import-direction rules from
   * docs/naming.md.
   */
  startGameInClub: (clubId: string) => Promise<{ id: string } | { error: string }>

  /**
   * List this gametype's games for a club. The common ClubPage
   * iterates the games registry, calls each manifest's
   * fetchClubGames in parallel, and merges + classifies the results
   * into active/paused/completed sections.
   *
   * Each row tells us:
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
  fetchClubGames: (clubId: string) => Promise<ClubGameRow[]>
}

/**
 * One game's-eye view of itself within a club, for the ClubPage's
 * games section. See `GameManifest.fetchClubGames` for fields.
 */
export type ClubGameRow = {
  gameType: string
  gameId: string
  startedAt: string
  isTerminal: boolean
  statusLabel: string
}
