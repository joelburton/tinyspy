import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { games } from '../../games'
import type { FeedbackApi, FeedbackMsg, GamePageCtx } from '../lib/games'
import { Link } from '../lib/Link'
import { useCommonGame } from '../hooks/useCommonGame'
import { formatTimerSeconds } from '../hooks/useGameTimer'
import { ChatBubble } from './ChatBubble'
import { FloatingChat } from './FloatingChat'
import { GameLogo } from './GameLogo'
import { PauseBoundary } from './PauseBoundary'
import { PauseButton } from './PauseButton'
import { StatusSlot } from './StatusSlot'
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
   *  submitTimeout dispatcher when the timer expires AND to pick
   *  the right SVG for `<GameLogo>`. */
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
 *     ├── Header  (logo + chat-bubble + status-slot | pause + timer)
 *     ├── PauseBoundary
 *     │     ├── if !paused → children({players, timer, feedback, ...})
 *     │     └── if  paused → <PauseOverlay/>
 *     └── FloatingChat   (z-index 10000, above the pause overlay)
 *
 * Header layout is layout-static per docs/ui.md → Layout
 * stability — the four chrome elements + the timer slot don't
 * reflow as state changes. The middle `<StatusSlot>` swaps
 * between `<PlayersStrip>` (default) and `<FeedbackPill>` (when
 * the per-gametype PlayArea has called `ctx.feedback.show()`)
 * at fixed slot height so neighbors don't move.
 *
 * Header stays visible during pause; the overlay only covers
 * the play surface. Feedback that's active when pause fires
 * stays readable in the header — callers who want a specific
 * feedback to drop on pause must `clear()` explicitly.
 *
 * PlayArea unmounts on pause and remounts on resume — selections,
 * form state, and any per-gametype channels start fresh. State
 * that should *survive* a pause must live above the boundary
 * (useCommonGame, the feedback state here) or in the DB.
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
 * game page"): terminal games leave with a single click on the
 * `<GameLogo>` — no progress to lose. Non-terminal clicks
 * intercept and open the suspend-confirm modal; on accept,
 * `sendSuspend` broadcasts → every peer navigates back to the
 * club page; last-leaver clears is_current_view.
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
  // when the non-terminal logo click is intercepted; cleared on
  // Cancel or after Suspend (sendSuspend navigates away, which
  // unmounts this component anyway).
  const [confirmingSuspend, setConfirmingSuspend] = useState(false)
  // The currently-active feedback message, or null when the
  // StatusSlot should show its default (`<PlayersStrip>`). State
  // lives here (not in per-game PlayArea) so the header can
  // render it without coupling to the play surface, and so it
  // survives PlayArea unmount on pause transitions.
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null)

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

  // Auto-clear `timed`-dismiss feedback after the configured
  // duration (default 2200ms — matches wordknit's previous
  // setTransient timing). Sticky and closeable modes are
  // explicit no-ops at this layer — they wait on the caller's
  // next `show()`/`clear()` or the user's × click respectively.
  //
  // Runs across pause transitions: header stays visible during
  // pause (overlay doesn't cover it), so the timer continues
  // counting from when the message was shown regardless of
  // pause state. That matches the docs/ui.md spec.
  useEffect(function autoClearTimedFeedback() {
    if (!feedback) return
    if (feedback.dismiss.kind !== 'timed') return
    const ms = feedback.dismiss.ms ?? 2200
    const t = setTimeout(() => setFeedback(null), ms)
    return () => clearTimeout(t)
  }, [feedback])

  // Stable identities for the feedback API exposed to PlayArea
  // via ctx.feedback. setFeedback is React-stable; the wrapping
  // useCallbacks + useMemo lock the object reference too, so a
  // PlayArea that depends on `feedback.show` in an effect dep
  // array doesn't restage on every render.
  const feedbackShow = useCallback((msg: FeedbackMsg) => {
    setFeedback(msg)
  }, [])
  const feedbackClear = useCallback(() => {
    setFeedback(null)
  }, [])
  const feedbackApi = useMemo<FeedbackApi>(
    () => ({ show: feedbackShow, clear: feedbackClear }),
    [feedbackShow, feedbackClear],
  )

  if (loading) return <div className="card">Loading game…</div>
  if (!commonGame) return <div className="card">Game not found.</div>

  const showTimer = commonGame.setup.timer?.kind === 'countup'
    || commonGame.setup.timer?.kind === 'countdown'
  const gameOver = commonGame.ended_at !== null

  // Logo wrapper: terminal = real <Link> (single-click back);
  // non-terminal = <a> with the matching href but an onClick
  // that intercepts plain clicks to open the suspend-confirm
  // modal. Middle/cmd/ctrl/shift/alt clicks fall through to
  // normal anchor behaviour (open in new tab, etc).
  //
  // The href is the same in both cases so hover-preview /
  // middle-click / right-click → "Copy link address" all behave
  // like a normal link.
  const clubHref = `/c/${commonGame.club_handle}`
  const logoWrapped = gameOver ? (
    <Link to={clubHref} className={styles.logoLink}>
      <GameLogo gametype={gametype} />
    </Link>
  ) : (
    <a
      href={clubHref}
      className={styles.logoLink}
      onClick={(e) => {
        if (
          e.button !== 0 || e.metaKey || e.ctrlKey
          || e.shiftKey || e.altKey
        ) {
          return
        }
        e.preventDefault()
        setConfirmingSuspend(true)
      }}
    >
      <GameLogo gametype={gametype} />
    </a>
  )

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.left}>
          {logoWrapped}
          <ChatBubble />
          <StatusSlot
            players={players}
            feedback={feedback}
            onCloseFeedback={feedbackClear}
          />
        </div>
        <div className={styles.right}>
          <PauseButton paused={paused} onPause={sendManualPause} />
          {showTimer && !gameOver && (
            <span className={styles.timer}>
              {formatTimerSeconds(timer.displaySeconds)}
            </span>
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
          feedback: feedbackApi,
        })}
      </PauseBoundary>

      {/* Chat is club-context vocabulary ("anyone in the club may
          send a message"), so the prop is `members`. The data we
          have here is the game-players list — a strict subset of
          club members. Messages from a club member who isn't in
          this game render with a '?' for the sender (latent gap,
          pre-dates this rename; out of scope here).

          hideClosedButton: the closed-state toggle lives in the
          header (<ChatBubble> above) on GamePage; FloatingChat
          only renders the panel itself, not a duplicate bubble. */}
      <FloatingChat
        clubId={commonGame.club_id}
        members={players}
        hideClosedButton
      />

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
