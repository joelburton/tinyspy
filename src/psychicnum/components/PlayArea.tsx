import { useEffect, useRef } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { useGame } from '../hooks/useGame'
import { GuessForm } from './GuessForm'
import { GuessHistory } from './GuessHistory'
import { ResultBanner } from './ResultBanner'
import styles from './PlayArea.module.css'

/**
 * Psychic Num's play surface — the gametype-specific render
 * inside `<GamePage>`'s render-prop slot. The route handler
 * (App.tsx) mounts GamePage at the route level; this is what
 * fills in the "active play area" when the game isn't paused.
 *
 * Composes the gametype-specific pieces:
 *   - `<GuessForm>` owns input state + submit_guess RPC.
 *   - `<ResultBanner>` (gated by `isTerminal` from ctx) owns the
 *     won/lost copy.
 *   - `<GuessHistory>` renders the append-only log.
 *
 * **Layout** is a two-column split that mimics the shape of a
 * real game — a "board" placeholder on the left (where a tile
 * grid or word grid would go in a real game) + controls or
 * results on the right. Psychic Num doesn't have a real board
 * (a single 1–10 number isn't worth tile UI), so the left
 * column is a styled rectangle reading "What's your guess?".
 * Standing in for a board makes the page read as a proper game
 * surface, not just a thin form with a list. See
 * PlayArea.module.css for the placeholder rationale.
 *
 * The right column's "action slot" at the top has a fixed
 * minimum height that fits both the play form (status line +
 * input row) and the terminal `<ResultBanner>` (won/lost h2 +
 * detail line). Switching from playing → terminal swaps the
 * slot's content without shifting the guess history below —
 * per docs/ui.md → "Layout stability." Eventually the terminal
 * result moves into a modal per "Modals for terminal results";
 * until then the in-slot swap keeps the page coherent.
 *
 * Cross-cutting state (members, timer, play_state, paused, chat)
 * lives in `<GamePage>` above this component. PlayArea unmounts
 * on pause — its local state (currently none directly;
 * `useGame`'s state is the per-tab postgres-changes channel)
 * goes with it.
 *
 * `useGame` reads from the `psychicnum.games_state` view, which
 * surfaces `target` conditionally on the game being terminal.
 * PlayArea reads `game.target` directly without knowing about
 * the view-vs-table split.
 */
export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  timer,
  feedback,
}: GamePageCtx) {
  // session intentionally unused — psychic-num has no per-self
  // rendering today, but the prop is part of the GamePage contract
  // so future per-self UI (winner-highlight, etc.) doesn't need
  // a signature change.
  void session

  const { game, guesses, loading } = useGame(gameId)

  // Track the id of the last guess we've already-pilled-for, so a
  // re-render doesn't fire feedback for the same guess twice and a
  // navigate-into-an-existing-game doesn't fire for the whole
  // history at once. Pattern lifted from FloatingChat's
  // autoOpenOnImportantMessage detector.
  const lastSeenGuessIdRef = useRef<string | null>(null)

  // Surface each new wrong guess as a closeable feedback pill in
  // the GamePage header — same UX wordknit uses for its non-
  // matching guesses ("Incorrect", "One away!"). Correct guesses
  // don't fire a pill: the game terminalizes and ResultBanner
  // takes over the action slot, which IS the feedback.
  useEffect(function pillEachNewWrongGuess() {
    if (guesses.length === 0) return
    const latest = guesses[guesses.length - 1]
    // First render after mount: snapshot the latest id WITHOUT
    // firing — existing history shouldn't pop a pill on
    // navigate-in. Same first-load posture FloatingChat uses.
    if (lastSeenGuessIdRef.current === null) {
      lastSeenGuessIdRef.current = latest.id
      return
    }
    if (latest.id === lastSeenGuessIdRef.current) return
    lastSeenGuessIdRef.current = latest.id
    if (latest.was_correct) return  // ResultBanner covers this case
    feedback.show({
      tone: 'error',
      text: `${latest.number} — not the number`,
      dismiss: { kind: 'closeable' },
    })
  }, [guesses, feedback])

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  return (
    <div className={styles.layout}>
      <div className={styles.boardArea}>
        <div className={styles.boardPlaceholder}>
          What's your guess?
        </div>
      </div>
      <div className={styles.rightCol}>
        <div className={styles.actionSlot}>
          {isTerminal ? (
            <ResultBanner
              status={playState === 'won' ? 'won' : 'lost'}
              winnerId={game.winner_id}
              target={game.target}
              timerExpired={timer.expired}
              players={players}
            />
          ) : (
            <>
              <p className="muted">
                Guess the number (1–10).{' '}
                <strong>{game.guesses_remaining}</strong>{' '}
                {game.guesses_remaining === 1 ? 'guess' : 'guesses'} left.
              </p>
              <GuessForm gameId={gameId} />
            </>
          )}
        </div>
        <GuessHistory guesses={guesses} players={players} />
      </div>
    </div>
  )
}
