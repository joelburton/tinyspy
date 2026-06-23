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
  guessesUsed: number
  maxGuesses: number
  /** Coop attributes each guess to its guesser; compete doesn't. */
  showWho: boolean
}

/**
 * The right-column panel: a "guesses used / allowed" counter over the
 * list of guesses. Each guess renders as five mini feedback squares;
 * in coop it's tagged with who entered it (in their member color), so
 * the team can see who tried what.
 */
export function GuessList({
  guesses,
  players,
  guessesUsed,
  maxGuesses,
  showWho,
}: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  return (
    <section className={styles.panel}>
      <div className={styles.counter}>
        <strong>{guessesUsed}</strong> / {maxGuesses} guesses
      </div>
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
