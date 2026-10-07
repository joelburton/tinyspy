// cs-blessed-wordwheel

import { cls } from '@/common/utils/cls'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import { useTileShuffle } from '@/shared/bee-games/useTileShuffle'
import shared from '@/common/game-page/playArea.module.css'
import { spentTileIds } from '../lib/spend'
import { TILE_POSITIONS } from '../lib/board'
import { Tile } from './Tile'
import styles from './Board.module.css'
import type { GRefusedMark, GTile } from '../types'

type Props = {
  // The puzzle's tiles (`gd.puzzle.tiles`), the center first; the display
  // order is this component's (`useTileShuffle`).
  tiles: readonly GTile[]
  // Called with the clicked tile.
  onTileClick: (tile: GTile) => void
  // The board responds to me. When false no tile takes a click, a hover or a
  // press.
  isInteractive: boolean
  // Per-letter counts of the typed word. Each use SPENDS one tile of its
  // letter, which wears the selected edge and takes no click.
  typedCounts: ReadonlyMap<string, number>
  // The tiles the player CLICKED, by id, oldest first — spent before any
  // other, so a clicked tile is always the one that marks.
  claimedTileIds: readonly string[]
  // A refused word's mark, while its answer is up: the tiles it would have
  // spent shake and wear its outcome. The nonce keys those tiles, so refusing
  // the same letters again remounts them and the shake plays again — a CSS
  // animation restarts on a remount, not on a class that is already there.
  refused: GRefusedMark | null
  // How I came out, for the ended board's frame; null while I still play.
  endingOutcome: EndOutcome | null
}

/**
 * The board: a 9-tile wheel, round boxes absolutely placed on a square sized
 * in `--u`, the wheel's coordinate unit (the box is 300 units across). The
 * geometry lives in `lib/board.ts`, shared with the PDF.
 *
 * The board owns its display order and the Shuffle (`useTileShuffle`). Render
 * order matches `TILE_POSITIONS`: the center first, then the eight outer
 * letters clockwise from the top in this client's order, so a shuffle changes
 * the visual order and nothing else. The Shuffle button floats over the
 * board's top-right, anchored to the visual board rather than the column,
 * which the vertically-centered board does not touch.
 *
 * A click appends the tile's letter to the typed word. The wheel is a multiset,
 * so a typed letter says how many of its tiles are in use but not which; a
 * click says which, and is honored, and the rest fall to the puzzle's order —
 * the center first (`lib/spend.ts`) — which a shuffle does not touch.
 */
export function Board({
  tiles,
  onTileClick,
  isInteractive,
  typedCounts,
  claimedTileIds,
  refused,
  endingOutcome,
}: Props) {
  const shuffle = useTileShuffle(tiles)
  const spent = spentTileIds(tiles, typedCounts, claimedTileIds)
  // The tiles the refused word was spending.
  const answered = refused
    ? spentTileIds(tiles, refused.value.counts, refused.value.claimedTileIds)
    : new Set<string>()
  return (
    <div className={cls(shared.boardSeal, styles.board)}>
      <div className={styles.floatAnchor}>
        <div
          // wordwheel has no history viewer, so the frame never steps aside for one.
          className={cls(styles.grid, makeEndingFrameClasses(endingOutcome, false))}
          data-board
        >
          {shuffle.tiles.map((tile, i) => {
            // The refusal's mark, when this tile is one the word used.
            const mark = refused && answered.has(tile.id) ? refused : null
            return (
              <Tile
                key={mark ? `${tile.id}#${mark.nonce}` : tile.id}
                tile={tile}
                pos={TILE_POSITIONS[i]!}
                spent={spent.has(tile.id)}
                answer={mark?.value.outcome}
                // A tile with no handler is inert — no click, hover or press.
                onClick={isInteractive ? () => onTileClick(tile) : undefined}
              />
            )
          })}
        </div>
        <ShuffleButton
          action={shuffle.actShuffle}
          tooltip="Shuffle outer letters"
          className={shared.floatingShuffle}
        />
      </div>
    </div>
  )
}
