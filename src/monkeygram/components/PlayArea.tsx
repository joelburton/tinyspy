import type { GamePageCtx } from '../../common/lib/games'
import { useGame } from '../hooks/useGame'
import { PlayerBoard } from './PlayerBoard'
import '../theme.css' // monkeygram tokens + the global drag-cursor rule

/**
 * MonkeyGram play surface.
 *
 * A thin load gate: `useGame` fetches the caller's own player board
 * (RLS-scoped), then we mount `<PlayerBoard>` — the interactive
 * two-column surface (board left, hand right) that owns the live board
 * and snapshots it. Seeding `PlayerBoard`'s state from the loaded board
 * is done by mounting it only once the board is in hand (no
 * setState-in-effect), so a reload restores exactly where you left off.
 */
export function PlayArea(ctx: GamePageCtx) {
  const { state, loading } = useGame(ctx.gameId)

  if (loading) return <p className="muted">Dealing tiles…</p>

  return <PlayerBoard gameId={ctx.gameId} initialState={state} />
}
