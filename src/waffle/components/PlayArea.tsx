import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useEndGameMenu } from '../../common/hooks/useEndGameMenu'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { SolutionReveal } from './SolutionReveal'
import { SwapLog } from './SwapLog'
import { WaffleGrid } from './WaffleGrid'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * SyrupSwap's play surface, shared by the coop and compete manifests.
 * Renders the caller's board with live color feedback, a swap counter
 * (used/budget/remaining + the puzzle's par), (coop) the shared swap
 * log, (compete) an opponent-progress strip, and the terminal verdict +
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
  menu,
}: GamePageCtx) {
  const { game, players: playerStates, swaps, loading } = useGame(gameId)
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  // ─── End-game action (per-game menu item) ──────────────
  // Available in both modes. A manual end terminates the game
  // neutrally — everyone {won:false}, status.outcome='manual' —
  // which the server records as play_state='ended'. In compete this
  // is "the friends agreed to stop the race", not a "you lose".
  // (On success the Realtime touch in waffle.end_game wakes useGame,
  // which refetches games_state and reveals the solution.)
  useEndGameMenu({
    isTerminal,
    menu,
    feedback,
    endGame: () => db.rpc('end_game', { target_game: gameId }),
  })

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isPlayer = self !== undefined
  const isCompete = game.mode === 'compete'

  // The left grid always shows the caller's own board + live colors —
  // including at game-over (their final state). The solved board is
  // revealed separately on the right (SolutionReveal).
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

  // In compete, `status.winner` is the winning player's id (or null).
  const selfWon =
    (status?.winner as string | undefined) === session.user.id
  const over = isTerminal
    ? buildOver({ mode: game.mode, playState, timerExpired: timer.expired, selfWon })
    : null

  // Swaps-made / budget / remaining + par. Shown both mid-game and at
  // game-over (where it's the final tally), so it lives in one place.
  const swapStats = (
    <>
      <p>
        Swaps:{' '}
        <strong>
          {swapsUsed}/{game.max_swaps}
        </strong>{' '}
        ({remaining} remaining)
      </p>
      <p>
        Par: <strong>{game.par_swaps}</strong>
      </p>
    </>
  )

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
            {isPlayer && <div className="muted">{swapStats}</div>}
            {game.solution && <SolutionReveal solution={game.solution} />}
            <BackToClubButton onClick={goToClub} />
          </div>
        ) : (
          <>
            {isCompete && (
              <OpponentStrip
                players={members}
                selfId={session.user.id}
                metricFor={(player) => {
                  const ps = playerStates.find(
                    (p) => p.user_id === player.user_id,
                  )
                  const used = ps?.swaps_used ?? 0
                  const solved = ps?.solved ?? false
                  const out = !solved && used >= game.max_swaps
                  return (
                    <>
                      {used}
                      {solved ? ' ✓' : out ? ' ✗' : ''}
                    </>
                  )
                }}
              />
            )}
            {isPlayer ? (
              <div className="muted">
                <p>Tap two tiles to swap them.</p>
                {swapStats}
              </div>
            ) : (
              <p className="muted">Watching — you're not in this game.</p>
            )}
          </>
        )}

        {/* The shared move log — coop only (compete writes none, and a
            swap sequence would leak an opponent's hidden board). Visible
            both during play and after the game. */}
        {!isCompete && <SwapLog swaps={swaps} players={members} />}
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
  // Manual end (waffle.end_game) → 'ended' in either mode. Neutral
  // result: nobody won or lost. We reuse GameOverModal's 'won'
  // outcome purely for its green styling — the verdict copy makes
  // clear there's no winner. Handled before the win/lose branches so
  // an 'ended' game never falls through to a loss verdict.
  if (playState === 'ended') {
    return {
      outcome: 'won',
      verdict: mode === 'coop' ? 'Game ended.' : 'Game ended — no winner.',
      status: 'ended',
    }
  }
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
