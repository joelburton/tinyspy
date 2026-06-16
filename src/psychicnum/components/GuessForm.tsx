import { useState, type SubmitEvent } from 'react'
import { db } from '../db'

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
      <form onSubmit={handleSubmit} className="actions">
        <input
          type="number"
          min={1}
          max={10}
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
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
