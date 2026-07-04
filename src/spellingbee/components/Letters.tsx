import { HEX_POSITIONS } from '../lib/honeycomb'
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
 * Render order (matches `HEX_POSITIONS`): center → top → upper-right → lower-right →
 * bottom → lower-left → upper-left; the parent (PlayArea) controls the shuffle of
 * `outerLetters` so the visual order changes on Shuffle. The geometry (positions +
 * hex vertices) lives in `lib/honeycomb.ts`, shared with the PDF export.
 *
 * Clicking a letter doesn't validate — it just appends the character to the typed
 * word (server validates on submit).
 */

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
            pos={HEX_POSITIONS[i] ?? HEX_POSITIONS[0]}
            onClick={() => onLetterClick(letter)}
          />
        ))}
      </svg>
    </div>
  )
}
