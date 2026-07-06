import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import styles from './SolutionReveal.module.css'

/**
 * The answer panel — the six solution words grouped across / down, revealed
 * PROGRESSIVELY as you solve them: a word you've turned fully green (every tile
 * correct) shows its letters (click-to-define via the shared `DefinitionPopover`,
 * the same lookup spellingbee's WordList uses); a word you haven't solved shows an
 * em dash. Shown throughout the game, not just at game-over, and it leaks nothing —
 * a fully-green word is already sitting on the player's board (see
 * `solvedWords`). The six slots are always present (word or em dash), so the panel
 * is a fixed height and never reflows the info column as words come in.
 *
 * `words` is the per-word reveal in `WORDS` order (3 across, then 3 down): a string
 * for a solved word, `null` for one still hidden.
 */
export function SolutionReveal({ words }: { words: (string | null)[] }) {
  const { define, popover } = useDefinePopover()

  return (
    <div className={styles.reveal}>
      <div className={styles.wordCols}>
        <WordGroup heading="Across" words={words.slice(0, 3)} onDefine={define} />
        <WordGroup heading="Down" words={words.slice(3, 6)} onDefine={define} />
      </div>

      {popover}
    </div>
  )
}

function WordGroup({
  heading,
  words,
  onDefine,
}: {
  heading: string
  /** A solved word's letters, or `null` for one still hidden (an em dash). */
  words: (string | null)[]
  onDefine: (word: string, el: HTMLElement) => void
}) {
  return (
    <div className={styles.group}>
      <div className={styles.heading}>{heading}</div>
      {words.map((w, i) =>
        w ? (
          <button
            key={i}
            type="button"
            className={styles.word}
            title="Click for definition"
            onClick={(e) => onDefine(w, e.currentTarget)}
          >
            {w.toUpperCase()}
          </button>
        ) : (
          // Not yet solved — an em dash placeholder holds the slot (so the panel
          // keeps its height as words come in).
          <span key={i} className={styles.unsolved} aria-label="not yet solved">
            —
          </span>
        ),
      )}
    </div>
  )
}
