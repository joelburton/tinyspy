import type { GameRootProps } from '../common/lib/games'
import { navigate } from '../common/lib/router'
import { BoardScreen } from './components/BoardScreen'
import './theme.css'  // wordknit-specific color tokens (lazy with this chunk)

/**
 * Wordknit mount point. The shell parses `/g/wordknit/<gameId>`,
 * looks up this manifest's Root, and mounts it with `gameId` as
 * a prop. Same shape as the other games' Roots.
 */
export function WordknitRoot({ session, gameId }: GameRootProps) {
  function leaveGame() {
    navigate('/')
  }

  return <BoardScreen session={session} gameId={gameId} onLeave={leaveGame} />
}
