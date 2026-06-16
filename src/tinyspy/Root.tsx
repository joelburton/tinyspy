import type { GameRootProps } from '../common/lib/games'
import { useGame } from './hooks/useGame'
import { PlayArea } from './components/PlayArea'
import './theme.css'  // tinyspy-specific color tokens (lazy-loaded with this chunk)

/**
 * Tinyspy mount point. The shell parses `/g/tinyspy/<gameId>`,
 * looks up this manifest's Root, and mounts it with `gameId` as
 * a prop. Hands off to PlayArea — Back-to-club lives on the
 * common <GamePage>.
 *
 * The not-found gate is here rather than in PlayArea so we don't
 * mount the full game shell (GamePage + useCommonGame) for a
 * stale id; the cheap per-gametype useGame check is enough.
 */
export function TinyspyRoot({ session, gameId }: GameRootProps) {
  const { game, loading } = useGame(gameId)

  if (loading) return <div className="card">Loading game…</div>
  if (!game) return <div className="card">Game not found.</div>

  return <PlayArea session={session} gameId={gameId} />
}
