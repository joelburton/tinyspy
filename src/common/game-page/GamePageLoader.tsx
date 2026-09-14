// cs-unmet

import { Loading } from '../loading/Loading'
import { EnvelopeErrorPage } from '../error-page/ErrorPage'
import { useCommonGame } from './useCommonGame'
import { GamePage } from './GamePage'
import { NoSuchGamePage } from './NoSuchGamePage'
import type { GameShellProps } from './GamePageGate'

/**
 * The game's shared state, loaded — and the pages it can end in instead:
 * `<Loading>`, an error page, or the "no such game" card.
 *
 * **It exists so `<GamePage>` never holds a game that might not be there.**
 * Everything the page draws needs the row, the roster and the clock, and
 * React runs every hook before any early return — so a page that loads its own
 * state has to narrow a nullable row at each of the half-dozen hooks that come
 * before the guard, and bind actions during renders where the club handle is
 * still `''`. Splitting the wait out means the row and its neighbors arrive as
 * ordinary props with nothing to narrow.
 *
 * `GamePageGate` already proved the row existed, so this is about what happens
 * AFTER: `useCommonGame` refetches on every realtime event, so a game someone
 * deletes mid-session arrives here as zero rows, and an outage arrives as a
 * failed read. The gate answers the question once; this keeps answering it.
 *
 * Takes what the route hands down and renders nothing of its own.
 */
export function GamePageLoader({ gameId, session, manifest }: GameShellProps) {
  const {
    commonGame,
    players,
    activePlayers,
    paused,
    presentUserIds,
    manuallyPausedBy,
    sendManualPause,
    sendManualUnpause,
    sendSuspend,
    timer,
    isMyTurn,
    loading,
    failure,
  } = useCommonGame(gameId, session)

  if (loading) return <Loading />
  // A failed read is NOT a missing game — both leave `commonGame` null, and
  // only one of them means the game is gone.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!commonGame) {
    return <NoSuchGamePage detail={`rows=0 gametype=${manifest.gametype} game=${gameId}`} />
  }

  return (
    <GamePage
      gameId={gameId}
      session={session}
      manifest={manifest}
      commonGame={commonGame}
      players={players}
      activePlayers={activePlayers}
      paused={paused}
      presentUserIds={presentUserIds}
      manuallyPausedBy={manuallyPausedBy}
      sendManualPause={sendManualPause}
      sendManualUnpause={sendManualUnpause}
      sendSuspend={sendSuspend}
      timer={timer}
      isMyTurn={isMyTurn}
    />
  )
}
