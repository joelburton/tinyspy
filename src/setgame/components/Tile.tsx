// cs-unmet

import { decode } from '../lib/tiles'
import { SHAPE_PATHS, SYMBOL_BOX, SYMBOL_LAYOUT, SYMBOL_STROKE, TILE_BOX } from '../lib/shapes'
import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Tile.module.css'
import type { GTile } from '../types'

/** What the board says about a tile, beside the tile itself. */
type TileMarks = {
  // Part of the claim I am building.
  isPicked: boolean
  // Ringed, from either of its two causes: a live coop hint ("there is a set
  // through this tile") or a viewed past turn's own tiles.
  isRinged: boolean
  // In a claim on its way to the server.
  isInFlight: boolean
  // In the set a claim just found, held on screen for its beat.
  isFound: boolean
  // Dealt by the claim that just landed.
  isNew: boolean
}

/**
 * One tile, drawn as inline SVG.
 *
 * A tile is four attributes and the drawing spends one visual channel on each:
 * COUNT is how many symbols, SHAPE is which path, COLOR is the hue, and FILL
 * is solid, striped (a `<pattern>`, `TileDefs`), or open (no fill, just the
 * outline). Nothing is decorative; every mark on the face is information,
 * which is why the face is otherwise bare.
 *
 * Symbol size does NOT vary with the count — one symbol is the same size as
 * each of three, exactly as on a real card — so `count` changes how many are
 * drawn and nothing else about the layout.
 *
 * The board decides which marks a tile wears (`TileMarks`); the tile decides
 * how each is drawn. No mark is a fill: a fill would bury the symbols, and
 * the symbols are the whole of a tile.
 */
export function Tile({
  tile,
  marks,
  isDisabled = false,
  readOnly = false,
  onClick,
}: {
  tile: GTile
  marks?: TileMarks
  isDisabled?: boolean
  // Draw the tile as a READOUT rather than a control — a plain box, not a
  // button. Used by the last-set panel, where the tiles are something to look
  // at rather than something to press.
  //
  // Not the same as `isDisabled`, and the difference bit: a disabled <button>
  // picks up the global `button:disabled { opacity: 0.5 }`, which on a tile
  // dims the very colors that ARE its content. A readout is simply not a
  // button, so nothing has to be overridden.
  readOnly?: boolean
  onClick?: () => void
}) {
  const { count, color, fill, shape } = decode(tile)
  const hue = `var(--setgame-${color})`
  const paint = fill === 'solid' ? hue : fill === 'striped' ? `url(#setgame-stripe-${color})` : 'none'

  // The symbols sit in a centered row. Computing the offsets here (rather than
  // with flexbox inside the SVG, which does not exist) keeps the whole face one
  // coordinate system, which is also what a printer would need.
  const { width: w, gap, height: h } = SYMBOL_LAYOUT
  const total = count * w + (count - 1) * gap
  const left = (TILE_BOX.width - total) / 2
  const top = (TILE_BOX.height - h) / 2

  const className = cls(
    styles.tile,
    readOnly && styles.readOnly,
    marks?.isPicked && styles.picked,
    marks?.isRinged && styles.ringed,
    marks?.isFound && cls(shared.verdictWon, styles.found),
    marks?.isInFlight && shared.dimInFlight,
    marks?.isNew && shared.attentionFlash,
  )

  const face = (
    <svg
      className={styles.face}
      viewBox={`0 0 ${TILE_BOX.width} ${TILE_BOX.height}`}
      // SLICE, not the default `meet`: where the tile's box is SHORTER than
      // TILE_BOX — which is exactly what mobile does, to buy the board width
      // back from the status bar — this crops the empty margin above and
      // below the symbols instead of shrinking them to fit. The symbols are
      // only 0.63 of the box's height, so there is whitespace to spend before
      // anything of the art is touched.
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <g
          key={i}
          transform={
            `translate(${left + i * (w + gap)} ${top})`
            + ` scale(${w / SYMBOL_BOX.width} ${h / SYMBOL_BOX.height})`
          }
          fill={paint}
          stroke={hue}
          strokeWidth={SYMBOL_STROKE}
        >
          <path d={SHAPE_PATHS[shape]} />
        </g>
      ))}
    </svg>
  )

  if (readOnly) return <div className={className}>{face}</div>

  return (
    <button
      type="button"
      className={className}
      disabled={isDisabled}
      data-tile={tile.id}
      onClick={onClick}
    >
      {face}
    </button>
  )
}
