// cs-blessed-spellingbee

import { cls } from '@/common/utils/cls'
import styles from '@/shared/found-words/typedWord.module.css'

type Props = {
  // The typed word. Uppercased again here, so a lowercase caller draws the same.
  word: string
  // The hive's letters, lower-cased. A character outside it dims — the submit
  // will refuse the word as bad letters.
  allowedLetters: Set<string>
}

/**
 * The typed word as the value INSIDE the shared `<WordEntryInput>` (passed as
 * its `children`) — one `<span>` per character, so a letter off the hive dims
 * on its own. The input-like box, the blinking caret and the placeholder are
 * `WordEntryInput`'s; this owns only the per-character styling. It returns
 * bare spans with no wrapper: the caret must sit right after the last
 * character, and the input appends it.
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
