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
}

/**
 * The shared **capture-input display**: large centered text with a blinking
 * caret, holding no `<input>`. The capture-input games read keystrokes off the
 * window (see `useGlobalKeyHandler`) and feed the pending value here; there's
 * no focusable field, so clicking a board tile never blurs the entry and
 * interrupts typing.
 *
 * What this component owns — the *invariant* part:
 *   - the chrome-less display (no border/background — just large centered text,
 *     so the typed word reads as the focus, not as a form field);
 *   - the **simulated caret**, shown only once something's typed AND while the
 *     game owns the keyboard (via `useGameHasKeyboard`) — the affordance a real
 *     input's cursor would give, kept honest so it never duels with the chat
 *     box's cursor (and stays out of an empty field, which the placeholder owns);
 *   - placeholder-when-empty slotting.
 *
 * What the *consumer* owns — the parts that vary:
 *   - **what can be entered** → the game's `useCaptureKeys` `charFor` (digits vs
 *     letters, the stored case); the universal keys — Backspace / Enter / the
 *     ArrowUp-recall + ArrowDown-clear last-move history — are built into the hook;
 *   - **appearance** (font size, layout beyond the shared fill-the-row width) → `className`;
 *   - **value rendering** (plain vs per-character styling) → `children`.
 */
export function EntryBox({ value, placeholder, children, className }: Props) {
  const gameHasKeyboard = useGameHasKeyboard()

  const empty = value === ''

  return (
    <div className={cls(styles.box, className)}>
      {!empty && (children ?? <span className={styles.value}>{value}</span>)}
      {/* Caret only once something's been typed: an empty field shows just the
          placeholder, which already says "type here". A caret on an empty box
          would blink off in the corner (or, centered, float oddly mid-box) with
          nothing to anchor it — noise, not an affordance. */}
      {gameHasKeyboard && !empty && <span className={styles.caret} aria-hidden />}
      {empty && placeholder !== undefined && (
        <span className={styles.placeholder}>{placeholder}</span>
      )}
    </div>
  )
}
