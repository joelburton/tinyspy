import type { GameRootProps } from '../common/lib/games'
import { navigate } from '../common/lib/router'
import { BoardScreen } from './components/BoardScreen'

/**
 * Psychic Num mount point. The shell parses
 * `/g/psychicnum/<gameId>`, looks up this manifest's Root, and
 * mounts it with `gameId` as a prop. Same shape as TinyspyRoot —
 * thin wrapper providing navigation helpers and delegating to
 * BoardScreen for everything else.
 *
 * No `theme.css` import here (unlike tinyspy) — Psychic Num is
 * deliberately styling-free; it leans entirely on the global
 * utility classes from `src/common/theme.css`.
 */
export function PsychicnumRoot({ gameId }: GameRootProps) {
  function enterGame(id: string) {
    navigate(`/g/psychicnum/${id}`)
  }

  function leaveGame() {
    navigate('/')
  }

  return (
    <BoardScreen
      gameId={gameId}
      onLeave={leaveGame}
      onEnterGame={enterGame}
    />
  )
}
