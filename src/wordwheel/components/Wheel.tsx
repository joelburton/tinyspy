// cs-met-wordwheel

import type { ReactNode } from 'react'
import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { Mark } from '@/common/board-marks/useMark'
import shared from '@/common/game-page/playArea.module.css'
import { ordinals, spentTiles, type Claim } from '../lib/spend'
import { TILE_POSITIONS } from '../lib/wheel'
import { Tile } from './Tile'
import styles from './Wheel.module.css'

type Props = {
  // The 8 outer letters in their display order — shuffled by the caller.
  outerLetters: string[]
  // The 1 mandatory center letter.
  centerLetter: string
  // Called with the clicked letter and WHICH of that letter's tiles was hit
  // (its ordinal in render order); the caller appends the letter to the typed
  // word and records the claim. Absent when the board is read-only, and then
  // no tile takes a click, a hover or a press.
  onLetterClick?: (letter: string, ordinal: number) => void
  // Per-letter counts of the typed word, lower-cased. Each use SPENDS one
  // tile of its letter, which wears the selected edge and takes no click.
  typedCounts: Map<string, number>
  // The tiles the player CLICKED, oldest first — spent before any other, so a
  // clicked tile is always the one that marks.
  claims: readonly Claim[]
  // A refused word's mark, while its answer is up: how many of each letter it
  // used, the tiles it had clicked, and the outcome. The tiles it would have
  // spent shake and wear that outcome. The nonce keys those tiles, so refusing
  // the same letters again remounts them and the shake plays again — a CSS
  // animation restarts on a remount, not on a class that is already there.
  refused: Mark<{ counts: Map<string, number>; claims: readonly Claim[]; outcome: Outcome }> | null
  // A control floated over the wheel's top-right (the Shuffle button). Rendered
  // inside the shrink-wrapped `.floatAnchor` around the grid, so it hugs the
  // VISUAL wheel rather than the column, which the vertically-centered wheel
  // does not touch.
  floatingControl?: ReactNode
}

/**
 * The 9-tile wheel: round boxes absolutely placed on a square sized in `--u`,
 * the wheel's coordinate unit (the box is 300 units across). The geometry
 * lives in `lib/wheel.ts`, shared with the PDF.
 *
 * Render order matches `TILE_POSITIONS`: the center first, then the eight
 * outer letters clockwise from the top in the order the caller passes them, so
 * a shuffle changes the visual order and nothing else.
 *
 * A click appends the letter to the typed word. The wheel is a multiset, so a
 * typed letter says how many of its tiles are in use but not which; a click
 * says which, and is honored, and the rest fall to render order — the center
 * first (`lib/spend.ts`). A shuffle can swap which of two identical tiles is
 * marked; the marked COUNT is always right.
 */
export function Wheel({
  outerLetters,
  centerLetter,
  onLetterClick,
  typedCounts,
  claims,
  refused,
  floatingControl,
}: Props) {
  const letters = [centerLetter, ...outerLetters]
  const spent = spentTiles(letters, typedCounts, claims)
  // The refused word's tiles: the ones it was spending — a clicked twin over
  // its sibling — as many of each letter as it used. A letter off the wheel
  // has no tile and takes nothing.
  const answered = refused
    ? spentTiles(letters, refused.value.counts, refused.value.claims)
    : new Set<number>()
  // Each tile's ordinal among same-letter tiles, in render order — what a click
  // reports, so the claim survives a shuffle (a tile INDEX wouldn't).
  const tileOrdinals = ordinals(letters)
  return (
    <div className={cls(shared.boardSeal, styles.board)}>
      <div className={styles.floatAnchor}>
        <div className={styles.grid} data-wheel>
          {letters.map((letter, i) => {
            // The refusal's mark, when this tile is one the word used.
            const mark = refused && answered.has(i) ? refused : null
            return (
              <Tile
                key={mark ? `${letter}-${i}#${mark.nonce}` : `${letter}-${i}`}
                letter={letter}
                isCenter={i === 0}
                pos={TILE_POSITIONS[i] ?? TILE_POSITIONS[0]}
                spent={spent.has(i)}
                answer={mark?.value.outcome}
                onClick={onLetterClick && (() => onLetterClick(letter, tileOrdinals[i] ?? 0))}
              />
            )
          })}
        </div>
        {floatingControl}
      </div>
    </div>
  )
}
