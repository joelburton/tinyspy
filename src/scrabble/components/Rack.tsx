import { cls } from '../../common/lib/cls'
import { BLANK, LETTER_VALUES } from '../lib/board'
import styles from './Rack.module.css'

/** One rack slot. `rackIdx` is its stable index in the acting rack;
 *  `used` slots are already staged on the board. */
export type RackTile = { glyph: string; rackIdx: number }

/**
 * The player's tile rack. Press-and-drag a tile onto the board to place it
 * (PlayArea runs the shared gesture); a plain tap toggles the tile's
 * selection for Exchange. Staged tiles show greyed; exchange-selected tiles
 * highlight. The container carries `data-zone="rack"` so a board tile
 * dragged back here is recalled.
 */
export function Rack({
  tiles,
  used,
  selected,
  flashIds,
  active,
  onPointerDown,
}: {
  tiles: RackTile[]
  used: Set<number>
  selected: Set<number>
  /** Rack slots to outline yellow for a beat (freshly-drawn tiles). */
  flashIds: Set<number>
  active: boolean
  onPointerDown: (rackIdx: number, glyph: string, e: React.PointerEvent) => void
}) {
  return (
    <div className={styles.rack} data-zone="rack">
      {tiles.map(({ glyph, rackIdx }) => {
        const isUsed = used.has(rackIdx)
        const isBlank = glyph === BLANK
        return (
          <div
            key={rackIdx}
            data-rack-tile
            onPointerDown={(e) => {
              if (active && !isUsed) onPointerDown(rackIdx, glyph, e)
            }}
            className={cls(
              styles.tile,
              isBlank && styles.blank,
              isUsed && styles.used,
              selected.has(rackIdx) && styles.selected,
              flashIds.has(rackIdx) && styles.flashNew,
            )}
          >
            <span className={styles.letter}>{isBlank ? '' : glyph}</span>
            {!isBlank && <span className={styles.value}>{LETTER_VALUES[glyph] ?? 0}</span>}
          </div>
        )
      })}
    </div>
  )
}
