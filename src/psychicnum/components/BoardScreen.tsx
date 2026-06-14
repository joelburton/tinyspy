import { useEffect, useState, type FormEvent } from 'react'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { ClubChatPanel } from '../../common/components/ClubChatPanel'

type Props = {
  gameId: string
  onLeave: () => void
  onEnterGame: (id: string) => void
}

/**
 * Psychic Num's one and only game screen — deliberately the
 * simplest possible: a number input, a submit button, a guesses
 * history, and a result on game end. Plus the standard
 * `ClubChatPanel` so the chat surface is identical to tinyspy's
 * (the whole point is to prove that shared common pieces keep
 * working when a second game is added).
 *
 * No bespoke theme or per-component CSS — uses only the global
 * utility classes from `src/common/theme.css`. This is on purpose:
 * Psychic Num exists to exercise the multi-game *wiring*, not to
 * be an interesting UI.
 *
 * State flow:
 *   - useGame returns the game row + guesses log + club members,
 *     refetched on any realtime event from psychicnum.{games,guesses}
 *   - On submit, we call psychicnum.submit_guess; the realtime
 *     echo refreshes the view (we don't manually update local state)
 *   - On game end, we lazily fetch the target via reveal_target
 *     (the column is hidden from authenticated SELECT) and show it
 */
export function BoardScreen({ gameId, onLeave, onEnterGame }: Props) {
  const { game, guesses, members, loading } = useGame(gameId)
  const [entry, setEntry] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealedTarget, setRevealedTarget] = useState<number | null>(null)

  // Once the game is terminal, fetch the target so we can show it
  // ("the number was 7"). reveal_target rejects while active, so
  // we gate on status; the result is cached in local state.
  //
  // `status` is read into a local so the dep array shows exactly
  // what the effect cares about (just status — not guesses_remaining,
  // not the rest of the game row).
  const status = game?.status
  useEffect(() => {
    if (!status || status === 'active') return
    if (revealedTarget !== null) return
    let cancelled = false
    db.rpc('reveal_target', { target_game: gameId }).then(({ data }) => {
      if (!cancelled && typeof data === 'number') {
        setRevealedTarget(data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [status, gameId, revealedTarget])

  async function handleSubmit(e: FormEvent) {
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

  async function handlePlayAgain() {
    const { data, error: rpcError } = await db
      .rpc('play_again', { prev_game: gameId })
      .single()
    if (rpcError || !data) {
      setError(rpcError?.message ?? 'failed to start a new game')
      return
    }
    onEnterGame(data.id)
  }

  if (loading) return <div className="card">Loading game…</div>
  if (!game) return <div className="card">Game not found.</div>

  // Local user-id → username map for rendering guess attribution.
  // All guessers are club members (RPC checks this), so the
  // members list is a complete dictionary.
  const usernameFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.username ?? 'someone'

  return (
    <div className="card">
      <header>
        <h1>Psychic Num</h1>
        <p>
          <button type="button" className="link-button" onClick={onLeave}>
            ← Back home
          </button>
        </p>
      </header>

      {game.status === 'active' && (
        <section>
          <p>
            Guess the number (1–10).{' '}
            <strong>{game.guesses_remaining}</strong>{' '}
            {game.guesses_remaining === 1 ? 'guess' : 'guesses'} left.
          </p>
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
        </section>
      )}

      {game.status === 'won' && (
        <section>
          <h2>We won!</h2>
          <p>
            {game.winner_id
              ? `${usernameFor(game.winner_id)} guessed it.`
              : 'Somebody guessed it.'}
            {revealedTarget !== null && ` The number was ${revealedTarget}.`}
          </p>
          <button type="button" onClick={handlePlayAgain}>
            Play again
          </button>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {game.status === 'lost' && (
        <section>
          <h2>We lost.</h2>
          <p>
            {revealedTarget !== null
              ? `The number was ${revealedTarget}.`
              : 'Out of guesses.'}
          </p>
          <button type="button" onClick={handlePlayAgain}>
            Play again
          </button>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      <section>
        <h3>Guesses</h3>
        {guesses.length === 0 ? (
          <p className="muted">No guesses yet.</p>
        ) : (
          <ul>
            {guesses.map((g) => (
              <li key={g.id}>
                <strong>{usernameFor(g.user_id)}</strong> guessed{' '}
                <strong>{g.number}</strong>
                {' — '}
                {g.was_correct ? 'correct!' : 'nope'}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ClubChatPanel clubId={game.club_id} members={members} />
    </div>
  )
}
