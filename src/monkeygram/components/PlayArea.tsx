import type { GamePageCtx } from '../../common/lib/games'
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
 */
export function PlayArea(ctx: GamePageCtx) {
  const { state, loading } = useGame(ctx.gameId)
  const progress = useProgress(ctx.gameId)

  if (loading) return <p className="muted">Dealing tiles…</p>

  return (
    <PlayerBoard
      gameId={ctx.gameId}
      initialState={state}
      peers={
        <PeersStrip players={ctx.players} progress={progress} selfUserId={ctx.session.user.id} />
      }
    />
  )
}
