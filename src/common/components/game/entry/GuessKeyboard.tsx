import { cls } from '../../../lib/util/cls'
import styles from './GuessKeyboard.module.css'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

/**
 * Per-letter feedback tint for a key — a generic three-strength vocabulary
 * (wordle's green / yellow / gray, which is the palette these keys wear). A game that
 * has no per-letter feedback (e.g. wordiply) simply passes no `keyStates`
 * and every key stays neutral.
 */
export type KeyTone = 'green' | 'yellow' | 'gray'

/** Tone → the class that paints it. The keyboard wears the WORDLE palette, and
 *  says so: a non-wordle game tinting keys would add its own classes rather than
 *  borrow these (docs/colors-refinement.md). */
const TONE_CLASS: Record<KeyTone, string> = {
  green: styles.wordleGreen,
  yellow: styles.wordleYellow,
  gray: styles.wordleGray,
}

type Props = {
  onKey: (letter: string) => void
  onEnter: () => void
  onBackspace: () => void
  disabled?: boolean
  /** The game is finished. The keyboard is WITHDRAWN rather than disabled — see
   *  `.gameOver` in the stylesheet — while keeping the space it occupied, so the
   *  board above it doesn't move on the frame the game ends. */
  gameOver?: boolean
  /** Best tone seen for each (lowercase) letter, or absent for neutral. */
  keyStates?: ReadonlyMap<string, KeyTone>
}

/**
 * The shared on-screen QWERTY keyboard — a Wordle-style key grid with an
 * Backspace (left) and Enter (right) flanking the bottom row — the same hands
 * as the shared word-entry row, where Delete sits left of the field and Submit
 * right of it, rather than NYT's opposite arrangement. Tapping a key calls back
 * into the game's input path (the same path a physical key drives via
 * `useCaptureKeys`), so a game works on touch WITHOUT a physical keyboard.
 *
 * Shared by **wordle** (which tints keys with per-letter feedback via
 * `keyStates`) and **wordiply** (no tint). It is deliberately game-agnostic:
 * the keycap's own chrome is `--kbd-*` and the judged keys wear the shared
 * `--wordle-*` palette by name. It used to take those colours through a
 * `--kbd-correct`/`-present`/`-absent` seam a game could override — but the only
 * game that ever did set each one to the value its fallback already had, so the
 * seam's "game-agnostic default" was the wordle palette wearing a disguise. No
 * game-specific imports either way, so it stays removable.
 */
export function GuessKeyboard({
  onKey,
  onEnter,
  onBackspace,
  disabled = false,
  gameOver = false,
  keyStates,
}: Props) {
  return (
    <div className={cls(styles.keyboard, gameOver && styles.gameOver)} aria-label="Keyboard">
      {ROWS.map((row, i) => (
        <div key={i} className={styles.row}>
          {i === 2 && (
            <button
              type="button"
              className={cls(styles.key, styles.wide, styles.backspace)}
              onClick={onBackspace}
              disabled={disabled}
              aria-label="Backspace"
            >
              ⌫
            </button>
          )}
          {[...row].map((ch) => {
            const tone = keyStates?.get(ch)
            return (
              <button
                key={ch}
                type="button"
                className={cls(styles.key, tone && TONE_CLASS[tone])}
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
              className={cls(styles.key, styles.wide, styles.wideText, styles.enter)}
              onClick={onEnter}
              disabled={disabled}
            >
              Enter
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
