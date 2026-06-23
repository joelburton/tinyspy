import { cls } from '../../common/lib/cls'
import type { TileColor } from '../lib/colors'
import styles from './Keyboard.module.css'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

type Props = {
  /** Best color seen for each letter across the player's guesses
   *  (green > yellow > gray). Absent = never guessed. */
  keyStates: Map<string, TileColor>
  onKey: (letter: string) => void
  onEnter: () => void
  onBackspace: () => void
  disabled: boolean
}

/**
 * The on-screen QWERTY keyboard. Each letter key is tinted with the
 * strongest feedback it's earned so far — the at-a-glance "which
 * letters are in / out" cue that's core to Wordle. Clicking a key feeds
 * the same input path as the physical keyboard (handled in PlayArea).
 * The third row is flanked by Enter and Backspace.
 */
export function Keyboard({
  keyStates,
  onKey,
  onEnter,
  onBackspace,
  disabled,
}: Props) {
  return (
    <div className={styles.keyboard} aria-label="Keyboard">
      {ROWS.map((row, i) => (
        <div key={i} className={styles.row}>
          {i === 2 && (
            <button
              type="button"
              className={cls(styles.key, styles.wide)}
              onClick={onEnter}
              disabled={disabled}
            >
              Enter
            </button>
          )}
          {[...row].map((ch) => {
            const state = keyStates.get(ch)
            return (
              <button
                key={ch}
                type="button"
                className={cls(styles.key, state && styles[state])}
                onClick={() => onKey(ch)}
                disabled={disabled}
                aria-label={ch}
              >
                {ch}
              </button>
            )
          })}
          {i === 2 && (
            <button
              type="button"
              className={cls(styles.key, styles.wide)}
              onClick={onBackspace}
              disabled={disabled}
              aria-label="Backspace"
            >
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
