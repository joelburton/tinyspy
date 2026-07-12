import { cls } from '../../common/lib/util/cls'
import styles from './TypedWord.module.css'

type Props = {
  /** The current typed word (already uppercase; we uppercase defensively). */
  word: string
  /** Set of letters allowed in this puzzle, lower-cased. Characters outside it
   *  render dimmed — a hint the submit will reject them. */
  allowedLetters: Set<string>
}

/**
 * Renders the in-progress word as the value INSIDE the shared <EntryBox> (passed
 * as its `children`) — one <span> per character so illegal letters can be dimmed
 * individually. EntryBox owns the input-like box, the blinking caret, and the
 * empty-state placeholder; this owns only the per-character styling. (It returns
 * just the spans, no wrapper — the caret must sit right after the last character,
 * which EntryBox appends.)
 *
 * A character is dimmed ("illegal") when EITHER:
 *   - it's not one of the puzzle's letters (off the wheel), OR
 *   - it REPEATS a letter used earlier in the word. Word wheel uses each tile
 *     ONCE per word, so a second use of the same letter can never be part of a
 *     valid word — we dim it exactly the way we dim an off-wheel letter (the
 *     wheel also disables the tile once its letter is used; see Wheel/Tile).
 */
export function TypedWord({ word, allowedLetters }: Props) {
  // Track letters seen earlier in the word so a repeat dims from its SECOND
  // occurrence on (the first use stays legal).
  const seen = new Set<string>()
  return (
    <>
      {Array.from(word).map((ch, i) => {
        const lower = ch.toLowerCase()
        const illegal = !allowedLetters.has(lower) || seen.has(lower)
        seen.add(lower)
        return (
          <span key={i} className={cls(illegal && styles.illegal)}>
            {ch.toUpperCase()}
          </span>
        )
      })}
    </>
  )
}
