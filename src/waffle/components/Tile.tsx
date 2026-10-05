// cs-unmet

import { cls } from '@/common/utils/cls'
import { getTileColor } from '@/shared/wordle-style/tileColor'
import tileColors from '@/shared/wordle-style/tileColors.module.css'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Tile.module.css'
import type { GTile } from '../types'

/** What this screen adds to a tile: worn on it, never in the blob. */
type TileMarks = {
  // Picked for a swap.
  isPicked: boolean
  isUnderCursor: boolean
  // Its swap is out with the server: drawn unjudged, under the in-flight dim.
  isInFlight: boolean
  // Just changed under the player: the attention flash.
  isFlashing: boolean
  // The viewed past swap moved it: ringed in the history color.
  isHistoryLit: boolean
}

/**
 * One tile of waffle's board, as a button: its letter on its color, and the
 * marks this screen adds. A tap picks it, a drag swaps it; the board decides
 * what either means.
 */
export function Tile({
  tile,
  marks,
  isDisabled,
  isDraggable,
  onClick,
  onDragStart,
  onDrop,
  onDragEnd,
}: {
  tile: GTile
  marks: TileMarks
  isDisabled: boolean
  // A MOUSE affordance: off on a touch device, and while the board is inert.
  isDraggable: boolean
  onClick: () => void
  onDragStart: () => void
  onDrop: () => void
  // The drag is over, dropped or not.
  onDragEnd: () => void
}) {
  // A tile in flight is unjudged: its color was the old letter's.
  const colorClass = marks.isInFlight ? styles.inFlight : tileColors[getTileColor(tile.color)]
  return (
    <button
      type="button"
      // A stable e2e hook: class names are hashed.
      data-tile={tile.id}
      className={cls(
        shared.tileFace,
        shared.tile,
        colorClass,
        marks.isPicked && shared.picked,
        marks.isUnderCursor && shared.selectionCursor,
        marks.isInFlight && shared.dimInFlight,
        marks.isFlashing && shared.attentionFlash,
        marks.isHistoryLit && styles.historyTile,
      )}
      // A test handle; the capitals are drawn by hand because CSS cannot reach
      // an attribute.
      aria-label={`${tile.letter.toUpperCase()} (${marks.isInFlight ? 'blank' : getTileColor(tile.color)})`}
      aria-pressed={marks.isPicked}
      disabled={isDisabled}
      draggable={isDraggable}
      // NOT a focus target — but by BLUR rather than by the mousedown guard the
      // other boards use, because these tiles DRAG. Native HTML5 drag needs the
      // mousedown default: `preventDefault` there stops `dragstart` firing at
      // all. So the click hands focus straight back instead — a clicked tile
      // still focused is promoted to `:focus-visible` by the next keystroke, and
      // the browser ring then sits on it until you click elsewhere.
      onClick={(e) => {
        e.currentTarget.blur()
        onClick()
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      // A completed drag fires no click, so blur here too — otherwise the
      // dragged tile keeps focus and the next keystroke rings it.
      onDragEnd={(e) => {
        e.currentTarget.blur()
        onDragEnd()
      }}
    >
      <span className={styles.letter}>{tile.letter}</span>
    </button>
  )
}
