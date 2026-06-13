import { useEffect, useMemo, useState } from 'react'
import type { GameRootProps } from '../common/lib/games'
import { readHashCode, writeHashCode } from '../common/lib/url'
import { db } from './db'
import { useGame } from './hooks/useGame'
import { HomeScreen } from './components/HomeScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { BoardScreen } from './components/BoardScreen'

/**
 * Top-level Tinyspy mount point — everything from "signed in" onward.
 *
 * State machine inside one game schema:
 *
 *     restoring → HomeScreen   (no active game)
 *               ↘
 *                LobbyScreen   (game.status = 'lobby')
 *                BoardScreen   (any other status)
 *
 * The current gameId is tracked in component state AND mirrored to
 * the URL hash (`#game=<join_code>`) so refresh and link-sharing work.
 * The hash is the source of truth on a cold load — see the restore
 * effect below.
 *
 * The shell (src/App.tsx) hands us a session and stays game-agnostic;
 * everything Tinyspy-specific (home flow, lobby, board, the join_game
 * URL-restore RPC) lives here or in components mounted from here.
 */
export function TinyspyRoot({ session }: GameRootProps) {
  const [gameId, setGameId] = useState<string | null>(null)

  // Read the URL hash ONCE at mount and remember it. Using useMemo
  // (rather than a plain const) so it isn't re-read on every render —
  // a transient hash change mid-mount would otherwise confuse the
  // restore flow.
  const initialCode = useMemo(() => readHashCode(), [])

  // `restoreAttempted` flips to true once the URL-hash join_game RPC
  // has settled (success or failure). It's initialized to true on the
  // common case (no hash to restore) so the "Loading…" splash is
  // skipped entirely on a cold load with a clean URL.
  const [restoreAttempted, setRestoreAttempted] = useState(
    () => initialCode === null,
  )

  // `restoring` is derived state — true only while we're actively
  // waiting on the URL-hash join_game RPC. Once we have a gameId
  // (regardless of how we got it: hash restore, manual create/join,
  // play_again) or once the restore has been attempted, we're done.
  //
  // Deriving avoids the "setState in effect body" anti-pattern that
  // arose when `restoring` was held as state and cleared from inside
  // the effect's early-return branches.
  const restoring = !restoreAttempted && !gameId

  function enterGame(id: string, code: string) {
    setGameId(id)
    writeHashCode(code)
  }

  function leaveGame() {
    setGameId(null)
    writeHashCode(null)
  }

  // Restore the game referenced by the URL hash once on mount.
  //
  // join_game is idempotent for an existing player (returns the game
  // id back), so calling it on refresh is safe. For a fresh user
  // receiving the URL as an invite link, it does the actual join —
  // same code path.
  //
  // Bad code → clear the hash silently and drop the user on the home
  // screen.
  useEffect(() => {
    // No-op in all three early-return cases below — `restoring` is
    // already false (initialized that way or cleared on a prior pass),
    // so the splash has already unmounted; we just don't issue the RPC.
    if (restoreAttempted || gameId || !initialCode) return

    db.rpc('join_game', { code: initialCode }).then(({ data, error }) => {
      if (error || !data) {
        console.warn('could not restore game from URL', error)
        writeHashCode(null)
      } else {
        setGameId(data)
      }
      setRestoreAttempted(true)
    })
  }, [initialCode, gameId, restoreAttempted])

  if (restoring) return <div className="card">Loading…</div>
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
  onEnterGame: (id: string, joinCode: string) => void
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
