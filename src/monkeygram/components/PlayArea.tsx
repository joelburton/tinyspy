import { useCallback } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { db } from '../db'
import { useGame, useProgress } from '../hooks/useGame'
import { PlayerBoard } from './PlayerBoard'
import { PeersStrip } from './PeersStrip'
import '../theme.css' // monkeygram tokens + the global drag-cursor rule

/**
 * MonkeyGram play surface.
 *
 * Load gate: `useGame` fetches the caller's own player board (RLS-scoped),
 * `useProgress` subscribes to every player's public count. We mount
 * `<PlayerBoard>` — the fixed 25×25 arena + hand — and hand it the
 * `<PeersStrip>` (opponents' tiles-left) to slot above the hand. Seeding the
 * board state by mounting only once it's loaded (no setState-in-effect) means
 * a reload restores exactly where you left off.
 *
 * Win flow (Phase 4): the **Done** button (enabled only when the hand is
 * empty) calls `declare_done`. The first valid declaration ends the game for
 * everyone; the resulting `is_terminal` flip arrives over `useCommonGame`'s
 * realtime and drives `useTerminalModal` → the GameOverModal. So the winner
 * and the losers all show the same modal from the same signal — we never pop
 * it imperatively on the click. Both "did *I* win?" and the winner's name come
 * from `status.winner_username` (globally-unique handle) — and crucially that
 * field rides the SAME `common.games` update as the `is_terminal` flip, so it's
 * present the instant the modal opens (no cross-channel flash of the wrong
 * verdict, which deriving self-won from the separate `progress` channel risks).
 */
export function PlayArea(ctx: GamePageCtx) {
  const { state, loading } = useGame(ctx.gameId)
  const progress = useProgress(ctx.gameId)
  const { showModal, closeModal } = useTerminalModal(ctx.isTerminal)

  const { gameId, feedback } = ctx
  const declareDone = useCallback(async () => {
    const { error } = await db.rpc('declare_done', { target_game: gameId })
    // On success there's nothing to do here — the realtime is_terminal flip
    // drives the modal. A failure (race lost, hand not actually empty) is the
    // only thing worth surfacing.
    if (error) {
      feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'closeable' } })
    }
  }, [gameId, feedback])

  if (loading) return <p className="muted">Dealing tiles…</p>

  const selfUsername = ctx.players.find((p) => p.user_id === ctx.session.user.id)?.username
  const winnerName = (ctx.status?.winner_username as string | undefined) ?? 'someone'
  const selfWon = !!selfUsername && winnerName === selfUsername
  const over = ctx.isTerminal
    ? {
        outcome: (selfWon ? 'won' : 'lost') as 'won' | 'lost',
        verdict: selfWon ? 'You finished first! 🎉' : `${winnerName} finished first.`,
      }
    : null

  return (
    <>
      <PlayerBoard
        gameId={gameId}
        initialState={state}
        isTerminal={ctx.isTerminal}
        onDeclareDone={declareDone}
        peers={
          <PeersStrip players={ctx.players} progress={progress} selfUserId={ctx.session.user.id} />
        }
      />
      {showModal && over && (
        <GameOverModal
          outcome={over.outcome}
          verdict={over.verdict}
          onClose={closeModal}
          onBackToClub={ctx.goToClub}
        />
      )}
    </>
  )
}
