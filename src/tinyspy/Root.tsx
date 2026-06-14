import type { GameRootProps } from '../common/lib/games'
import { navigate } from '../common/lib/router'
import { useGame } from './hooks/useGame'
import { BoardScreen } from './components/BoardScreen'
import './theme.css'  // tinyspy-specific color tokens (lazy-loaded with this chunk)

/**
 * Tinyspy mount point. The shell parses `/g/tinyspy/<gameId>`,
 * looks up this manifest's Root, and mounts it with `gameId` as
 * a prop. The Root no longer parses the URL itself — that's
 * App.tsx's job — and it can trust `gameId` is non-empty.
 *
 * No lobby state anymore — under the clubs model, both members are
 * seated at game-creation time and the game starts directly in
 * 'active'. So there's no LobbyScreen and no status='lobby' branch
 * to handle; useGame's loaded game is always already playable
 * (or already-completed for terminal states).
 *
 * play_again's "enter the new game" hop hard-codes the tinyspy
 * gametype, since this Root only ever exists for tinyspy games.
 * The gametype-in-URL machinery sits in common code; the
 * per-game Root just knows its own name.
 */
export function TinyspyRoot({ session, gameId }: GameRootProps) {
  function enterGame(id: string) {
    navigate(`/g/tinyspy/${id}`)
  }

  function leaveGame() {
    // Drop the user back at the home page. Could navigate to the
    // game's club page instead (`/c/<handle>`) but we'd need an
    // extra fetch to resolve the handle; home is fine for v1.
    navigate('/')
  }

  return (
    <InGame
      session={session}
      gameId={gameId}
      onLeave={leaveGame}
      onEnterGame={enterGame}
    />
  )
}

/**
 * Internal helper that loads the game and renders BoardScreen.
 * Used to also branch to LobbyScreen on status='lobby'; that state
 * doesn't exist under the clubs model so the only thing this does
 * now is handle the loading and not-found states cleanly.
 */
function InGame({
  session,
  gameId,
  onLeave,
  onEnterGame,
}: {
  session: GameRootProps['session']
  gameId: string
  onLeave: () => void
  onEnterGame: (id: string) => void
}) {
  const { game, loading } = useGame(gameId)

  if (loading) return <div className="card">Loading game…</div>
  if (!game) return <div className="card">Game not found.</div>

  return (
    <BoardScreen
      session={session}
      gameId={gameId}
      onLeave={onLeave}
      onEnterGame={onEnterGame}
    />
  )
}
