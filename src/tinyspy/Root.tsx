import { useMemo } from 'react'
import type { GameRootProps } from '../common/lib/games'
import { navigate, usePath } from '../common/lib/router'
import { useGame } from './hooks/useGame'
import { HomeScreen } from './components/HomeScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { BoardScreen } from './components/BoardScreen'

/**
 * Top-level Tinyspy mount point — everything from "signed in" onward.
 *
 * State machine inside one game schema:
 *
 *     HomeScreen   (no /g/<id> in URL)
 *               ↘
 *                LobbyScreen   (game.status = 'lobby')
 *                BoardScreen   (any other status)
 *
 * The URL — specifically the `/g/<gameId>` path — is the source of
 * truth for "what game are we in." No `useState` for gameId here;
 * we derive it from `usePath()` on every render. `enterGame` and
 * `leaveGame` are just shims that navigate to a new URL; the next
 * render picks up the change via the router's popstate-subscribed
 * `usePath` hook.
 *
 * The shell (src/App.tsx) hands us a session and stays game-agnostic;
 * everything Tinyspy-specific (home flow, lobby, board) lives here
 * or in components mounted from here.
 *
 * Pre-clubs gap: there's no "URL-restore" path right now. The old
 * `#game=<join_code>` flow used to call `join_game` on mount so a
 * shared link could pull a friend into a game. Path routing gives
 * us `/g/<gameId>` (a UUID), but the existing join_game RPC takes
 * a 6-char human code, not a UUID. Rather than building a
 * one-commit-lived `join_game_by_id` shim, we drop URL-restore
 * entirely until clubs ship — at which point joining a game means
 * "be a member of the club whose page shows this game," not "have a
 * link to it." See project memory's execution sequence: commits 3–5
 * replace the entire entry flow.
 */
export function TinyspyRoot({ session }: GameRootProps) {
  const path = usePath()

  // Match `/g/<gameId>` and pull the UUID out. Anything else is
  // treated as "we're on home." The trailing `\/?` allows either
  // `/g/abc` or `/g/abc/` indifferently.
  const gameId = useMemo(() => {
    const m = path.match(/^\/g\/([0-9a-f-]+)\/?$/i)
    return m ? m[1] : null
  }, [path])

  function enterGame(id: string) {
    navigate(`/g/${id}`)
  }

  function leaveGame() {
    navigate('/')
  }

  if (!gameId) return <HomeScreen session={session} onEnterGame={enterGame} />
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
 * Inner state machine for an active gameId: shows either LobbyScreen
 * (status = 'lobby') or BoardScreen (any other status). The transition
 * is driven entirely by `games.status` changes propagated through
 * Realtime — when start_game flips status to 'active', both players'
 * screens swap from lobby to board automatically with no extra
 * navigation logic.
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
  if (game.status === 'lobby') {
    return <LobbyScreen session={session} gameId={gameId} onLeave={onLeave} />
  }
  return (
    <BoardScreen
      session={session}
      gameId={gameId}
      onLeave={onLeave}
      onEnterGame={onEnterGame}
    />
  )
}
