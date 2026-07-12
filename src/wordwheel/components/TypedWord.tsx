import { cls } from '../../common/lib/util/cls'
import styles from './TypedWord.module.css'

type Props = {
  /** The current typed word (already uppercase; we uppercase defensively). */
  word: string
  /** Per-letter tile counts of the wheel, lower-cased. The wheel is a multiset
   *  (a letter may sit on two tiles), so legality is a count, not membership:
   *  characters beyond a letter's tile count — or off the wheel entirely —
   *  render dimmed, a hint the submit will reject them. */
  letterCounts: Map<string, number>
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
 *   - it EXCEEDS its letter's tile count. Each tile is spent once per word, so
 *     with k tiles of a letter, occurrences 1..k stay legal and the (k+1)th on
 *     dims — we dim it exactly the way we dim an off-wheel letter (the wheel
 *     also dims one tile per occurrence; see Wheel/Tile).
 */
export function TypedWord({ word, letterCounts }: Props) {
  // Track per-letter occurrences so far, so a letter dims from the occurrence
  // AFTER its tiles run out (the first k uses stay legal).
  const used = new Map<string, number>()
  return (
    <>
      {Array.from(word).map((ch, i) => {
        const lower = ch.toLowerCase()
        const count = (used.get(lower) ?? 0) + 1
        used.set(lower, count)
        const illegal = count > (letterCounts.get(lower) ?? 0)
        return (
          <span key={i} className={cls(illegal && styles.illegal)}>
            {ch.toUpperCase()}
          </span>
        )
      })}
    </>
  )
}
