import type { Session } from '@supabase/supabase-js'
import { GamePage } from '../../common/components/GamePage'
import { useGame } from '../hooks/useGame'
import { GuessForm } from './GuessForm'
import { GuessHistory } from './GuessHistory'
import { ResultBanner } from './ResultBanner'

type Props = {
  session: Session
  gameId: string
}

/**
 * Psychic Num's play surface — composes the game-specific bits
 * into the common `<GamePage>` shell. Everything cross-cutting
 * (title, timer, pause, chat) lives in `<GamePage>` above us;
 * everything form-local (entry state, submit RPC) lives in
 * `<GuessForm>`; the move log is `<GuessHistory>`; the win/loss
 * outcome panel is `<ResultBanner>`. PlayArea's job is just to
 * gate by status.
 *
 * State flow:
 *   - `useGame` returns the FE-ready game state — the gametype
 *     row + guesses log + the post-terminal `target` reveal,
 *     all merged. The two-step fetch is hidden inside the hook;
 *     here we read `game.target` like any other field.
 *   - `<GamePage>` runs the common realtime channel + timer +
 *     pause state; exposes `members` + `timer` via render-prop so
 *     we can attribute guesses to usernames and check
 *     `timer.expired` for "Out of time" loss copy.
 */
export function PlayArea({ session, gameId }: Props) {
  const { game, guesses, loading } = useGame(gameId)

  return (
    <GamePage gameId={gameId} session={session} gametype="psychicnum">
      {({ members, timer }) => {
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
      }}
    </GamePage>
  )
}
