import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { OpponentStrip } from './OpponentStrip'
import { WaffleGrid } from './WaffleGrid'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * SyrupSwap's play surface, shared by the coop and compete manifests.
 * Renders the caller's board with live color feedback, a swap counter,
 * (compete) an opponent-progress strip, and the terminal verdict +
 * solution reveal. Mode is read from `game.mode`.
 *
 * Moves go through `waffle.submit_swap`; board/colors update via the
 * realtime refetch in `useGame` (Pattern A) — a swap needs no
 * optimistic local state (the FE can't compute colors; it doesn't hold
 * the solution).
 */
export function PlayArea({
  session,
  gameId,
  players: members,
  playState,
  isTerminal,
  timer,
  status,
  feedback,
  goToClub,
}: GamePageCtx) {
  const { game, players: playerStates, loading } = useGame(gameId)
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isPlayer = self !== undefined
  const isCompete = game.mode === 'compete'

  // Post-terminal, reveal the solved board (all green) — the answer.
  // During play, show the caller's own board + its live colors.
  const showSolution = isTerminal && game.solution !== null
  const board = showSolution
    ? (game.solution as string)
    : (self?.board ?? game.scramble)
  const colors = showSolution
    ? (game.solution as string).replace(/[^.]/g, 'g')
    : (self?.colors ?? null)

  const swapsUsed = self?.swaps_used ?? 0
  const remaining = Math.max(0, game.max_swaps - swapsUsed)

  async function handleSwap(a: number, b: number) {
    const { error } = await db.rpc('submit_swap', {
      target_game: gameId,
      pos_a: a,
      pos_b: b,
    })
    if (error) {
      feedback.show({
        tone: 'error',
        text: error.message,
        dismiss: { kind: 'closeable' },
      })
    }
    // On success the swap mutated waffle.players → realtime refetch
    // re-renders the board + colors.
  }

  // In compete, `status.winner` is the winning player's id (or null).
  const selfWon =
    (status?.winner as string | undefined) === session.user.id
  const over = isTerminal
    ? buildOver({ mode: game.mode, playState, timerExpired: timer.expired, selfWon })
    : null

  return (
    <div className={styles.layout}>
      <div className={styles.boardArea}>
        <WaffleGrid
          board={board}
          colors={colors}
          disabled={isTerminal || !isPlayer}
          onSwap={handleSwap}
        />
      </div>

      <div className={styles.rightCol}>
        {over ? (
          <div className={styles.gameOver}>
            <span>
              <span className="muted">Game over:</span> {over.status}
            </span>
            <button type="button" className="secondary" onClick={goToClub}>
              Back to club
            </button>
          </div>
        ) : (
          <>
            {isCompete && (
              <OpponentStrip
                members={members}
                playerStates={playerStates}
                selfId={session.user.id}
                maxSwaps={game.max_swaps}
              />
            )}
            {isPlayer ? (
              <p className="muted">
                Tap two tiles to swap them. <strong>{remaining}</strong>{' '}
                {remaining === 1 ? 'swap' : 'swaps'} left.
              </p>
            ) : (
              <p className="muted">Watching — you're not in this game.</p>
            )}
          </>
        )}
      </div>

      {showModal && over && (
        <GameOverModal
          outcome={over.outcome}
          verdict={over.verdict}
          onClose={closeModal}
          onBackToClub={goToClub}
        />
      )}
    </div>
  )
}

/** Terminal verdict + status copy, mode- and (compete) self-aware. */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfWon: boolean
}): { outcome: 'won' | 'lost'; verdict: string; status: string } {
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'Solved it! 🧇', status: 'solved' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'Out of time.' : 'Out of swaps.',
      status: timerExpired ? 'out of time' : 'out of swaps',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { outcome: 'won', verdict: 'You won — fewest swaps!', status: 'you won' }
      : { outcome: 'lost', verdict: 'Beaten on swaps.', status: 'opponent won' }
  }
  // lost_compete — nobody solved, or time ran out
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time — no winner.' : 'Nobody solved it.',
    status: timerExpired ? 'out of time' : 'no winner',
  }
}
