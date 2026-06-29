import { cls } from '../../common/lib/cls'
import styles from './TypedWord.module.css'

type Props = {
  /** The current typed word (already uppercase; we uppercase defensively). */
  word: string
  /** Set of letters allowed in this puzzle, lower-cased. Characters outside it
   *  render dimmed — a hint the submit will reject them as "badLetters". */
  allowedLetters: Set<string>
}

/**
 * Renders the in-progress word as the value INSIDE the shared <EntryBox> (passed
 * as its `children`) — one <span> per character so letters not in the puzzle can
 * be dimmed individually (the affordance spellingbee-ws uses). EntryBox owns the
 * input-like box, the blinking caret, and the empty-state placeholder; this owns
 * only the per-character styling. (It returns just the spans, no wrapper — the
 * caret must sit right after the last character, which EntryBox appends.)
 */
export function TypedWord({ word, allowedLetters }: Props) {
  return (
    <>
      {Array.from(word).map((ch, i) => {
        const illegal = !allowedLetters.has(ch.toLowerCase())
        return (
          <span key={i} className={cls(illegal && styles.illegal)}>
            {ch.toUpperCase()}
          </span>
        )
      })}
    </>
  )
}
