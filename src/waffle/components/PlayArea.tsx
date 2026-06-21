import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { WaffleGrid } from './WaffleGrid'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * SyrupSwap's play surface, shared between coop and compete manifests
 * (compete UI — the opponent strip — lands in slice 2). Renders the
 * caller's board with live color feedback, a swap counter, and the
 * terminal verdict. Mode is read from `game.mode`.
 *
 * Moves go through `waffle.submit_swap`; the board/colors update via
 * the realtime refetch in `useGame` (Pattern A), so a swap needs no
 * optimistic local state — the FE can't compute colors anyway (it
 * doesn't hold the solution).
 */
export function PlayArea({
  session,
  gameId,
  playState,
  isTerminal,
  timer,
  feedback,
  goToClub,
}: GamePageCtx) {
  const { game, players, loading } = useGame(gameId)
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const self = players.find((p) => p.user_id === session.user.id)
  // A club member who isn't a player can watch but not act.
  const isPlayer = self !== undefined
  const board = self?.board ?? game.scramble
  const colors = self?.colors ?? null
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

  const over = isTerminal ? buildOver(playState, timer.expired) : null

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
        ) : isPlayer ? (
          <p className="muted">
            Tap two tiles to swap them. <strong>{remaining}</strong>{' '}
            {remaining === 1 ? 'swap' : 'swaps'} left.
          </p>
        ) : (
          <p className="muted">Watching — you're not in this game.</p>
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

/** Terminal verdict + status copy from the play_state. */
function buildOver(
  playState: string,
  timerExpired: boolean,
): { outcome: 'won' | 'lost'; verdict: string; status: string } {
  if (playState === 'won' || playState === 'won_compete') {
    return { outcome: 'won', verdict: 'Solved it! 🧇', status: 'solved' }
  }
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time.' : 'Out of swaps.',
    status: timerExpired ? 'out of time' : 'out of swaps',
  }
}
