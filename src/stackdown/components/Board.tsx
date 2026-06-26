import { useMemo } from 'react'
import { depthMap, exposedIds, letterCorner, type Tile } from '../lib/board'
import styles from './Board.module.css'

// Tile size is decoupled from grid spacing for readability (ported from
// the prototype). STEP is the pixels per grid cell; tiles are two cells
// apart, so a STEP above TILE/2 opens a gap between same-layer tiles and
// shrinks the raised-tile overlap (overlap = TILE − STEP), exposing more
// of each covered letter.
const TILE = 55
const STEP = 32
const PAD = 26

/**
 * Lightness by depth below the clickable frontier — brightest at the
 * top (exposed now), fading to a soft floor at the board's deepest
 * layer. `maxDepth` is taken from the FULL board so a given depth always
 * maps to the same shade and the whole stack lightens as it clears.
 */
function depthColor(depth: number, maxDepth: number): string {
  const TOP = 86 // depth 0 (exposed) — brightest
  const FLOOR = 60 // deepest layer — a soft floor, not near-black
  const lightness = maxDepth === 0 ? TOP : TOP - (depth / maxDepth) * (TOP - FLOOR)
  return `hsl(41 42% ${lightness}%)`
}

const align = (c: number) => (c < 0 ? 'flex-start' : c > 0 ? 'flex-end' : 'center')

/**
 * The stackdown board: the 30 lettered tiles drawn on their fixed grid,
 * stacked by layer. Only the tiles still on the board are painted (the
 * caller passes `offBoard` — the union of accepted-word tiles and the
 * tiles currently picked up into the word being built). Exposed tiles
 * are clickable; covered tiles are dimmed and inert.
 *
 * Display logic is ported wholesale from the prototype: paint in
 * ascending z so higher tiles sit on top; shade by depth below the
 * frontier; tuck each letter into a corner the stack isn't covering.
 */
export function Board({
  tiles,
  offBoard,
  active,
  highlight,
  onTileClick,
}: {
  tiles: Tile[]
  offBoard: Set<number>
  active: boolean
  /** Tile ids to outline in red (a typed letter matched more than one). */
  highlight: ReadonlySet<number>
  onTileClick: (tileId: number) => void
}) {
  const present = useMemo(
    () => tiles.filter((t) => !offBoard.has(t.id)).sort((a, b) => a.z - b.z),
    [tiles, offBoard],
  )
  const exposed = useMemo(() => exposedIds(tiles, offBoard), [tiles, offBoard])
  const depths = useMemo(() => depthMap(present), [present])
  // The full board's deepest layer fixes the color ramp.
  const maxDepth = useMemo(
    () => Math.max(0, ...depthMap(tiles).values()),
    [tiles],
  )

  const maxX = Math.max(0, ...tiles.map((t) => t.x))
  const maxY = Math.max(0, ...tiles.map((t) => t.y))
  // Natural square side in the prototype's px units. Tiles are positioned
  // as PERCENTAGES of it, so the canvas can be sized responsively (see
  // Board.module.css) and the whole stack scales with it — bigger on a
  // roomy viewport, still on-screen on a small one. The geometry is square
  // (maxX === maxY); take the max so a non-square layout would still fit.
  const natural = PAD * 2 + Math.max(maxX, maxY) * STEP + TILE
  const pct = (px: number) => `${(px / natural) * 100}%`

  return (
    <div className={styles.canvas}>
      {present.map((t) => {
        const isExp = exposed.has(t.id)
        const corner = letterCorner(t, present)
        return (
          <button
            type="button"
            key={t.id}
            className={
              highlight.has(t.id) ? `${styles.tile} ${styles.flash}` : styles.tile
            }
            disabled={!isExp || !active}
            onClick={() => onTileClick(t.id)}
            style={{
              left: pct(PAD + t.x * STEP),
              top: pct(PAD + t.y * STEP),
              width: pct(TILE),
              height: pct(TILE),
              zIndex: t.z,
              background: depthColor(depths.get(t.id) ?? 0, maxDepth),
              cursor: isExp && active ? 'pointer' : 'default',
              justifyContent: align(corner.cx),
              alignItems: align(corner.cy),
            }}
          >
            {t.letter}
          </button>
        )
      })}
    </div>
  )
}

export { TILE, STEP, PAD }
