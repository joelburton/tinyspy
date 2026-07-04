import type { ButtonHTMLAttributes } from 'react'
import { IconSubmit } from '../icons'
import { cls } from '../../lib/util/cls'
import styles from './SubmitWithScore.module.css'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** The staged play's score. `null` → an em-dash (nothing staged yet). */
  score: number | null
}

/**
 * A submit button that doubles as a live **score preview** — the up-triangle
 * submit glyph pinned LEFT, the score ("+23") pinned RIGHT, with an **em-dash**
 * when there's no play staged (`score == null`). The triangle never moves and the
 * score is right-justified, so the button reads like a little scoreboard and —
 * crucially — keeps a **fixed footprint** as the score ticks up/down or appears
 * from nothing (it does not grow when the first tile lands).
 *
 * This is deliberately UNLIKE the centered icon+label `ActionButton` family: the
 * left-icon / right-number split is the whole point, so it's its own component
 * rather than a `SubmitButton` variant. Built for scrabble's rack/commit row, but
 * general — any game with a live "what would this move score" preview can use it
 * (a future Boggle/word game commit). Primary weight (the base accent `<button>`),
 * since it's the main action.
 *
 * `onMouseDown` is suppressed so a click doesn't steal focus from a game's
 * window-level key capture (same guard the action buttons bake in).
 */
export function SubmitWithScore({ score, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label="Submit"
      className={cls(styles.button, className)}
      onMouseDown={(e) => e.preventDefault()}
      {...rest}
    >
      <IconSubmit size={18} aria-hidden />
      <span className={styles.score}>{score === null ? '—' : `+${score}`}</span>
    </button>
  )
}
