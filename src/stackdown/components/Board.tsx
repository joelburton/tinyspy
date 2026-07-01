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
 * Shade by covering-depth below the clickable frontier, off the SHARED warm tile
 * ramp (common/theme.css `--tile-1..4`): depth 0 (exposed now) = shade 1, deeper
 * layers = 2, 3, 4 (deepest). The direct depth→shade map means a given depth
 * always reads the same shade, and a tile lightens a step each time a cover clears
 * (its depth drops). Clamped at 4 — the fixed 30-tile geometry is 4 layers deep.
 */
function depthColor(depth: number): string {
  return `var(--tile-${1 + Math.min(depth, 3)})`
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
              background: depthColor(depths.get(t.id) ?? 0),
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
