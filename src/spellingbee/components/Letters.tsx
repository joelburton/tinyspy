// cs-blessed-spellingbee

import type { ReactNode } from 'react'
import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { Mark } from '@/common/board-marks/useMark'
import shared from '@/common/game-page/playArea.module.css'
import { HEX_POSITIONS } from '../lib/honeycomb'
import { Letter } from './Letter'
import styles from './Letters.module.css'

type Props = {
  // The 6 outer letters in their display order — shuffled by the caller.
  outerLetters: string[]
  // The 1 mandatory center letter.
  centerLetter: string
  // Called with the clicked letter; the caller appends it to the typed word.
  // Absent when the board is read-only, and then no hex takes a click, a
  // hover or a press.
  onLetterClick?: (letter: string) => void
  // The letters the word being typed is using, uppercase — those hexes wear
  // the selected edge.
  usedLetters: Set<string>
  // A refused word's mark: its letters wear the answer and shake. The nonce
  // keys those hexes, so refusing the same letters again remounts them and
  // the shake plays again — a CSS animation restarts on a remount, not on a
  // class that is already there.
  answered: Mark<{ letters: Set<string>; outcome: Outcome }> | null
  // A control floated over the hive's top-right (the Shuffle button). Rendered
  // inside the shrink-wrapped `.floatAnchor` around the svg, so it hugs the
  // VISUAL hive rather than the column, which the vertically-centered hive
  // does not touch.
  floatingControl?: ReactNode
}

/**
 * The 7-hex honeycomb, drawn as ONE inline `<svg>` (viewBox `0 0 256 267`, the
 * flower's coordinate units). Each hex is an SVG `<polygon>` with a real fill
 * and stroke, so a tile has a true border. The geometry — positions and hex
 * vertices — lives in `lib/honeycomb.ts`, shared with the PDF.
 *
 * Render order matches `HEX_POSITIONS`: the center first, then the six outer
 * letters in the order the caller passes them, so a shuffle changes the visual
 * order and nothing else.
 *
 * A click appends the letter to the typed word; a hex whose letter is in that
 * word wears the selected edge, which is also how a pangram hunter sees the
 * letters not yet used. A refused word's letters take its answer and shake,
 * each hex on its own.
 */
export function Letters({
  outerLetters,
  centerLetter,
  onLetterClick,
  usedLetters,
  answered,
  floatingControl,
}: Props) {
  const letters = [centerLetter, ...outerLetters]
  return (
    <div className={cls(shared.boardSeal, styles.board)}>
      <div className={styles.floatAnchor}>
        <svg className={styles.grid} viewBox="0 0 256 267" data-hive>
          {letters.map((letter, i) => {
            // The refusal's mark, when this hex is one of the word's letters.
            const refused = answered?.value.letters.has(letter.toUpperCase()) ? answered : null
            return (
              <Letter
                key={refused ? `${letter}-${i}#${refused.nonce}` : `${letter}-${i}`}
                letter={letter}
                isCenter={i === 0}
                pos={HEX_POSITIONS[i] ?? HEX_POSITIONS[0]}
                used={usedLetters.has(letter.toUpperCase())}
                answer={refused?.value.outcome}
                onClick={onLetterClick && (() => onLetterClick(letter))}
              />
            )
          })}
        </svg>
        {floatingControl}
      </div>
    </div>
  )
}
