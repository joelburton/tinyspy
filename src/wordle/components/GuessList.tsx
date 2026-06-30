import { colorVarFor } from '../../common/lib/memberColor'
import { cls } from '../../common/lib/cls'
import type { Member } from '../../common/lib/games'
import { tileColor } from '../lib/colors'
import type { WordleGuess } from '../hooks/useGame'
import styles from './GuessList.module.css'

type Props = {
  /** Guesses to list — coop: the whole shared board; compete: the
   *  viewer's own (RLS-filtered until terminal). In order. */
  guesses: WordleGuess[]
  players: Member[]
  /** Coop attributes each guess to its guesser; compete doesn't. */
  showWho: boolean
}

/**
 * The info column's bottom region: the list of guesses (the guess COUNT lives in
 * the info-column state line now, not here). Each guess renders as five mini
 * feedback squares; in coop it's tagged with who entered it (in their member
 * color), so the team can see who tried what.
 */
export function GuessList({ guesses, players, showWho }: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  return (
    <section className={styles.panel}>
      {guesses.length === 0 ? (
        <p className="muted">No guesses yet.</p>
      ) : (
        <ol className={styles.list}>
          {guesses.map((g) => {
            const who = showWho ? playerFor(g.user_id) : undefined
            return (
              <li key={`${g.user_id}-${g.guess_index}`} className={styles.item}>
                <span className={styles.squares}>
                  {[...g.guess].map((ch, i) => (
                    <span
                      key={i}
                      className={cls(styles.sq, styles[tileColor(g.colors[i])])}
                    >
                      {ch.toUpperCase()}
                    </span>
                  ))}
                </span>
                {showWho && (
                  <span
                    className={styles.who}
                    style={{ color: colorVarFor(who?.color) }}
                  >
                    {who?.username ?? 'someone'}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
