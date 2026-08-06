import type { E2EClub, E2EMember } from '../helpers/fixtures'

/**
 * The screenshot gallery's per-game contract (docs/gallery-plan.md).
 *
 * One module per game under `e2e/gallery/games/`, the same per-game seam shape
 * the repo already uses for `lib/history.ts` and `lib/setupSummary.ts`.
 *
 * ── The one rule ────────────────────────────────────────────────────────────
 * **Build state through the game's own RPCs, never by writing rows.** A gallery
 * exists to answer "does this look right?", so it must never show a state a
 * player couldn't reach — otherwise you go hunting a layout bug in a screen
 * that doesn't exist. Going through the RPCs also means the rules aren't
 * duplicated here, and it costs nothing: no browser is involved either way.
 *
 * Direct SQL is available as an escape hatch for anything the RPCs genuinely
 * can't reach — comment each use with WHY, because each one is a small lie.
 *
 * ── Terminal states come from SETUP, not from playing ───────────────────────
 * Driving wordle to a loss is six rounds of realtime waiting; creating it with
 * one guess is instant. letterboxed with `extra_words: 0` is two words from a
 * full chain. The `create<Game>Game` fixtures already take these parameters.
 */

/** A moment in a game's life worth photographing. */
export type Phase =
  /** Just created — nobody has moved. The empty board every game opens on. */
  | 'fresh'
  /** Some moves in, nothing decided. Where a game spends its life. */
  | 'mid'
  /** Terminal, and the players did it. */
  | 'won'
  /**
   * Terminal, and they didn't.
   *
   * **One per mode, and prefer the game's OWN losing condition** — out of
   * guesses, out of time, stack not cleared. A concede or a manual stop is
   * SHELL behaviour that renders near-identically in all fifteen games, so
   * spending the slot on it means the sheet shows you the shared chrome
   * fifteen times and the game's real defeat screen never.
   *
   * Fall back to concede only where a game has no natural loss — letterboxed
   * compete is the case: undo refunds, so the only way a non-conceded player
   * stops racing is by winning. Note it on the cell when you do, so the sheet
   * says why.
   */
  | 'lost'

export const PHASES: readonly Phase[] = ['fresh', 'mid', 'won', 'lost']

/** One tile of the contact sheet, before it's been photographed. */
export type Cell = {
  mode: 'coop' | 'compete'
  phase: Phase
  /** Shown under the tile when this cell needs a word of explanation
   *  ("2 players", "1-guess game"). Optional. */
  note?: string
}

/** What a builder hands back: a game in the requested state, and who to view it as. */
export type BuiltGame = {
  gametype: string
  id: string
  /** The seat to screenshot from. Compete shows different things per player, so
   *  the builder chooses whose view is the interesting one. */
  viewer: E2EMember
}

export type GameGallery = {
  /** The game's CODE name (docs/naming.md) — file names, anchors, GAMES=. */
  game: string
  /**
   * The player-facing BRAND ("SnakeBox", "MothCubes"), for the sheet's heading:
   * "SnakeBox (letterboxed)". Both names, because the sheet is read by someone
   * thinking in brands and edited by someone thinking in code names.
   *
   * Restated here rather than read from `manifest.BRAND`, which would be the
   * single source of truth — a plain node script can't import the manifests,
   * since they reach into `.css` and `.svg`. Keep it in step by hand; it's one
   * string per game and the sheet shows it at the top of every section.
   */
  brand: string
  /**
   * The cells this game HAS. Ragged on purpose: bananagrams is compete-only,
   * codenamesduet coop-only, and several games have no natural loss. A cell
   * that isn't listed shows as a hole in the sheet, which is information —
   * it says nobody has looked at that state.
   */
  cells: Cell[]
  /** How many club members this game's cells need (compete wants ≥ 2). */
  members: number
  /** Put a game into `cell`'s state and return it. RPCs only — see above. */
  build: (club: E2EClub, cell: Cell) => Promise<BuiltGame>
}
