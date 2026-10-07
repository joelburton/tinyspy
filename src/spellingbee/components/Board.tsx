// cs-blessed-spellingbee

import { cls } from '@/common/utils/cls'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import { useTileShuffle } from '@/shared/bee-games/useTileShuffle'
import shared from '@/common/game-page/playArea.module.css'
import { HEX_POSITIONS } from '../lib/board'
import { Tile } from './Tile'
import styles from './Board.module.css'
import type { GRefusedMark, GTile } from '../types'

type Props = {
  // The puzzle's tiles (`gd.puzzle.tiles`), the center first; the display
  // order is this component's (`useTileShuffle`).
  tiles: readonly GTile[]
  // The board responds to me. When false no tile takes a click, a hover or a
  // press.
  isInteractive: boolean
  // Called with the clicked tile.
  onTileClick: (tile: GTile) => void
  // The letters the word being typed is using — those tiles wear the selected
  // edge. Letters, not tiles: the board is a SET, a letter is on one tile and
  // may be typed any number of times, so the word's letters are the whole fact.
  usedLetters: ReadonlySet<string>
  // A refused word's mark: its letters wear the answer and shake. The nonce
  // keys those tiles, so refusing the same letters again remounts them and
  // the shake plays again — a CSS animation restarts on a remount, not on a
  // class that is already there.
  refused: GRefusedMark | null
  // How I came out, for the ended board's frame; null while I still play.
  endingOutcome: EndOutcome | null
}

/**
 * The board: a 7-hex honeycomb, drawn as ONE inline `<svg>` (viewBox
 * `0 0 256 267`, the flower's coordinate units). Each tile is an SVG
 * `<polygon>` with a real fill and stroke, so it has a true border. The
 * geometry — positions and hex vertices — lives in `lib/board.ts`, shared
 * with the PDF.
 *
 * The board owns its display order and the Shuffle (`useTileShuffle`): the
 * center first, then the six outer tiles in this client's order, so a shuffle
 * changes the visual order and nothing else. The Shuffle button floats over
 * the board's top-right, anchored to the visual board rather than the column,
 * which the vertically-centered board does not touch.
 *
 * A click appends the tile's letter to the typed word; a tile whose letter is
 * in that word wears the selected edge, which is also how a pangram hunter
 * sees the letters not yet used. A refused word's letters take its answer and
 * shake, each tile on its own.
 */
export function Board({ tiles, isInteractive, onTileClick, usedLetters, refused, endingOutcome }: Props) {
  const shuffle = useTileShuffle(tiles)
  return (
    <div className={cls(shared.boardSeal, styles.board)}>
      <div className={styles.floatAnchor}>
        <svg
          // spellingbee has no history viewer, so the frame never steps aside for one.
          className={cls(styles.grid, makeEndingFrameClasses(endingOutcome, false))}
          viewBox="0 0 256 267"
          data-board
        >
          {shuffle.tiles.map((tile, i) => {
            // The refusal's mark, when this tile is one of the word's letters.
            const mark = refused?.value.letters.has(tile.letter) ? refused : null
            return (
              <Tile
                key={mark ? `${tile.id}#${mark.nonce}` : tile.id}
                tile={tile}
                pos={HEX_POSITIONS[i]!}
                used={usedLetters.has(tile.letter)}
                answer={mark?.value.outcome}
                // A tile with no handler is inert — no click, hover or press.
                onClick={isInteractive ? () => onTileClick(tile) : undefined}
              />
            )
          })}
        </svg>
        <ShuffleButton
          action={shuffle.actShuffle}
          tooltip="Shuffle outer letters"
          className={shared.floatingShuffle}
        />
      </div>
    </div>
  )
}
