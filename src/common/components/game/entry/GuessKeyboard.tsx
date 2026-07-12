import { cls } from '../../../lib/util/cls'
import styles from './GuessKeyboard.module.css'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

/**
 * Per-letter feedback tint for a key — a generic three-strength vocabulary
 * (Wordle's green/yellow/gray map to correct/present/absent). A game that
 * has no per-letter feedback (e.g. wordiply) simply passes no `keyStates`
 * and every key stays neutral.
 */
export type KeyTone = 'correct' | 'present' | 'absent'

type Props = {
  onKey: (letter: string) => void
  onEnter: () => void
  onBackspace: () => void
  disabled?: boolean
  /** Best tone seen for each (lowercase) letter, or absent for neutral. */
  keyStates?: ReadonlyMap<string, KeyTone>
}

/**
 * The shared on-screen QWERTY keyboard — a Wordle-style key grid with an
 * Enter and a Backspace flanking the bottom row. Tapping a key calls back
 * into the game's input path (the same path a physical key drives via
 * `useCaptureKeys`), so a game works on touch WITHOUT a physical keyboard.
 *
 * Shared by **wordle** (which tints keys with per-letter feedback via
 * `keyStates`) and **wordiply** (no tint). It is deliberately game-agnostic:
 * the tone colours + the resting key background are CSS variables
 * (`--kbd-correct` / `--kbd-present` / `--kbd-absent` / `--kbd-key-bg`) a
 * game may override on any ancestor; the defaults are the standard Wordle
 * palette. No game-specific imports — so it composes with either game's
 * theme and stays removable.
 */
export function GuessKeyboard({ onKey, onEnter, onBackspace, disabled = false, keyStates }: Props) {
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
            const tone = keyStates?.get(ch)
            return (
              <button
                key={ch}
                type="button"
                className={cls(styles.key, tone && styles[tone])}
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
