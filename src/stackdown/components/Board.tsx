// cs-unmet

import { useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import { depthMap, exposedIds, letterCorner, type Tile } from '../lib/board'
import history from '@/common/turn-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
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
 * Covering-depth below the clickable frontier → a shade of the SHARED warm tile
 * ramp, deepest last. A given depth always reads the same shade, so a tile
 * lightens a step each time a cover clears.
 *
 * Written out rather than composed from the index: a `--tile-${n}` template
 * makes these four the only readers of the ramp that a search for the token
 * cannot find.
 */
const DEPTH_FILL = [
  'var(--tile-1-fill-color)',
  'var(--tile-2-fill-color)',
  'var(--tile-3-fill-color)',
  'var(--tile-4-fill-color)',
]

/** Deeper than the ramp goes clamps to the last shade; the fixed 30-tile
 *  geometry is exactly four layers deep, so today nothing reaches the clamp. */
function depthColor(depth: number): string {
  return DEPTH_FILL[Math.min(depth, DEPTH_FILL.length - 1)]
}

const align = (c: number) => (c < 0 ? 'flex-start' : c > 0 ? 'flex-end' : 'center')

/** Shared empty tile set — the live board rings nothing. */
const NO_TILES: ReadonlySet<number> = new Set()

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
  ambiguousTiles,
  historyLitTiles = NO_TILES,
  isViewingHistory = false,
  onTileClick,
  attention = NO_TILES,
  answer = null,
  held = NO_TILES,
}: {
  tiles: Tile[]
  offBoard: Set<number>
  active: boolean
  // Tile ids to outline in red (a typed letter matched more than one).
  ambiguousTiles: ReadonlySet<number>
  // The word a viewed past turn played — ringed green. Omitted / empty while live.
  historyLitTiles?: ReadonlySet<number>
  // Draw the shared "viewing a past turn" frame around the whole board. Off
  // during live play.
  isViewingHistory?: boolean
  onTileClick: (tileId: number) => void
  // Tiles taking the attention flash — "something happened here".
  attention?: ReadonlySet<number>
  // A teammate's answer on their tiles, once the attention flash has faded:
  // the outcome's own fill, and a refusal shakes.
  answer?: { ids: ReadonlySet<number>; tone: 'won' | 'lost' } | null
  // Tiles the server has taken that are still being shown while their answer
  // is read. They are drawn like any other tile and take no clicks.
  held?: ReadonlySet<number>
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
    <div className={cls(styles.canvas, isViewingHistory && history.historyFrame)}>
      {present.map((t) => {
        const isExp = exposed.has(t.id)
        const corner = letterCorner(t, present)
        const isHeld = held.has(t.id)
        const answered = answer?.ids.has(t.id) ?? false
        return (
          <button
            type="button"
            key={t.id}
            className={cls(
              styles.tile,
              ambiguousTiles.has(t.id) && styles.flash,
              historyLitTiles.has(t.id) && styles.historyTile,
              // The answer landing here: the attention flash first, then the
              // outcome's color, and a refusal shakes once the color shows.
              attention.has(t.id) && shared.attentionFlash,
              answered && answer?.tone === 'lost' && shared.verdictShake,
            )}
            disabled={!isExp || !active || isHeld}
            onClick={() => onTileClick(t.id)}
            style={{
              left: pct(PAD + t.x * STEP),
              top: pct(PAD + t.y * STEP),
              width: pct(TILE),
              height: pct(TILE),
              zIndex: t.z,
              // A tile wearing an answer takes that outcome's fill and its white
              // ink, exactly as a word's slots do below the board — the same
              // event, the same two colors, wherever you are sitting.
              background: answered
                ? `var(--outcomes-${answer?.tone === 'won' ? 'won' : 'lost'}-fill-color)`
                : depthColor(depths.get(t.id) ?? 0),
              ...(answered ? { color: 'var(--ink-onDark-color)' } : {}),
              cursor: isExp && active ? 'pointer' : 'default',
              justifyContent: align(corner.cx),
              alignItems: align(corner.cy),
            }}
          >
            {/* The letter is LIFTED above the attention flash: that mark is an
                absolutely-positioned overlay, and one of those paints over
                in-flow text — so without this the flash hides the letter it is
                pointing at (common/game-page/playArea.module.css). */}
            <span className={styles.letter}>{t.letter}</span>
          </button>
        )
      })}
    </div>
  )
}

export { TILE, STEP, PAD }
