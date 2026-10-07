// cs-fixed-outcome-fix

import { useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import { depthMap, exposedIds, letterCorner } from '../lib/board'
import type { GTile } from '../types'
import { Tile } from './Tile'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Board.module.css'

// Tile size is decoupled from grid spacing for readability. STEP is the
// pixels per grid cell; tiles are two cells
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

function align(c: number) {
  return c < 0 ? 'flex-start' : c > 0 ? 'flex-end' : 'center'
}

/** What the live board is marking, by tile id. */
type BoardMarks = {
  // The tiles a typed letter matched more than one of: ringed red.
  ambiguousTileIds: ReadonlySet<string>
  // The word a viewed past turn played: ringed green. Empty while live.
  litTileIds: ReadonlySet<string>
  // Tiles taking the attention flash — "something happened here".
  attentionTileIds: ReadonlySet<string>
  // A teammate's answer on their tiles, once the attention flash has faded.
  // The word is the caller's — `lib/answer.ts` decided it, and the board only
  // paints it.
  answer: { tileIds: ReadonlySet<string>; outcome: Outcome } | null
  // Tiles the server has taken that are still drawn while their answer is
  // read. They take no clicks.
  heldTileIds: ReadonlySet<string>
}

/**
 * The stackdown board: the 30 lettered tiles drawn on their fixed grid,
 * stacked by layer, each one a `<Tile>`. Only the tiles still on the board are
 * painted (the caller passes `offTileIds` — the cleared tiles and the ones
 * picked up into the word being built). Exposed tiles are clickable; covered
 * tiles are dimmed and inert.
 *
 * The board decides each tile's geometry, shade and marks: paint in ascending
 * z so higher tiles sit on top; shade by depth below the frontier; tuck each
 * letter into a corner the stack isn't covering.
 */
export function Board({
  tiles,
  offTileIds,
  isInteractive,
  isViewingHistory,
  endingOutcome,
  marks,
  onPick,
}: {
  tiles: GTile[]
  offTileIds: ReadonlySet<string>
  // The board takes moves: an exposed tile is clickable.
  isInteractive: boolean
  // Draw the shared "viewing a past turn" frame around the whole board.
  isViewingHistory: boolean
  // How I came out, for the ended board's frame; null while I still play.
  endingOutcome: EndOutcome | null
  marks: BoardMarks
  onPick: (tile: GTile) => void
}) {
  const present = useMemo(
    () => tiles.filter((t) => !offTileIds.has(t.id)).sort((a, b) => a.z - b.z),
    [tiles, offTileIds],
  )
  const exposed = useMemo(() => exposedIds(tiles, offTileIds), [tiles, offTileIds])
  const depths = useMemo(() => depthMap(present), [present])

  const maxX = Math.max(0, ...tiles.map((t) => t.x))
  const maxY = Math.max(0, ...tiles.map((t) => t.y))
  // Natural square side in px units. Tiles are positioned
  // as PERCENTAGES of it, so the canvas can be sized responsively (see
  // Board.module.css) and the whole stack scales with it — bigger on a
  // roomy viewport, still on-screen on a small one. The geometry is square
  // (maxX === maxY); take the max so a non-square layout would still fit.
  const natural = PAD * 2 + Math.max(maxX, maxY) * STEP + TILE

  function pct(px: number) {
    return `${(px / natural) * 100}%`
  }

  return (
    <div
      className={cls(
        shared.boardSeal,
        styles.canvas,
        isViewingHistory && history.historyFrame,
        makeEndingFrameClasses(endingOutcome, isViewingHistory),
      )}
    >
      {present.map((t) => {
        const corner = letterCorner(t, present)
        return (
          <Tile
            key={t.id}
            tile={t}
            placement={{
              left: pct(PAD + t.x * STEP),
              top: pct(PAD + t.y * STEP),
              size: pct(TILE),
              z: t.z,
              fill: depthColor(depths.get(t.id) ?? 0),
              justifyContent: align(corner.cx),
              alignItems: align(corner.cy),
            }}
            marks={{
              isAmbiguous: marks.ambiguousTileIds.has(t.id),
              isLit: marks.litTileIds.has(t.id),
              hasAttention: marks.attentionTileIds.has(t.id),
              answer: marks.answer?.tileIds.has(t.id) ? marks.answer.outcome : null,
            }}
            isPickable={exposed.has(t.id) && isInteractive && !marks.heldTileIds.has(t.id)}
            onClick={onPick}
          />
        )
      })}
    </div>
  )
}
