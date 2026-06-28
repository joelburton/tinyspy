import { cls } from '../../common/lib/cls'
import styles from './NumberBoard.module.css'

type Props = {
  /** Prompt text above the tiles — "What's your guess?" mid-game,
   *  "The number was N" once terminal. */
  heading: string
  /** Highest number on the board; tiles run 1..max. */
  max: number
  /** Numbers already guessed; their tiles render spent (dimmed +
   *  disabled). */
  guessed: Set<number>
  /** The currently-picked number (highlighted), or null. Kept in
   *  sync with the text input by the parent. */
  selected: number | null
  /** Pick a number tile. Omitted when the board is non-interactive
   *  (terminal, or the viewer is out of guesses) — tiles render
   *  inert then. */
  onPick?: (n: number) => void
}

/**
 * psychicnum's "board": the prompt text plus a 1..max grid of number tiles,
 * giving the game the same board-on-the-left shape as the real games. Tiles
 * are **clickable** — picking one sets the pending guess (mirrored by the text
 * input below the board) — except a guessed number's tile, which dims to a
 * spent/disabled look so the board doubles as an at-a-glance record of what's
 * been tried.
 *
 * In compete mode RLS scopes `guessed` to the caller, so it reflects only the
 * viewer's own attempts — exactly the "spent for me" reading we want.
 */
export function NumberBoard({ heading, max, guessed, selected, onPick }: Props) {
  const numbers = Array.from({ length: max }, (_, i) => i + 1)
  return (
    <div className={styles.board}>
      <p className={styles.heading}>{heading}</p>
      <div className={styles.grid}>
        {numbers.map((n) => {
          const spent = guessed.has(n)
          return (
            <button
              key={n}
              type="button"
              className={cls(
                styles.tile,
                spent && styles.spent,
                selected === n && styles.selected,
              )}
              disabled={spent || !onPick}
              aria-pressed={selected === n || undefined}
              onClick={onPick ? () => onPick(n) : undefined}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}
