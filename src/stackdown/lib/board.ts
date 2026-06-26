/**
 * stackdown — the board geometry + stacking logic, ported verbatim
 * from the prototype's `core.ts` / `main.tsx` (the throwaway tool that
 * pinned the rules down). Pure functions, no React, no supabase — the
 * Board component and the useGame hook both lean on these.
 *
 * The mental model: 30 lettered tiles sit on a fixed grid, some raised
 * onto higher layers so they overlap (and hide) the tiles below. A tile
 * is *exposed* (selectable) when nothing remaining covers it. A word is
 * the ORDER tiles are picked, each pick only legal if exposed at that
 * moment — so the same five letters can spell different words depending
 * on the reveal order (BROAD vs BOARD). The server is the authority on
 * legality; these functions drive the display + the click-eligibility
 * UI so the FE matches what the server will accept.
 *
 * See docs/games/stackdown.md for the full rules and the covering rule.
 */

/** One tile on the board. `tiles` jsonb on `stackdown.games` is an
 *  array of these (the public, non-spoiler half of a board). */
export interface Tile {
  id: number
  /** column, integer grid coordinate */
  x: number
  /** row, integer grid coordinate */
  y: number
  /** layer; 0 = base. Higher tiles draw on top and cover lower ones. */
  z: number
  /** single uppercase A–Z */
  letter: string
}

/**
 * A covers B iff A is on a higher layer AND within one grid cell of B
 * on both axes. The "within one cell" is the diagonal-overlap rule: a
 * raised tile bleeds over the eight cells around its footprint, hiding
 * whatever sits under that bleed.
 */
export function covers(a: Tile, b: Tile): boolean {
  return a.z > b.z && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1
}

/**
 * IDs of the tiles that are exposed (selectable) given a set of
 * already-removed tile IDs. A tile is exposed when, among the tiles
 * that remain, none covers it. Mirrors `stackdown._is_exposed` on the
 * server — the FE uses it to gate clicks and dim un-clickable tiles.
 */
export function exposedIds(tiles: Tile[], removed: Set<number>): Set<number> {
  const rem = tiles.filter((t) => !removed.has(t.id))
  return new Set(
    rem
      .filter((t) => !rem.some((a) => a.id !== t.id && covers(a, t)))
      .map((t) => t.id),
  )
}

/**
 * Depth of each remaining tile below the current clickable frontier:
 * 0 = exposed now (nothing remaining covers it), 1 = exposed once the
 * tiles directly above it go, etc. Recomputed from the tiles still
 * present, so as the board clears the buried layers rise toward 0.
 * Covering is a DAG (a tile only covers strictly-lower layers), so the
 * recursion terminates. Drives the depth shading in <Board>.
 */
export function depthMap(tiles: Tile[]): Map<number, number> {
  const coverers = new Map<number, Tile[]>(
    tiles.map((b) => [b.id, tiles.filter((a) => a.id !== b.id && covers(a, b))]),
  )
  const depth = new Map<number, number>()
  const calc = (t: Tile): number => {
    const cached = depth.get(t.id)
    if (cached !== undefined) return cached
    const cov = coverers.get(t.id)!
    const d = cov.length === 0 ? 0 : 1 + Math.max(...cov.map(calc))
    depth.set(t.id, d)
    return d
  }
  tiles.forEach(calc)
  return depth
}

/**
 * Pick a corner of the tile to draw its letter in so it stays legible
 * under stacking. A covering tile sits diagonally and overlaps the
 * quadrant toward it, so we tuck the letter into a quadrant no
 * remaining tile covers. Exposed tiles (no coverer) center the letter.
 * Recomputed from `present`, so the letter slides back to center as the
 * tiles above it are removed.
 *
 * Returns the corner as a pair of signs in [-1, 0, 1]: cx/cy of 0 means
 * center on that axis, -1 means the low side, 1 the high side.
 */
export function letterCorner(tile: Tile, present: Tile[]): { cx: number; cy: number } {
  const covered = new Set(
    present
      .filter((a) => a.id !== tile.id && covers(a, tile))
      .map((a) => `${Math.sign(a.x - tile.x)},${Math.sign(a.y - tile.y)}`),
  )
  if (covered.size === 0) return { cx: 0, cy: 0 } // exposed → center
  // Prefer a free diagonal corner; the four diagonals are the only
  // quadrants a single diagonal coverer can occupy.
  for (const [cx, cy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    if (!covered.has(`${cx},${cy}`)) return { cx, cy }
  }
  return { cx: 0, cy: 0 } // fully covered (hidden anyway)
}
