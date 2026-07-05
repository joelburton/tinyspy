import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { boardWords } from '../lib/waffle'
import styles from './SolutionReveal.module.css'

/**
 * End-of-game answer panel: the six solution words grouped across /
 * down, each click-to-define via the shared `DefinitionPopover` — the
 * same lookup spellingbee's WordList uses (the common-define Edge Function reads
 * common.words, where these words live). The words alone fully reveal
 * the solution, so there's no separate solved-board grid (it just ate
 * space); the player's final board stays on the left.
 */
export function SolutionReveal({ solution }: { solution: string }) {
  const [a0, a2, a4, d0, d2, d4] = boardWords(solution)
  const { define, popover } = useDefinePopover()

  return (
    <div className={styles.reveal}>
      <div className={styles.label}>The answer</div>

      <div className={styles.wordCols}>
        <WordGroup heading="Across" words={[a0, a2, a4]} onDefine={define} />
        <WordGroup heading="Down" words={[d0, d2, d4]} onDefine={define} />
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
  words: string[]
  onDefine: (word: string, el: HTMLElement) => void
}) {
  return (
    <div className={styles.group}>
      <div className={styles.heading}>{heading}</div>
      {words.map((w) => (
        <button
          key={w}
          type="button"
          className={styles.word}
          title="Click for definition"
          onClick={(e) => onDefine(w, e.currentTarget)}
        >
          {w.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
