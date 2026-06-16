import type { GamePageCtx } from '../../common/lib/games'
import { useGame } from '../hooks/useGame'
import { GuessForm } from './GuessForm'
import { GuessHistory } from './GuessHistory'
import { ResultBanner } from './ResultBanner'

/**
 * Psychic Num's play surface — the gametype-specific render
 * inside `<GamePage>`'s render-prop slot. The route handler
 * (App.tsx) mounts GamePage at the route level; this is what
 * fills in the "active play area" when the game isn't paused.
 *
 * Composes the gametype-specific pieces:
 *   - `<GuessForm>` owns input state + submit_guess RPC.
 *   - `<ResultBanner>` (gated by status === 'active' ternary)
 *     owns the won/lost copy.
 *   - `<GuessHistory>` renders the append-only log.
 *
 * Cross-cutting state (members, timer, paused, chat) lives in
 * `<GamePage>` above this component. PlayArea unmounts on pause
 * — its local state (currently none directly; `useGame`'s state
 * is the per-tab postgres-changes channel) goes with it.
 *
 * `useGame` reads from the `psychicnum.games_state` view, which
 * surfaces `target` conditionally on terminal status. PlayArea
 * reads `game.target` directly without knowing about the
 * view-vs-table split.
 */
export function PlayArea({ session, gameId, members, timer }: GamePageCtx) {
  // session intentionally unused — psychic-num has no per-self
  // rendering today, but the prop is part of the GamePage contract
  // so future per-self UI (winner-highlight, etc.) doesn't need
  // a signature change.
  void session

  const { game, guesses, loading } = useGame(gameId)

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  return (
    <>
      {game.status === 'active' ? (
        <section>
          <p>
            Guess the number (1–10).{' '}
            <strong>{game.guesses_remaining}</strong>{' '}
            {game.guesses_remaining === 1 ? 'guess' : 'guesses'} left.
          </p>
          <GuessForm gameId={gameId} />
        </section>
      ) : (
        <ResultBanner
          status={game.status}
          winnerId={game.winner_id}
          target={game.target}
          timerExpired={timer.expired}
          members={members}
        />
      )}

      <GuessHistory guesses={guesses} members={members} />
    </>
  )
}
