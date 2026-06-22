import styles from './NumberBoard.module.css'

/** The 10 candidate numbers, in board order. */
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

type Props = {
  /** Prompt text above the tiles — "What's your guess?" mid-game,
   *  "The number was N" once terminal. */
  heading: string
  /** Numbers already guessed; their tiles render spent (dimmed +
   *  disabled-looking). */
  guessed: Set<number>
}

/**
 * psychicnum's "board": the prompt text plus a 1–10 tile grid, giving
 * the game the same board-on-the-left shape as the real games (it used
 * to be a bare "What's your guess?" placeholder). The tiles are
 * display-only — guessing still happens through GuessForm in the right
 * column — but a guessed number's tile dims to a spent/disabled look,
 * so the board doubles as an at-a-glance record of what's been tried.
 *
 * In compete mode RLS scopes `guesses` to the caller, so `guessed`
 * reflects only the viewer's own attempts — which is exactly the
 * "spent for me" reading we want.
 */
export function NumberBoard({ heading, guessed }: Props) {
  return (
    <div className={styles.board}>
      <p className={styles.heading}>{heading}</p>
      <div className={styles.grid}>
        {NUMBERS.map((n) => {
          const spent = guessed.has(n)
          return (
            <div
              key={n}
              className={`${styles.tile} ${spent ? styles.spent : ''}`}
              aria-disabled={spent || undefined}
            >
              {n}
            </div>
          )
        })}
      </div>
    </div>
  )
}
