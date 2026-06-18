import { cls } from '../../common/lib/cls'
import styles from './WordInput.module.css'

type Props = {
  /** The current typed word (uppercase display, but the value
   *  may be any case — we uppercase at render time). */
  word: string
  /** Set of letters allowed in this puzzle, lower-cased.
   *  Characters outside this set render with the `illegal`
   *  style (visual hint that the submit will reject). */
  allowedLetters: Set<string>
  /** Placeholder text shown when `word` is empty. */
  placeholder?: string
}

/**
 * Displays the in-progress word above the honeycomb. Each
 * character renders independently so we can per-character dim
 * letters that aren't in the puzzle (same affordance freebee-ws
 * uses). When empty, shows a faint placeholder.
 *
 * No input element — this is read-only display. Typed input is
 * captured by `useGlobalKeyHandler` and letter clicks come from
 * <Letters>; both feed back through the parent's `setWord`. The
 * absence of an `<input>` is what lets the honeycomb buttons
 * coexist without focus thrash.
 */
export function WordInput({ word, allowedLetters, placeholder }: Props) {
  if (word.length === 0) {
    return (
      <div className={styles.wordInput}>
        <span className={styles.placeholder}>
          {placeholder ?? 'Type or click letters'}
        </span>
      </div>
    )
  }

  // Per-character render. We split by code unit (sufficient for
  // ASCII letters; this game only accepts a..z lowercase, so
  // surrogate pairs aren't a concern).
  return (
    <div className={styles.wordInput}>
      {Array.from(word).map((ch, i) => {
        const lower = ch.toLowerCase()
        const illegal = !allowedLetters.has(lower)
        return (
          <span key={i} className={cls(illegal && styles.illegal)}>
            {ch.toUpperCase()}
          </span>
        )
      })}
    </div>
  )
}
