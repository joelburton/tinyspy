// cs-unmet

import { BLANK } from '../lib/board'
import { Tile } from './Tile'
import styles from './Rack.module.css'

/**
 * The rack I play from, in my own display order. Press-and-drag a tile onto
 * the board to stage it (the board column runs the shared gesture); a plain
 * tap picks it for a swap, or puts it back.
 *
 * The tray carries `data-zone="rack"`, so a staged tile dragged back over it
 * is taken back, and each slot `data-rack-tile`, so a tile dropped along it
 * lands between the right two.
 */
export function Rack({
  tiles,
  usedSlots,
  pickedSlots,
  drawnSlots,
  isInteractive,
  onPointerDown,
}: {
  // The rack's tiles in display order, each with its slot.
  tiles: { glyph: string; rackIdx: number }[]
  // The slots staged on the board already.
  usedSlots: ReadonlySet<number>
  // The slots picked for a swap.
  pickedSlots: ReadonlySet<number>
  // The slots just drawn, flashing.
  drawnSlots: ReadonlySet<number>
  // May I lay tiles out right now.
  isInteractive: boolean
  onPointerDown: (rackIdx: number, glyph: string, e: React.PointerEvent) => void
}) {
  return (
    <div className={styles.rack} data-zone="rack">
      {tiles.map(({ glyph, rackIdx }) => {
        const isUsed = usedSlots.has(rackIdx)
        const isBlank = glyph === BLANK
        return (
          <div
            key={rackIdx}
            data-rack-tile
            className={styles.slot}
            onPointerDown={(e) => {
              if (isInteractive && !isUsed) onPointerDown(rackIdx, glyph, e)
            }}
          >
            <Tile
              letter={isBlank ? null : glyph}
              blank={isBlank}
              where="rack"
              marks={{
                isUsed,
                isPicked: pickedSlots.has(rackIdx),
                isDrawn: drawnSlots.has(rackIdx),
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
