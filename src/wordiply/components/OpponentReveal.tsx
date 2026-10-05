// cs-unmet

import type { GPlayer } from '../types'
import { DimmedBaseWord } from './DimmedBaseWord'
import styles from './OpponentReveal.module.css'

/**
 * Compete, once the race has ended: each rival's actual words.
 *
 * All race long a compete player sees only their OWN board plus rivals' guess
 * COUNTS (`useGame`'s seat rule withholds the rest). Once the race ends their
 * boards are mine to see, and this is where the words land. Self is excluded:
 * my own words are already the board. Coop never renders this (one shared
 * board, live), and the caller hands an empty list then.
 *
 * Mirrors the board's look — the base fragment dimmed via `<DimmedBaseWord>`,
 * the length as a plain teal number — so a rival's row reads the same as one
 * of mine.
 */
export function OpponentReveal({ base, rivals }: { base: string; rivals: GPlayer[] }) {
  if (rivals.length === 0) return null
  return (
    <section className={styles.reveal}>
      <h3 className={styles.heading}>Opponents’ words</h3>
      <ul className={styles.opponents}>
        {rivals.map((rival) => {
          // Shown once the race has ended, when the seat rule withholds no board.
          const words = rival.board!.words
          return (
            <li key={rival.id} className={styles.opponent}>
              <span className={styles.name}>{rival.username}</span>
              {words.length === 0 ? (
                <span className={styles.none}>no guesses</span>
              ) : (
                <ol className={styles.words}>
                  {words.map((word) => (
                    <li key={word} className={styles.word}>
                      <DimmedBaseWord word={word} base={base} className={styles.wordText} />
                      <span className={styles.badge} aria-label={`${word.length} letters`}>
                        {word.length}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
