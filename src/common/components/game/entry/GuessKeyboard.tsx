import { cls } from '../../../lib/util/cls'
import type { TileColor } from '../../../lib/color/tileColor'
import styles from './GuessKeyboard.module.css'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

/**
 * Per-letter feedback tint for a key: the three JUDGED states of the wordle
 * palette, which is the palette these keys wear and say so by name. A game with
 * no per-letter feedback (wordiply) passes no `keyStates` and every key stays
 * neutral; a non-wordle game that ever tints keys adds its own classes rather
 * than borrowing these, because "gray" here means *not in the word* — a claim
 * only a wordle-family game can make.
 *
 * Derived from `TileColor` rather than restated, so a key and the board tile
 * above it can never drift into two vocabularies. Excluding `blank` is the
 * whole difference between them: a tile can be unjudged, a tinted key cannot —
 * an untried letter simply carries no tone.
 */
export type KeyTone = Exclude<TileColor, 'blank'>

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
              className={cls(styles.key, styles.wide)}
              onClick={onBackspace}
              disabled={disabled}
              aria-label="Backspace"
              // NOT a focus target, by two means — the same pair the board tiles
              // use. `tabIndex={-1}` keeps 28 keys out of the tab order (they
              // would bury every real control), and `preventDefault` on mousedown
              // stops a CLICK parking focus on a key: the trap is that the click
              // focuses silently, the next keystroke promotes it to
              // `:focus-visible`, and a blue ring then sits on whichever key you
              // last tapped until you click elsewhere. Nothing here needs focus —
              // this keyboard exists so a player without a physical one can type,
              // and a player WITH one just types.
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
                className={cls(styles.key, tone && styles[tone])}
                onClick={() => onKey(ch)}
                disabled={disabled}
                aria-label={ch}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
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
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
            >
              Enter
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
