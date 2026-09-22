// cs-met-onscreen-keyboard

import { cls } from '@/common/utils/cls'
import { actionSurface } from '@/common/actions/actionSurface'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { TileColor } from '../wordle-style/tileColor'
import styles from './GuessKeyboard.module.css'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

/**
 * Per-letter feedback tint for a key: the three JUDGED states of the wordle
 * palette, which is the palette these keys wear and say so by name. A game with
 * per-letter feedback passes `keyStates`; one without passes none, and every
 * cap stays neutral. A game outside the wordle family that ever tints keys adds
 * its own classes rather than borrowing these, because "gray" here means *not
 * in the word* — a claim only a wordle-family game can make.
 *
 * Derived from `TileColor` rather than restated, so a key and the board tile
 * above it can never drift into two vocabularies. Excluding `blank` is the
 * whole difference between them: a tile can be unjudged, a tinted key cannot —
 * an untried letter simply carries no tone.
 */
export type KeyTone = Exclude<TileColor, 'blank'>

type Props = {
  onKey: (letter: string) => void
  // Submit the guess, and delete its last letter. The SAME two bindings the
  // physical keyboard answers to (`useCaptureKeys` hands them back), so a cap
  // and its key can't disagree about whether the move is available — including
  // the empty-guess case, where both are gray.
  //
  // The 26 letters are NOT actions and shouldn't be: a letter cap is a KEY, not
  // a command. The one action behind them is the pattern `act-type-letter`,
  // which is handed whichever letter fired it — twenty-six bindings each
  // hard-coding its own letter would be a registry entry per keycap.
  actSubmit: BoundAction
  actDelete: BoundAction
  disabled?: boolean
  // The game is finished. The keyboard is WITHDRAWN rather than disabled — see
  // `.gameOver` in the stylesheet — while keeping the space it occupied, so the
  // board above it doesn't move on the frame the game ends.
  gameOver?: boolean
  // Best tone seen for each (lowercase) letter, or absent for neutral.
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
 * Game-agnostic by construction: the keycap's own chrome is `--kbd-*`, the
 * judged keys wear the shared `--wordle-*` palette by name, and there are no
 * game-specific imports either way, so it stays removable. A game with
 * per-letter feedback tints its caps by passing `keyStates`; one without passes
 * none.
 */
export function GuessKeyboard({
  onKey,
  actSubmit,
  actDelete,
  disabled = false,
  gameOver = false,
  keyStates,
}: Props) {
  // A keycap keeps its own chrome and takes what it DOES from the binding — the
  // same bargain the board's round shuffle pill makes. `aria-label` stays the
  // cap's own ("Backspace", not "Delete the last letter"): what is written on a
  // key is the key, and the tooltip carries the action's name.
  const submit = actionSurface(actSubmit)
  const del = actionSurface(actDelete)

  return (
    <div className={cls(styles.keyboard, gameOver && styles.gameOver)} aria-label="Keyboard">
      {ROWS.map((row, i) => (
        <div key={i} className={styles.row}>
          {i === 2 && (
            <button
              type="button"
              className={cls(styles.key, styles.wide)}
              {...del.buttonProps}
              disabled={disabled || del.buttonProps.disabled}
              aria-label="Backspace"
              // NOT a focus target — the same guard the board tiles use.
              // `preventDefault` on mousedown stops a CLICK parking focus on a
              // key: the trap is that the click focuses silently, the next
              // keystroke promotes it to `:focus-visible`, and a blue ring then
              // sits on whichever key you last tapped until you click
              // elsewhere. Nothing here needs focus — this keyboard exists so a
              // player without a physical one can type, and a player WITH one
              // just types. (Tab never reaches a cap: the page's ring is empty.)
              onMouseDown={(e) => e.preventDefault()}
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
              {...submit.buttonProps}
              disabled={disabled || submit.buttonProps.disabled}
              aria-label="Enter"
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
