import type { GameRootProps } from '../common/lib/games'
import { PlayArea } from './components/PlayArea'
import './theme.css'  // wordknit-specific color tokens (lazy with this chunk)

/**
 * Wordknit mount point. The shell parses `/g/wordknit/<gameId>`,
 * looks up this manifest's Root, and mounts it with `gameId` as
 * a prop. Just hands off to PlayArea — Back-to-club lives on the
 * common <GamePage>, no leave callback needed.
 */
export function WordknitRoot({ session, gameId }: GameRootProps) {
  return <PlayArea session={session} gameId={gameId} />
}
