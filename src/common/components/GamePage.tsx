import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { games } from '../../games'
import { type GamePageCtx } from '../lib/games'
import { Link } from '../lib/Link'
import { useCommonGame } from '../hooks/useCommonGame'
import { formatTimerSeconds } from '../hooks/useGameTimer'
import { FloatingChat } from './FloatingChat'
import { PauseBoundary } from './PauseBoundary'
import { SuspendConfirmDialog } from './SuspendConfirmDialog'
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
 *     └── FloatingChat   (z-index 10000, above the pause overlay)
 *
 * Header stays visible during pause. PlayArea unmounts on pause
 * and remounts on resume — selections, form state, and any per-
 * gametype channels start fresh. State that should *survive* a
 * pause must live above the boundary (useCommonGame) or in the
 * DB.
 *
 * FloatingChat is rendered OUTSIDE PauseBoundary so it stays
 * available mid-pause ("waiting for Bea, anyone want to chat?").
 * It also stays above any modal that opens (SuspendConfirmDialog,
 * HowToPlayModal, HintModal) thanks to its z-index. The future
 * scratchpad is the opposite case — it'd render INSIDE
 * PauseBoundary so it vanishes on pause-unmount.
 *
 * Game-end auto-unpauses: `useCommonGame.paused` short-circuits
 * to false once `common.games.ended_at` is populated, so a game
 * that ends mid-pause (stale-tab edge case) cleanly transitions
 * to "PlayArea mounted, ResultBanner shown."
 *
 * Back-to-club asymmetry (per docs/states.md → "Leaving the
 * game page"): terminal games leave with a single click — no
 * progress to lose. Non-terminal games intercept the click,
 * open the suspend-confirm modal, and on accept fire
 * `sendSuspend` (broadcast → every peer navigates back to the
 * club page; last-leaver clears is_current_view).
 */
export function GamePage({
  gameId,
  session,
  gametype,
  children,
}: Props) {
  const {
    commonGame,
    players,
    paused,
    missing,
    manuallyPausedBy,
    sendManualPause,
    sendManualUnpause,
    sendSuspend,
    timer,
    loading,
  } = useCommonGame(gameId, session)
  // Open/closed state for the suspend-confirm modal. Set true
  // when the non-terminal Back-to-club click is intercepted;
  // cleared on Cancel or after Suspend (sendSuspend navigates
  // away, which unmounts this component anyway).
  const [confirmingSuspend, setConfirmingSuspend] = useState(false)

  // Edge-trigger timeout-loss when countdown hits 0. The
  // submittedTimeoutRef gate prevents double-firing within this
  // tab; the RPC itself is server-side idempotent for the
  // multi-peer race case.
  const submittedTimeoutRef = useRef(false)
  useEffect(function fireTimeoutOnExpiry() {
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
          {gameOver ? (
            // Terminal: single-click back. Real <Link> so the
            // browser shows the href on hover / middle-click /
            // right-click. Last-viewer cleanup will fire
            // unset_current_view via useCommonGame's unmount.
            <Link
              to={`/c/${commonGame.club_handle}`}
              className="link-button"
            >
              ← Back to club
            </Link>
          ) : (
            // Non-terminal: intercept the click and open the
            // suspend-confirm modal. Rendered as an <a> with the
            // matching href so it still looks/middle-clicks like
            // a link; the preventDefault on plain-click is what
            // opens the modal instead of navigating.
            <a
              href={`/c/${commonGame.club_handle}`}
              className="link-button"
              onClick={(e) => {
                // Honour middle-click / cmd+click as a normal
                // open-in-new-tab — only intercept plain clicks.
                if (e.button !== 0 || e.metaKey || e.ctrlKey
                  || e.shiftKey || e.altKey) {
                  return
                }
                e.preventDefault()
                setConfirmingSuspend(true)
              }}
            >
              ← Back to club
            </a>
          )}
        </div>
      </header>

      <PauseBoundary
        paused={paused}
        missing={missing}
        manuallyPausedBy={manuallyPausedBy}
        onResume={sendManualUnpause}
      >
        {children({
          session,
          gameId,
          players,
          playState: commonGame.play_state,
          isTerminal: commonGame.is_terminal,
          timer,
        })}
      </PauseBoundary>

      {/* Chat is club-context vocabulary ("anyone in the club may
          send a message"), so the prop is `members`. The data we
          have here is the game-players list — a strict subset of
          club members. Messages from a club member who isn't in
          this game render with a '?' for the sender (latent gap,
          pre-dates this rename; out of scope here). */}
      <FloatingChat clubId={commonGame.club_id} members={players} />

      {confirmingSuspend && (
        <SuspendConfirmDialog
          title={commonGame.title}
          onCancel={() => setConfirmingSuspend(false)}
          onSuspend={() => {
            // sendSuspend broadcasts + navigates self. Peers
            // navigate themselves on receipt; the last leaver
            // clears is_current_view via cleanup.
            sendSuspend()
          }}
        />
      )}
    </div>
  )
}
