// cs-unmet

import { cls } from '@/common/utils/cls'
import styles from '@/shared/found-words/typedWord.module.css'

type Props = {
  /** The current typed word (already uppercase; we uppercase defensively). */
  word: string
  /** How many of its letters the board can spell, from the start
   *  (`traceCells`). The rest render dimmed. */
  reach: number
}

/**
 * Renders the in-progress word as the value INSIDE the shared <WordEntryInput> (passed
 * as its `children`) — one <span> per character, so the letters the board cannot
 * follow can be dimmed. WordEntryInput owns the input-like box, the blinking caret and
 * the empty-state placeholder; this owns only the per-character styling. (It
 * returns just the spans, no wrapper — the caret must sit right after the last
 * character, which WordEntryInput appends.)
 *
 * The dim is positional, unlike the bee games' (a letter off their puzzle's
 * letters entirely): GO on the board with no T beside it dims the T of GOT, and
 * with it every letter after, because the path has already stopped.
 */
export function TypedWord({ word, reach }: Props) {
  return (
    <>
      {Array.from(word).map((ch, i) => (
        <span key={i} className={cls(i >= reach && styles.illegal)}>
          {ch.toUpperCase()}
        </span>
      ))}
    </>
  )
}
