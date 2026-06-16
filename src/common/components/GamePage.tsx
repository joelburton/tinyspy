import { useEffect, useRef, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { games } from '../../games'
import { navigateToGameClub } from '../lib/games'
import { useCommonGame, type Member } from '../hooks/useCommonGame'
import { formatTimerSeconds } from '../hooks/useGameTimer'
import { ClubChatPanel } from './ClubChatPanel'
import { PauseBoundary } from './PauseBoundary'
import styles from './GamePage.module.css'

/**
 * The slice of common-side state that PlayArea may want to render
 * against — usernames (for guess attribution), the timer's
 * expired flag (for "Out of time" loss copy). Exposed via the
 * render-prop form of `children` so each game accesses only what
 * it needs without re-querying.
 */
export type GamePageContext = {
  members: Member[]
  timer: { displaySeconds: number; expired: boolean }
}

type Props = {
  /** The game's id. Drives every common-side data read (common.games,
   *  common.game_players) and the channel name. */
  gameId: string
  /** Authenticated session, threaded through to useCommonGame for
   *  presence tracking. */
  session: Session
  /** The gametype string. Used here to look up the manifest's
   *  submitTimeout dispatcher when the timer expires. */
  gametype: string
  /**
   * Optional edge-trigger fired ONCE on the not-paused → paused
   * transition. Wordknit uses this to broadcast a `selection clear`
   * so reconnecting peers land in an empty-selection state. Most
   * gametypes leave it undefined.
   */
  onPauseTransition?: () => void
  /** The gametype-specific play surface. Rendered inside the
   *  PauseBoundary (hidden behind PauseOverlay when paused).
   *  Render-prop form receives the common context (members,
   *  timer); plain-ReactNode form is for play surfaces that need
   *  neither. */
  children: ReactNode | ((ctx: GamePageContext) => ReactNode)
}

/**
 * The common game shell — owns the cross-cutting render of every
 * game page in the app.
 *
 * Responsibilities (one place for all of them, so every gametype's
 * page looks and behaves the same way):
 *   - **Header**: the game's algorithmically-generated `title`
 *     from `common.games.title` (e.g. wordknit's "ALPHA, ANGEL,
 *     APPLE, ARROW", tinyspy's "ada-v-bea: …"), plus timer display
 *     when applicable, Pause / Resume button, and Back-to-club.
 *   - **Pause boundary**: `<PauseBoundary>` wraps `children`, so
 *     the play surface gets `visibility: hidden` + the overlay
 *     while paused; the header stays visible and interactive.
 *   - **Chat**: `<ClubChatPanel>` mounted below. (Eventually this
 *     becomes a portal/popup; GamePage owning the trigger button
 *     means each game page stays unaware of chat.)
 *   - **Timer-expiry dispatch**: when `useCommonGame.timer.expired`
 *     flips true, GamePage fires the gametype's manifest
 *     `submitTimeout` — once, edge-triggered.
 *
 * What gametype-specific code looks like with this in place:
 * each game's `<PlayArea>` wraps its content in `<GamePage gameId
 * session gametype>` and renders only its play surface as
 * children. No header boilerplate, no pause-state plumbing, no
 * chat panel mount.
 */
export function GamePage({
  gameId,
  session,
  gametype,
  onPauseTransition,
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
          <button
            type="button"
            className="link-button"
            onClick={() => void navigateToGameClub(gameId)}
          >
            ← Back to club
          </button>
        </div>
      </header>

      <PauseBoundary
        paused={paused}
        missing={missing}
        manuallyPausedBy={manuallyPausedBy}
        onPause={onPauseTransition}
        onResume={sendManualUnpause}
      >
        {typeof children === 'function'
          ? children({ members, timer })
          : children}
      </PauseBoundary>

      <ClubChatPanel clubId={commonGame.club_id} members={members} />
    </div>
  )
}
