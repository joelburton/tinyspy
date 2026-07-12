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
  /** Per-letter counts of the typed word, lower-cased. Each occurrence SPENDS
   *  one same-letter tile — dimmed + inert — in the wheel's spend order (see
   *  the component doc). */
  typedCounts: Map<string, number>
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
 *
 * SPEND ORDER: the wheel is a multiset, so typing a letter spends ONE of its
 * tiles. Tiles are spent in render order — the CENTRE first when it carries the
 * letter (the game rule: a duplicated centre is always the tile the mandatory
 * use consumes), then outer duplicates in their current display order. Tile k
 * of a letter is spent (dimmed + inert) when the typed word holds more than k
 * earlier occurrences of it. A shuffle can swap WHICH visual twin is dimmed —
 * accepted: the twins are identical, and the dimmed COUNT is always right.
 */

export function Wheel({ outerLetters, centerLetter, onLetterClick, typedCounts, floatingControl }: Props) {
  const letters = [centerLetter, ...outerLetters]
  // Each tile's ordinal among same-letter tiles, in render order (centre = 0
  // for its letter — spent first, by construction).
  const ordinals: number[] = []
  {
    const seen = new Map<string, number>()
    for (const letter of letters) {
      const lower = letter.toLowerCase()
      const n = seen.get(lower) ?? 0
      ordinals.push(n)
      seen.set(lower, n + 1)
    }
  }
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
              disabled={(ordinals[i] ?? 0) < (typedCounts.get(letter.toLowerCase()) ?? 0)}
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
