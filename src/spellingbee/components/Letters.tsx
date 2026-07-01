import { Letter } from './Letter'
import styles from './Letters.module.css'

type Props = {
  /** The 6 outer letters in their current display order — shuffled
   *  locally by the caller. */
  outerLetters: string[]
  /** The 1 mandatory center letter. */
  centerLetter: string
  /** Called when any letter is clicked. The caller appends the
   *  letter to the typed word. */
  onLetterClick: (letter: string) => void
}

/**
 * The 7-hex honeycomb, drawn as ONE inline `<svg>` (viewBox `0 0 256 267` — the
 * flower's coordinate units). Each hex is an SVG `<polygon>` with a real fill +
 * stroke, so the tiles get a proper border (a `clip-path` div can't be bordered).
 * Only spellingbee uses hexes, so this stays local; the SVG also sets us up for a
 * future PDF export (vector polygons the PDF lib can reuse).
 *
 * Render order (matches `POSITIONS` below): center → top → upper-right →
 * lower-right → bottom → lower-left → upper-left; the parent (PlayArea) controls
 * the shuffle of `outerLetters` so the visual order changes on Shuffle.
 *
 * Clicking a letter doesn't validate — it just appends the character to the typed
 * word (server validates on submit).
 */

/** Each hex's top-left, in the flower's 256×267 coordinate box, in RENDER order.
 *  Re-based to the flower's own top-left (the old spellingbee-ws layout, minus the
 *  32/37 origin offset) so the grid sits flush at the top of the board column. */
const POSITIONS: ReadonlyArray<{ left: number; top: number }> = [
  { left: 78, top: 90 }, //  center
  { left: 78, top: 0 }, //   top
  { left: 156, top: 45 }, // upper-right
  { left: 156, top: 134 }, // lower-right
  { left: 78, top: 180 }, // bottom
  { left: 0, top: 134 }, //  lower-left
  { left: 0, top: 45 }, //   upper-left
]

export function Letters({ outerLetters, centerLetter, onLetterClick }: Props) {
  const letters = [centerLetter, ...outerLetters]
  return (
    <div className={styles.board}>
      <svg className={styles.grid} viewBox="0 0 256 267" role="group" aria-label="Letter honeycomb">
        {letters.map((letter, i) => (
          <Letter
            key={`${letter}-${i}`}
            letter={letter}
            isCenter={i === 0}
            pos={POSITIONS[i] ?? POSITIONS[0]}
            onClick={() => onLetterClick(letter)}
          />
        ))}
      </svg>
    </div>
  )
}
