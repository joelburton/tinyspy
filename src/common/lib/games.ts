import type { Session } from '@supabase/supabase-js'
import type { ComponentType } from 'react'

/**
 * Props the shell hands to a game's Root component. A Root takes
 * over once the user is authenticated — owning its own gameId state,
 * URL-hash mirroring, and home/lobby/board routing. The shell stays
 * game-agnostic.
 *
 * As cross-cutting needs emerge (theme switching, presence, club
 * selection), they get added here in one place and every game's
 * Root gets them automatically.
 */
export type GameRootProps = {
  session: Session
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
   * The game's root component. Handles everything from "signed in and
   * landed on this game" onward — its own home/lobby/in-game state
   * machine, its own URL hash mirroring, its own RPC calls.
   */
  Root: ComponentType<GameRootProps>
}
