// cs-blessed-spellingbee

import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { Mark } from '@/common/board-marks/useMark'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { useTileShuffle } from '@/shared/bee-games/useTileShuffle'
import shared from '@/common/game-page/playArea.module.css'
import { HEX_POSITIONS } from '../lib/honeycomb'
import { Tile } from './Tile'
import styles from './Board.module.css'

type Props = {
  // The 6 outer letters as the puzzle holds them; the display order is this
  // component's (`useTileShuffle`).
  outerLetters: string
  // The 1 mandatory center letter.
  centerLetter: string
  // The board responds to me. When false no tile takes a click, a hover or a
  // press.
  isInteractive: boolean
  // Called with the clicked letter; the caller appends it to the typed word.
  onLetterClick: (letter: string) => void
  // The letters the word being typed is using — those tiles wear
  // the selected edge.
  usedLetters: Set<string>
  // A refused word's mark: its letters wear the answer and shake. The nonce
  // keys those tiles, so refusing the same letters again remounts them and
  // the shake plays again — a CSS animation restarts on a remount, not on a
  // class that is already there.
  refused: Mark<{ letters: Set<string>; outcome: Outcome }> | null
}

/**
 * The board: a 7-hex honeycomb, drawn as ONE inline `<svg>` (viewBox
 * `0 0 256 267`, the flower's coordinate units). Each tile is an SVG
 * `<polygon>` with a real fill and stroke, so it has a true border. The
 * geometry — positions and hex vertices — lives in `lib/honeycomb.ts`, shared
 * with the PDF.
 *
 * The board owns its display order and the Shuffle (`useTileShuffle`): the
 * center first, then the six outer letters in this client's order, so a
 * shuffle changes the visual order and nothing else. The Shuffle button floats
 * over the board's top-right, anchored to the visual board rather than the
 * column, which the vertically-centered board does not touch.
 *
 * A click appends the letter to the typed word; a tile whose letter is in that
 * word wears the selected edge, which is also how a pangram hunter sees the
 * letters not yet used. A refused word's letters take its answer and shake,
 * each tile on its own.
 */
export function Board({
  outerLetters,
  centerLetter,
  isInteractive,
  onLetterClick,
  usedLetters,
  refused,
}: Props) {
  const shuffle = useTileShuffle(outerLetters)
  const letters = [centerLetter, ...shuffle.outerLetters]
  return (
    <div className={cls(shared.boardSeal, styles.board)}>
      <div className={styles.floatAnchor}>
        <svg className={styles.grid} viewBox="0 0 256 267" data-board>
          {letters.map((letter, i) => {
            // The refusal's mark, when this tile is one of the word's letters.
            const mark = refused?.value.letters.has(letter) ? refused : null
            return (
              <Tile
                key={mark ? `${letter}-${i}#${mark.nonce}` : `${letter}-${i}`}
                letter={letter}
                isCenter={i === 0}
                pos={HEX_POSITIONS[i] ?? HEX_POSITIONS[0]}
                used={usedLetters.has(letter)}
                answer={mark?.value.outcome}
                // A tile with no handler is inert — no click, hover or press.
                onClick={isInteractive ? () => onLetterClick(letter) : undefined}
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
