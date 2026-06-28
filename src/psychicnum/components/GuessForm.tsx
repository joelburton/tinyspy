import { useEffect, useRef } from 'react'
import styles from './GuessForm.module.css'

type Props = {
  /** The pending guess (a string so the number input can be empty). Lifted to
   *  PlayArea so clicking a board tile and typing here stay in sync. */
  value: string
  onChange: (value: string) => void
  /** Submit the current value — PlayArea owns validation + the RPC. */
  onSubmit: () => void
  submitting: boolean
  /** Highest number on the board, for the input's `max` attr. */
  max: number
  error: string | null
  /** True when the viewer can't guess (out of budget) — greys the controls. */
  disabled?: boolean
}

/**
 * The number-entry row that sits **below the board**: a text input + Submit
 * button. Presentational and fully controlled — `value` is lifted to PlayArea,
 * which also owns the `submit_guess` RPC, so picking a board tile and typing
 * here drive the same pending guess. Range gating is duplicated client-side
 * (the `<input min/max>` + PlayArea's parse check) and server-side (the RPC);
 * the client gate is for snappy feedback, the server gate is the source of truth.
 */
export function GuessForm({ value, onChange, onSubmit, submitting, max, error, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Refocus the input whenever `submitting` flips back to false (post-submit),
  // so the player can type the next guess without reaching for the mouse. An
  // effect, not a synchronous focus in the handler: the input is still
  // `disabled` at that point, so a sync .focus() silently fails — the effect
  // runs after the disabled-prop change lands in the DOM.
  useEffect(function refocusInputAfterSubmit() {
    if (!submitting && !disabled) inputRef.current?.focus()
  }, [submitting, disabled])

  return (
    <>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <input
          ref={inputRef}
          className={styles.input}
          type="number"
          min={1}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Game input: "/" and "?" still open chat / menu while typing here.
          data-game-input
          disabled={submitting || disabled}
        />
        <button type="submit" disabled={submitting || disabled || value === ''}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </>
  )
}
