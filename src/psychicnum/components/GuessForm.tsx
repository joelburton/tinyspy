import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { db } from '../db'
import styles from './GuessForm.module.css'

type Props = {
  gameId: string
}

/**
 * The number-entry form. A self-contained component because it
 * owns state (input value, in-flight flag, validation/RPC error)
 * that nothing else in PlayArea cares about — keeping it here
 * trims PlayArea's mental load to "compose the play surface,"
 * not "track three form variables."
 *
 * Owns the `submit_guess` RPC call too. The form IS the act of
 * submitting; threading a callback up to PlayArea just to dispatch
 * the RPC would split a single concept across two files for no
 * gain. Realtime echo refreshes the game row on the parent
 * automatically — no need to lift result handling.
 *
 * Range gating is duplicated client-side (the `<input min/max>`
 * attrs + the Number.parseInt check) and server-side (the RPC's
 * `guess must be between 1 and 10` check). Client gate is for
 * snappy feedback; server gate is the source of truth.
 */
export function GuessForm({ gameId }: Props) {
  const [entry, setEntry] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Refocus the input whenever `submitting` flips back to false —
  // covers both initial mount (submitting starts false; effect
  // focuses on first render, in concert with the input's
  // autoFocus) and the post-submit re-focus the player wants so
  // they can type the next guess without reaching for the mouse.
  //
  // Why an effect rather than calling `inputRef.current?.focus()`
  // in handleSubmit after `setSubmitting(false)`: React hasn't
  // re-rendered yet at that point, so the input still has its
  // disabled attribute and a synchronous .focus() silently fails.
  // The effect runs after the disabled-prop change lands in the
  // DOM.
  useEffect(function refocusInputAfterSubmit() {
    if (!submitting) inputRef.current?.focus()
  }, [submitting])

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = Number.parseInt(entry, 10)
    if (Number.isNaN(n) || n < 1 || n > 10) {
      setError('Number must be between 1 and 10.')
      return
    }
    setError(null)
    setSubmitting(true)
    const { error: rpcError } = await db.rpc('submit_guess', {
      target_game: gameId,
      guess: n,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setEntry('')
  }

  return (
    <>
      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          ref={inputRef}
          className={styles.input}
          type="number"
          min={1}
          max={10}
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          // Game input: "/" and "?" still open chat / menu while typing here.
          data-game-input
          autoFocus
          disabled={submitting}
        />
        <button type="submit" disabled={submitting || entry === ''}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </>
  )
}
