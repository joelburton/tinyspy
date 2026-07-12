import type { GamePlayer } from '../../common/lib/games'
import { DimmedBaseWord } from './DimmedBaseWord'
import styles from './OpponentReveal.module.css'

/** One completed opponent guess — the word + its length (the scored value). */
export type OpponentGuess = { word: string; length: number }

/** An opponent and the words they played (empty if they never guessed). */
export type OpponentReveals = { player: GamePlayer; guesses: OpponentGuess[] }[]

/**
 * Compete terminal reveal: each opponent's actual guessed words.
 *
 * All game long a compete player sees only their OWN board plus opponents'
 * guess COUNTS (the words are RLS-hidden and never ship). At terminal the RLS
 * opens the rows, so the words themselves finally land — this is where they
 * surface (spec §6 "full reveal at terminal"). Self is excluded: my own words
 * are already the board. Coop never renders this (one shared board, live).
 *
 * Mirrors the board's look — the base fragment dimmed via `<DimmedBaseWord>`,
 * the length as a plain teal number — so an opponent's row reads the same as
 * one of mine.
 */
export function OpponentReveal({ base, opponents }: { base: string; opponents: OpponentReveals }) {
  if (opponents.length === 0) return null
  return (
    <section className={styles.reveal}>
      <h3 className={styles.heading}>Opponents’ words</h3>
      <ul className={styles.opponents}>
        {opponents.map(({ player, guesses }) => (
          <li key={player.user_id} className={styles.opponent}>
            <span className={styles.name}>{player.username}</span>
            {guesses.length === 0 ? (
              <span className={styles.none}>no guesses</span>
            ) : (
              <ol className={styles.words}>
                {guesses.map((g, i) => (
                  <li key={i} className={styles.word}>
                    <DimmedBaseWord word={g.word} base={base} className={styles.wordText} />
                    <span className={styles.badge} aria-label={`${g.length} letters`}>
                      {g.length}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
