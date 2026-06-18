import { useEffect, useRef, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { useGame } from '../hooks/useGame'
import { GuessForm } from './GuessForm'
import { GuessHistory } from './GuessHistory'
import styles from './PlayArea.module.css'

/**
 * Psychic Num's play surface — the gametype-specific render
 * inside `<GamePage>`'s render-prop slot. The route handler
 * (App.tsx) mounts GamePage at the route level; this is what
 * fills in the "active play area" when the game isn't paused.
 *
 * Composes the gametype-specific pieces:
 *   - `<GuessForm>` owns input state + submit_guess RPC.
 *   - `<GameOverModal>` (shared with the other games) pops on
 *     terminal entry; the action slot also shows a small
 *     "Game over: <status> [Back to club]" indicator once the
 *     modal is dismissed.
 *   - `<GuessHistory>` renders the append-only log.
 *
 * **Layout** is a two-column split that mimics the shape of a
 * real game — a "board" placeholder on the left (where a tile
 * grid or word grid would go in a real game) + controls or
 * results on the right. Psychic Num doesn't have a real board
 * (a single 1–10 number isn't worth tile UI), so the left
 * column is a styled rectangle reading "What's your guess?".
 *
 * The right column's "action slot" at the top has a fixed
 * minimum height that fits both the play form (status line +
 * input row) and the terminal indicator. Switching from
 * playing → terminal swaps the slot's content without shifting
 * the guess history below — per docs/ui.md → "Layout stability."
 *
 * Cross-cutting state (members, timer, play_state, paused, chat)
 * lives in `<GamePage>` above this component. PlayArea unmounts
 * on pause — its local state (modal-open flag + last-pilled guess
 * id ref) goes with it.
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
  goToClub,
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
  // the GamePage header. Correct guesses don't fire a pill: the
  // game terminalizes and the GameOverModal pops, which IS the
  // feedback.
  useEffect(function pillEachNewWrongGuess() {
    if (guesses.length === 0) return
    const latest = guesses[guesses.length - 1]
    if (lastSeenGuessIdRef.current === null) {
      lastSeenGuessIdRef.current = latest.id
      return
    }
    if (latest.id === lastSeenGuessIdRef.current) return
    lastSeenGuessIdRef.current = latest.id
    if (latest.was_correct) return  // GameOverModal covers this case
    feedback.show({
      tone: 'error',
      text: `${latest.number} — not the number`,
      dismiss: { kind: 'closeable' },
    })
  }, [guesses, feedback])

  // Terminal modal state. Initialized to `isTerminal` so navigating
  // into an already-won/lost game pops the modal on first render.
  // The effect below flips this true if isTerminal transitions
  // during play (winning guess or game-end timeout). No reopen
  // after dismiss — the indicator below carries the lasting cue.
  const [showModal, setShowModal] = useState(isTerminal)
  useEffect(function popOnTerminal() {
    if (isTerminal) setShowModal(true)
  }, [isTerminal])

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  // Per-status modal + indicator copy. `playState === 'won'` is the
  // only positive terminal state; otherwise the game ended via
  // out-of-guesses or out-of-time (distinguished by timer.expired).
  const over = isTerminal ? buildOver({
    playState,
    timerExpired: timer.expired,
  }) : null

  // Board placeholder content. During play, the prompt. On
  // terminal, the secret number — the one piece of factual
  // reveal that doesn't live anywhere else on the page (winner
  // username is in the guess history; outcome is in the
  // indicator + modal). Falls back to the prompt if the
  // games_state view's lazy target reveal hasn't landed yet.
  const boardPlaceholderText = isTerminal && game.target !== null
    ? `The number was ${game.target}`
    : "What's your guess?"

  return (
    <div className={styles.layout}>
      <div className={styles.boardArea}>
        <div className={styles.boardPlaceholder}>
          {boardPlaceholderText}
        </div>
      </div>
      <div className={styles.rightCol}>
        <div className={styles.actionSlot}>
          {over ? (
            <div className={styles.gameOverIndicator}>
              <span>
                <span className="muted">Game over:</span> {over.status}
              </span>
              <button
                type="button"
                className="secondary"
                onClick={goToClub}
              >
                Back to club
              </button>
            </div>
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

      {showModal && over && (
        <GameOverModal
          outcome={over.outcome}
          verdict={over.verdict}
          onClose={() => setShowModal(false)}
          onBackToClub={goToClub}
        />
      )}
    </div>
  )
}

/** Per-status modal + indicator copy. Detail-on-page intentionally:
 *  the winner is in the guess history (correct guess at the end),
 *  the target is on the board placeholder once terminal. The
 *  modal stays focused on the verdict line. */
function buildOver({
  playState,
  timerExpired,
}: {
  playState: string
  timerExpired: boolean
}): {
  outcome: 'won' | 'lost'
  verdict: string
  status: string
} {
  if (playState === 'won') {
    return { outcome: 'won', verdict: 'You win!', status: 'won' }
  }
  return {
    outcome: 'lost',
    verdict: timerExpired
      ? 'You lost: out of time'
      : 'You lost: out of guesses',
    status: timerExpired ? 'out of time' : 'out of guesses',
  }
}
