// cs-blessed-wordwheel

import { cls } from '@/common/utils/cls'
import styles from '@/shared/found-words/typedWord.module.css'

type Props = {
  // The typed word. Uppercased again here, so a lowercase caller draws the same.
  word: string
  // The wheel's per-letter tile counts, lower-cased. A character beyond its
  // letter's count, or off the wheel entirely, dims — the submit gate holds
  // the word back.
  letterCounts: Map<string, number>
}

/**
 * The typed word as the value INSIDE the shared `<WordEntryInput>` (passed as
 * its `children`) — one `<span>` per character, so a letter the wheel cannot
 * cover dims on its own. The input-like box, the blinking caret and the
 * placeholder are `WordEntryInput`'s; this owns only the per-character
 * styling. It returns bare spans with no wrapper: the caret must sit right
 * after the last character, and the input appends it.
 *
 * The wheel is a multiset, so with k tiles of a letter the first k uses stay
 * lit and the (k+1)th on dims, exactly as an off-wheel letter does.
 */
export function TypedWord({ word, letterCounts }: Props) {
  // Each letter's uses so far, so it dims from the use after its tiles run out.
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
