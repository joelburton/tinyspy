import { useEffect, useRef, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { games } from '../../games'
import { type GamePageCtx } from '../lib/games'
import { Link } from '../lib/Link'
import { useCommonGame } from '../hooks/useCommonGame'
import { formatTimerSeconds } from '../hooks/useGameTimer'
import { ClubChatPanel } from './ClubChatPanel'
import { PauseBoundary } from './PauseBoundary'
import styles from './GamePage.module.css'

type Props = {
  /** The game's id. Drives every common-side data read
   *  (common.games, common.game_players) and the channel name. */
  gameId: string
  /** Authenticated session, threaded into useCommonGame for
   *  presence tracking and re-exposed via ctx to PlayArea. */
  session: Session
  /** The gametype string. Used here to look up the manifest's
   *  submitTimeout dispatcher when the timer expires. */
  gametype: string
  /** Render-prop child. Receives `GamePageCtx` and returns the
   *  per-gametype play surface JSX. Called only when the game is
   *  loaded AND not paused — PauseBoundary conditional-renders
   *  the overlay otherwise (children unmount cleanly). */
  children: (ctx: GamePageCtx) => ReactNode
}

/**
 * The common game shell — owns the cross-cutting render of every
 * game page. Mounted at the route level by `App.tsx` for any
 * `/g/<gametype>/<gameId>` URL; the per-gametype PlayArea sits
 * inside as a render-prop child.
 *
 * Tree shape:
 *
 *     GamePage
 *     ├── Header  (title, timer, Pause, Back-to-club)
 *     ├── PauseBoundary
 *     │     ├── if !paused → children({members, timer, ...})
 *     │     └── if  paused → <PauseOverlay/>
 *     └── ClubChatPanel
 *
 * Header + chat stay visible during pause. PlayArea unmounts on
 * pause and remounts on resume — selections, form state, and any
 * per-gametype channels start fresh. State that should *survive*
 * a pause must live above the boundary (useCommonGame) or in the
 * DB.
 *
 * Game-end auto-unpauses: `useCommonGame.paused` short-circuits
 * to false once `common.games.ended_at` is populated, so a game
 * that ends mid-pause (stale-tab edge case) cleanly transitions
 * to "PlayArea mounted, ResultBanner shown."
 */
export function GamePage({
  gameId,
  session,
  gametype,
  children,
}: Props) {
  const {
    commonGame,
    members,
    paused,
    missing,
    manuallyPausedBy,
    sendManualPause,
    sendManualUnpause,
    timer,
    loading,
  } = useCommonGame(gameId, session)

  // Edge-trigger timeout-loss when countdown hits 0. The
  // submittedTimeoutRef gate prevents double-firing within this
  // tab; the RPC itself is server-side idempotent for the
  // multi-peer race case.
  const submittedTimeoutRef = useRef(false)
  useEffect(() => {
    if (!timer.expired) return
    if (submittedTimeoutRef.current) return
    if (!commonGame || commonGame.ended_at !== null) return
    submittedTimeoutRef.current = true
    const manifest = games.find((g) => g.gametype === gametype)
    if (!manifest) return
    manifest.submitTimeout(gameId).then((result) => {
      if (result.error) {
        // P0001 'game is not active' on a peer-race is silently
        // swallowed by the manifest implementation; anything else
        // is a real error we want to see during alpha.
        console.error('submitTimeout failed', result.error)
      }
    })
  }, [timer.expired, commonGame, gameId, gametype])

  if (loading) return <div className="card">Loading game…</div>
  if (!commonGame) return <div className="card">Game not found.</div>

  const showTimer = commonGame.setup.timer?.kind === 'countup'
    || commonGame.setup.timer?.kind === 'countdown'
  const gameOver = commonGame.ended_at !== null

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <h1 className={styles.title}>{commonGame.title}</h1>
        <div className={styles.headerActions}>
          {showTimer && !gameOver && (
            <span className={styles.timer}>
              {formatTimerSeconds(timer.displaySeconds)}
            </span>
          )}
          {!paused && !gameOver && (
            <button
              type="button"
              className="link-button"
              onClick={sendManualPause}
            >
              Pause
            </button>
          )}
          <Link
            to={`/c/${commonGame.club_handle}`}
            className="link-button"
          >
            ← Back to club
          </Link>
        </div>
      </header>

      <PauseBoundary
        paused={paused}
        missing={missing}
        manuallyPausedBy={manuallyPausedBy}
        onResume={sendManualUnpause}
      >
        {children({ session, gameId, members, timer })}
      </PauseBoundary>

      <ClubChatPanel clubId={commonGame.club_id} members={members} />
    </div>
  )
}
