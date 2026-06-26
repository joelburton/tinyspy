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
 * The 7-hex honeycomb. Render order is:
 *   center → top → upper-right → lower-right →
 *   bottom → lower-left → upper-left
 *
 * That order matches the nth-child positioning rules in
 * Letters.module.css — child 1 is the center, children 2..7 go
 * clockwise from top around the ring. The parent (PlayArea)
 * controls the shuffle of `outerLetters` so the visual order
 * changes when the user clicks Shuffle.
 *
 * Clicking a letter doesn't validate anything — it just appends
 * the character to the typed word. The submission validation
 * happens server-side via `spellingbee.submit_word`.
 */
export function Letters({ outerLetters, centerLetter, onLetterClick }: Props) {
  return (
    <div className={styles.letters}>
      <Letter
        letter={centerLetter}
        isCenter
        onClick={() => onLetterClick(centerLetter)}
      />
      {outerLetters.map((letter, i) => (
        <Letter
          key={`${letter}-${i}`}
          letter={letter}
          onClick={() => onLetterClick(letter)}
        />
      ))}
    </div>
  )
}
