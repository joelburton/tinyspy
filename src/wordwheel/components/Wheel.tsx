import { useState, type ReactNode } from 'react'
import { BOX_H, BOX_W, TILE_POSITIONS } from '../lib/wheel'
import { Tile } from './Tile'
import styles from './Wheel.module.css'

type Props = {
  /** The 8 outer letters in their current display order — shuffled
   *  locally by the caller. */
  outerLetters: string[]
  /** The 1 mandatory center letter. */
  centerLetter: string
  /** Called when any letter is clicked. The caller appends the
   *  letter to the typed word. */
  onLetterClick: (letter: string) => void
  /** A control floated over the wheel's top-right (the Shuffle button). Rendered
   *  inside the shrink-wrapped `.floatAnchor` around the svg, so it hugs the
   *  VISUAL wheel. Anchoring to the column instead would strand it at the
   *  column's top, which the vertically-centered wheel no longer touches. */
  floatingControl?: ReactNode
}

/**
 * The 9-tile wheel, drawn as ONE inline `<svg>` (viewBox `0 0 300 300` — the
 * wheel's coordinate units). Each tile is an SVG `<circle>` with a real fill +
 * stroke, so the tiles get a proper border. Only wordwheel uses this wheel, so it
 * stays local; the SVG geometry is also shared with the PDF export.
 *
 * Render order (matches `TILE_POSITIONS`): centre first, then the eight outer tiles
 * clockwise from the top; the parent (BoardCol) controls the shuffle of
 * `outerLetters` so the visual order changes on Shuffle. The geometry lives in
 * `lib/wheel.ts`, shared with the PDF export.
 *
 * Clicking a letter doesn't validate — it just appends the character to the typed
 * word (server validates on submit).
 */

export function Wheel({ outerLetters, centerLetter, onLetterClick, floatingControl }: Props) {
  const letters = [centerLetter, ...outerLetters]
  // Which tile to flash on click + a bumping nonce so re-tapping the same tile
  // replays the flash (see Tile.tsx). Purely visual — doesn't gate the click.
  const [flash, setFlash] = useState<{ i: number; n: number } | null>(null)
  return (
    <div className={styles.board}>
      <div className={styles.floatAnchor}>
        <svg
          className={styles.grid}
          viewBox={`0 0 ${BOX_W} ${BOX_H}`}
          role="group"
          aria-label="Letter wheel"
        >
          {letters.map((letter, i) => (
            <Tile
              key={`${letter}-${i}`}
              letter={letter}
              isCenter={i === 0}
              pos={TILE_POSITIONS[i] ?? TILE_POSITIONS[0]}
              flashNonce={flash?.i === i ? flash.n : 0}
              onClick={() => {
                setFlash((f) => ({ i, n: (f?.n ?? 0) + 1 }))
                onLetterClick(letter)
              }}
            />
          ))}
        </svg>
        {floatingControl}
      </div>
    </div>
  )
}
