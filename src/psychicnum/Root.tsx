import type { GameRootProps } from '../common/lib/games'
import { PlayArea } from './components/PlayArea'

/**
 * Psychic Num mount point. The shell parses
 * `/g/psychicnum/<gameId>`, looks up this manifest's Root, and
 * mounts it with `gameId` as a prop. Just hands off to PlayArea —
 * Back-to-club + leave navigation now live on the common
 * <GamePage>, so there's no callback to plumb through.
 *
 * No `theme.css` import here — Psychic Num is deliberately
 * styling-free; it leans entirely on the global utility classes
 * from `src/common/theme.css`.
 */
export function PsychicnumRoot({ session, gameId }: GameRootProps) {
  return <PlayArea session={session} gameId={gameId} />
}
