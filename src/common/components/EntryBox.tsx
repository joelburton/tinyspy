import type { ReactNode } from 'react'
import { cls } from '../lib/cls'
import { useGameHasKeyboard } from '../hooks/useGameHasKeyboard'
import styles from './EntryBox.module.css'

type Props = {
  /** The text currently entered. Empty string shows the placeholder. */
  value: string
  /** Faint hint shown when `value` is empty (e.g. "type 1–20"). */
  placeholder?: ReactNode
  /**
   * Optional custom rendering of the entered value — e.g. per-character
   * styling (spellingbee dims letters not in the puzzle). When omitted, the
   * raw `value` string renders as plain text. The caret still sits after it.
   */
  children?: ReactNode
  /** Appended to the base box class for per-game appearance (size, layout). */
  className?: string
  /**
   * A transient pass/fail result shown *in place of* the entry — e.g. a
   * "Correct" / "Incorrect" flash after a guess. When set, the box shows
   * `label` with a green (`good`) / red (`bad`) border and **hides the
   * caret**: the entry is reporting a result, not awaiting input. The caller
   * owns the lifetime (typically a ~1s timer, then back to null).
   */
  result?: { tone: 'good' | 'bad'; label: ReactNode } | null
}

/**
 * The shared **capture-input display**: a box that looks like a text input
 * but holds no `<input>`. The capture-input games read keystrokes off the
 * window (see `useGlobalKeyHandler`) and feed the pending value here; there's
 * no focusable field, so clicking a board tile never blurs the entry and
 * interrupts typing.
 *
 * What this component owns — the *invariant* part:
 *   - the input-like shell (border / padding / radius / background);
 *   - the **simulated caret**, blinking only while the game owns the keyboard
 *     (via `useGameHasKeyboard`) — the affordance a real input's cursor would
 *     give, kept honest so it never duels with the chat box's cursor;
 *   - placeholder-when-empty slotting.
 *
 * What the *consumer* owns — the parts that vary:
 *   - **what can be entered** + key handling → the game's `useGlobalKeyHandler`
 *     callback (digits vs letters, length/value caps, ArrowUp recall, …);
 *   - **appearance** (size, how the box sits in its row) → `className`;
 *   - **value rendering** (plain vs per-character styling) → `children`.
 */
export function EntryBox({ value, placeholder, children, className, result }: Props) {
  const gameHasKeyboard = useGameHasKeyboard()

  // A result flash takes over the box entirely — colored border, the result
  // label, no caret (we're not awaiting input during the flash).
  if (result) {
    return (
      <div
        className={cls(
          styles.box,
          result.tone === 'good' ? styles.resultGood : styles.resultBad,
          className,
        )}
      >
        <span className={styles.result}>{result.label}</span>
      </div>
    )
  }

  const empty = value === ''

  return (
    <div className={cls(styles.box, className)}>
      {!empty && (children ?? <span className={styles.value}>{value}</span>)}
      {gameHasKeyboard && <span className={styles.caret} aria-hidden />}
      {empty && placeholder !== undefined && (
        <span className={styles.placeholder}>{placeholder}</span>
      )}
    </div>
  )
}
