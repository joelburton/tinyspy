// cs-unmet

import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import shared from '@/common/game-page/playArea.module.css'
import { useBoardRotation } from '../hooks/useBoardRotation'
import { Tile } from './Tile'
import styles from './Board.module.css'
import type { GTile } from '../types'

/**
 * The board: the square of tiles, and a floating Rotate control over its
 * top-right. It owns the rotation (`useBoardRotation`), and decides which
 * marks each tile wears; the `Tile` draws them. Every mark arrives as tile
 * ids, so a turn moves the marks with their tiles.
 */
export function Board({
  tiles,
  boardSideSize,
  marks,
  endingOutcome,
  isInteractive,
  onTileTap,
}: {
  // The puzzle's tiles, row by row (`gd.puzzle.tiles`).
  tiles: readonly GTile[]
  boardSideSize: number
  marks: {
    // The tapped path, in the order tapped.
    pathIds: readonly string[]
    // A typed word's tiles: the ones a letter has settled on, and the ones a
    // letter still could mean.
    settledIds: ReadonlySet<string>
    maybeIds: ReadonlySet<string>
    // A refused word's tiles while its answer is up, and the outcome they wear.
    // The nonce keys them, so refusing the same word again replays the shake.
    refused: { ids: ReadonlySet<string>; outcome: Outcome; nonce: number } | null
  }
  // How I came out, for the ended board's frame; null while I still play.
  endingOutcome: EndOutcome | null
  // The board responds to me; when false no tile takes a tap.
  isInteractive: boolean
  onTileTap: (tile: GTile) => void
}) {
  const rotation = useBoardRotation(tiles, boardSideSize)
  // A tapped path is the player's own choice; a typed word's tiles light only
  // while nothing is tapped.
  const isTyping = marks.pathIds.length === 0

  return (
    <div
      className={cls(
        shared.boardSeal,
        styles.grid,
        // boggle has no history viewer, so the frame never steps aside for one.
        makeEndingFrameClasses(endingOutcome, false),
      )}
    >
      {rotation.drawnTiles.map((tile) => {
        const step = marks.pathIds.indexOf(tile.id)
        const refused = marks.refused?.ids.has(tile.id) ? marks.refused : null
        const isTappable = isInteractive && tile.letters !== null
        return (
          <Tile
            // A CSS animation runs once per mount, so a refused tile is keyed by
            // the raise: refusing the same word again remounts it.
            key={refused ? `${tile.id}#${refused.nonce}` : tile.id}
            tile={tile}
            onTap={isTappable ? () => onTileTap(tile) : undefined}
            step={step >= 0 ? step + 1 : null}
            picked={step >= 0 || (isTyping && marks.settledIds.has(tile.id))}
            maybePicked={isTyping && marks.maybeIds.has(tile.id)}
            answer={refused?.outcome}
          />
        )
      })}
      {/* INSIDE the grid, its position anchor, so it hugs the board rather than
          the column. */}
      <ShuffleButton action={rotation.actRotate} tooltip="Rotate board" className={shared.floatingShuffle} />
    </div>
  )
}
