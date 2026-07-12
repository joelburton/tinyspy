import { cls } from '../../common/lib/util/cls'
import { DimmedBaseWord } from './DimmedBaseWord'
import styles from './GuessBoard.module.css'

/** The fixed number of guesses per track (coop: shared; compete: per player). */
export const MAX_GUESSES = 5

type CompletedGuess = { word: string; length: number }

/**
 * The five-row guess board — always exactly MAX_GUESSES fixed-height rows
 * (a HARD layout-stability rule; the board must never grow/shrink). The
 * word ENTRY is the on-screen keyboard BELOW the grid (in BoardCol), but
 * the word-in-progress appears LIVE in the next row as it's typed.
 *
 * Each row is one of:
 *   • completed — a landed guess (`<DimmedBaseWord>` + a length badge, the
 *     only readout during play);
 *   • active — the next row while playing: the live `<DimmedBaseWord>` of
 *     what's being typed, with a running length badge;
 *   • empty — a future row: a fixed-height placeholder.
 */
export function GuessBoard({
  base,
  guesses,
  activeWord,
  showActive,
}: {
  base: string
  guesses: CompletedGuess[]
  /** The word being typed — shown live in the active row. */
  activeWord: string
  /** Whether the active (in-progress) row is shown (playing + budget left). */
  showActive: boolean
}) {
  const activeIndex = showActive ? guesses.length : -1

  return (
    <ol className={styles.board}>
      {Array.from({ length: MAX_GUESSES }, (_, i) => {
        const g = guesses[i]
        if (g) {
          return (
            <li key={i} className={cls(styles.row, styles.done)}>
              <DimmedBaseWord word={g.word} base={base} className={styles.rowWord} />
              <span className={styles.badge} aria-label={`${g.length} letters`}>
                {g.length}
              </span>
            </li>
          )
        }
        if (i === activeIndex) {
          return (
            <li key={i} className={cls(styles.row, styles.active)}>
              <DimmedBaseWord word={activeWord} base={base} className={styles.rowWord} />
              {activeWord.length > 0 && (
                <span className={styles.badge} aria-label={`${activeWord.length} letters`}>
                  {activeWord.length}
                </span>
              )}
            </li>
          )
        }
        return <li key={i} className={cls(styles.row, styles.empty)} aria-hidden="true" />
      })}
    </ol>
  )
}
