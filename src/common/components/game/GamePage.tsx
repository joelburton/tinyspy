import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { games } from '../../../games'
import type {
  GenericFeedbackApi,
  GenericFeedbackMsg,
  GamePageCtx,
  MenuApi,
  MenuItem,
  MenuSection,
} from '../../lib/games'
import { useAppShortcuts } from '../../hooks/input/useAppShortcuts'
import { useClubPresence } from '../../hooks/realtime/useClubPresence'
import { useClubSetupPresence } from '../../hooks/realtime/useClubSetupPresence'
import { useCommonGame } from '../../hooks/game/useCommonGame'
import { formatTimerSeconds } from '../../hooks/game/useGameTimer'
import { useClubRoster } from '../../hooks/club/useClubRoster'
import { useChatFeedback } from '../../hooks/chat/useChatFeedback'
import { navigate } from '../../lib/routing/router'
import { ChatBubble } from '../chat/ChatBubble'
import { FloatingChat } from '../chat/FloatingChat'
import { ScratchpadBubble } from '../panels/ScratchpadBubble'
import { GameScratchpad } from '../panels/GameScratchpad'
import { GameLogo } from '../branding/GameLogo'
import { Menu, type MenuHandle } from '../panels/Menu'
import { TriggerWithChevron } from '../panels/TriggerWithChevron'
import { PauseBoundary } from './PauseBoundary'
import { PauseButton } from '../buttons/PauseButton'
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
   *  submitTimeout dispatcher when the timer expires, to pick
   *  the right SVG for `<GameLogo>`, and to fetch the per-game
   *  `help` component for the menu's Help item. */
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
 *     ├── Header  (Menu(logo) + chat-bubble + status-slot | pause + timer)
 *     ├── PauseBoundary
 *     │     ├── if !paused → children({players, timer, feedback, menu, ...})
 *     │     └── if  paused → <PauseOverlay/>
 *     ├── Help modal  (when menu's Help item is active)
 *     └── FloatingChat  (z-index 10000, above everything else)
 *
 * Header layout is layout-static per docs/ui.md → Layout
 * stability — the four chrome elements + the timer slot don't
 * reflow as state changes. The middle `<StatusSlot>` swaps
 * between `<PlayersStrip>` (default) and `<GenericFeedbackPill>` (when
 * the per-gametype PlayArea has called `ctx.globalFeedback.show()`)
 * at fixed slot height so neighbors don't move.
 *
 * The logo is a menu trigger (see docs/ui.md → "GamePage menu"):
 * click opens a dropdown with two sections. The common section
 * is built here (Help + Back to club); the per-game section is
 * pushed by PlayArea via `ctx.menu.setGameItems([...])`. Items
 * disappear during pause because PlayArea unmounts and its
 * `setGameItems` cleanup clears them — common items keep working.
 *
 * Help is a per-game contract on the manifest. Every game declares
 * `help: ComponentType<{ onClose: () => void }>`; the menu's Help
 * item flips local state that mounts the component; `onClose`
 * unmounts it. Lazy-loaded with the game's chunk, wrapped in a
 * Suspense boundary here so a slow chunk fetch doesn't crash.
 *
 * Header stays visible during pause; the overlay only covers
 * the play surface. Feedback that's active when pause fires
 * stays readable in the header — callers who want a specific
 * feedback to drop on pause must `clear()` explicitly. The menu
 * stays openable during pause for the same reason.
 *
 * PlayArea unmounts on pause and remounts on resume — selections,
 * form state, and any per-gametype channels start fresh. State
 * that should *survive* a pause must live above the boundary
 * (useCommonGame, the feedback + menu state here) or in the DB.
 *
 * FloatingChat is rendered OUTSIDE PauseBoundary so it stays
 * available mid-pause ("waiting for Bea, anyone want to chat?").
 *
 * Game-end auto-unpauses: `useCommonGame.paused` short-circuits
 * to false once `common.games.ended_at` is populated, so a game
 * that ends mid-pause (stale-tab edge case) cleanly transitions
 * to "PlayArea mounted, GameOverModal popped."
 *
 * Back-to-club asymmetry (per docs/states.md → "Leaving the
 * game page"): the "Back to club" menu item navigates directly
 * for terminal games and opens the suspend-confirm modal for
 * non-terminal games; on confirm, `sendSuspend` broadcasts → every
 * peer navigates back to the club page; last-leaver clears
 * is_current_view.
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

  // Announce on the club's presence channel that this player is
  // viewing THIS game, so the club page's member dots +
  // abandoned-game heal can see them. We don't read the roster here —
  // GamePage only announces. `club_handle` is null until the game row
  // loads, so the hook is a no-op until then.
  useClubPresence(commonGame?.club_handle ?? null, gameId, session.user.id)

  // Receive-only: while you're IN a game of this club (active OR paused), still
  // surface a peer's "setting up a new game" toast — e.g. someone abandons a
  // stuck paused game to start the next one. `announce: null` because you can't
  // open a setup dialog from a game page (ClubPage owns the announcing side).
  useClubSetupPresence({
    clubHandle: commonGame?.club_handle ?? null,
    selfId: session.user.id,
    announce: null,
  })

  // Open/closed state for the suspend-confirm modal (fired from
  // the menu's "Back to club" item for non-terminal games).
  const [confirmingSuspend, setConfirmingSuspend] = useState(false)
  // Whether the per-game Help modal is mounted. Toggled by the
  // menu's "Help" item.
  const [helpOpen, setHelpOpen] = useState(false)
  // The currently-active feedback message, or null when the
  // StatusSlot should show its default (`<PlayersStrip>`).
  const [globalFeedback, setGlobalFeedback] = useState<GenericFeedbackMsg | null>(null)
  // The per-game menu items the current PlayArea has pushed via
  // `ctx.menu.setGameItems`. Reset to [] on PlayArea unmount
  // (cleanup return on PlayArea's effect) — so during a pause the
  // game-specific section disappears and only the common section
  // shows. The common section is built fresh on each render below.
  const [gameMenuItems, setGameMenuItems] = useState<MenuItem[]>([])

  // Edge-trigger timeout-loss when countdown hits 0. The
  // submittedTimeoutRef gate prevents double-firing within this
  // tab; the RPC itself is server-side idempotent for the
  // multi-peer race case.
  const submittedTimeoutRef = useRef(false)
  useEffect(function fireTimeoutOnExpiry() {
    if (!timer.expired) return
    // No moves while paused — including this one. In practice the timer
    // freezes `ticks` on pause so `expired` can't flip true mid-pause,
    // but gating here makes "the play surface accepts no moves while
    // paused" hold for the timeout path too, without leaning on the
    // timer hook's internals. A timeout that comes due exactly as a
    // pause engages defers and resolves on resume (expired stays true).
    if (paused) return
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
  }, [timer.expired, paused, commonGame, gameId, gametype])

  // App-chrome keyboard shortcuts: "/" opens chat, "?" opens this menu,
  // "~" opens the word-lookup dialog (the hook owns + returns that
  // dialog; we render it below).
  const menuRef = useRef<MenuHandle>(null)
  const lookupDialog = useAppShortcuts(useCallback(() => menuRef.current?.open(), []))

  // Auto-clear `timed`-dismiss feedback after the configured
  // duration (default 2200ms). Sticky and closeable modes are
  // explicit no-ops at this layer.
  useEffect(function autoClearTimedFeedback() {
    if (!globalFeedback) return
    if (globalFeedback.dismiss.kind !== 'timed') return
    const ms = globalFeedback.dismiss.ms ?? 2200
    const t = setTimeout(() => setGlobalFeedback(null), ms)
    return () => clearTimeout(t)
  }, [globalFeedback])

  // Stable identities for the feedback API exposed to PlayArea.
  const globalFeedbackShow = useCallback((msg: GenericFeedbackMsg) => {
    setGlobalFeedback(msg)
  }, [])
  const globalFeedbackClear = useCallback(() => {
    setGlobalFeedback(null)
  }, [])
  const globalFeedbackApi = useMemo<GenericFeedbackApi>(
    () => ({ show: globalFeedbackShow, clear: globalFeedbackClear }),
    [globalFeedbackShow, globalFeedbackClear],
  )

  // Stable identity for the menu API exposed to PlayArea. The
  // PlayArea calls setGameItems in an effect; the cleanup return
  // calls setGameItems([]) so unmount clears the per-game section.
  const setGameItems = useCallback((items: MenuItem[]) => {
    setGameMenuItems(items)
  }, [])
  const menuApi = useMemo<MenuApi>(
    () => ({ setGameItems }),
    [setGameItems],
  )

  // Direct-nav back to the club page — the terminal-game branch
  // that the GamePage menu's "Back to club" item already does.
  // Exposed to PlayArea via ctx so the GameOverModal's button and
  // each game's PlayArea terminal indicator can call it without
  // re-deriving the URL. Identity tied to the club_handle so a
  // mid-session club rename (rare/impossible today) would refresh
  // the closure.
  const clubHandle = commonGame?.club_handle ?? ''
  const goToClub = useCallback(() => {
    if (!clubHandle) return
    navigate(`/c/${clubHandle}`)
  }, [clubHandle])

  // The FULL club roster (not just this game's players) — chat is club-wide, so
  // naming a sender (chat window + the feedback pill) needs every member. Empty
  // until the game row (and its club_handle) loads; `useClubRoster` no-ops on ''.
  const { members: clubMembers } = useClubRoster(clubHandle)

  // Club chat → the global feedback pill, same as ClubPage: a NEW message from
  // any OTHER member pops "● HANDLE: text" (sticky) in the header. Runs even
  // during the pre-load '' phase (useClubChat no-ops, so no historic replay).
  useChatFeedback({
    clubHandle,
    members: clubMembers,
    selfId: session.user.id,
    globalFeedback: globalFeedbackApi,
  })

  // Resolve the gametype's manifest once for downstream uses
  // (logo, help component). Find returns undefined for unknown
  // gametypes; we guard render below.
  const manifest = games.find((g) => g.gametype === gametype)

  if (loading) return <div className="card">Loading game…</div>
  if (!commonGame) return <div className="card">Game not found.</div>
  if (!manifest) return <div className="card">Unknown game type.</div>

  // The gametype's manual end-game dispatcher, if it has one (bananagrams has no
  // whole-table end — see the manifest). Used by the pause overlay's End-game
  // escape; undefined hides that button.
  const endGameFn = manifest.endGame

  const showTimer = commonGame.setup.timer?.kind === 'countup'
    || commonGame.setup.timer?.kind === 'countdown'
  const gameOver = commonGame.ended_at !== null
  const HelpComponent = manifest.help

  // Build the menu's common section. Help opens the help modal;
  // Back to club fires the same terminal vs non-terminal logic the
  // old logo-click did — direct navigation for terminal games,
  // suspend-confirm modal for non-terminal.
  const commonSection: MenuSection = {
    items: [
      {
        id: 'help',
        label: 'Help',
        onClick: () => setHelpOpen(true),
      },
      {
        id: 'back',
        label: 'Back to club',
        onClick: () => {
          if (gameOver) {
            // Terminal: navigate directly. The last-viewer cleanup
            // will fire unset_current_view via useCommonGame's
            // unmount on the route change.
            navigate(`/c/${commonGame.club_handle}`)
          } else {
            setConfirmingSuspend(true)
          }
        },
      },
    ],
  }
  const sections: MenuSection[] = [
    commonSection,
    { items: gameMenuItems },
  ]

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.left}>
          <Menu
            ref={menuRef}
            trigger={
              <TriggerWithChevron>
                <GameLogo gametype={gametype} />
              </TriggerWithChevron>
            }
            sections={sections}
            triggerLabel="Game menu"
          />
          <ChatBubble />
          {manifest.scratchpad?.enabled && <ScratchpadBubble />}
          <StatusSlot
            players={players}
            globalFeedback={globalFeedback}
            onCloseGlobalFeedback={globalFeedbackClear}
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
        // Escape hatches for a wedged presence-pause (both players walked away,
        // presence timed out). Return-to-club shelves the game (sendSuspend,
        // which broadcasts + navigates); End game dispatches to the gametype's
        // own end_game via the manifest (the same RPC the in-game End button
        // uses). Both go through PostgREST, so they work even when Realtime is
        // stuck — see docs + the reconnect nudge in App.
        onReturnToClub={sendSuspend}
        // Undefined for a game with no whole-table end (bananagrams) → the
        // overlay hides its End-game button. Captured as a local so the guard
        // narrows inside the async closure.
        onEndGame={
          endGameFn
            ? async () => {
                if (!window.confirm("End the game now? You can't undo this.")) return
                const { error } = await endGameFn(gameId)
                if (error) {
                  setGlobalFeedback({
                    tone: 'error',
                    text: `Couldn't end the game: ${error}`,
                    dismiss: { kind: 'sticky' },
                  })
                }
              }
            : undefined
        }
      >
        {children({
          session,
          gameId,
          brand: manifest.name,
          title: commonGame.title,
          players,
          playState: commonGame.play_state,
          isTerminal: commonGame.is_terminal,
          timer,
          setup: commonGame.setup,
          status: commonGame.status,
          goToClub,
          globalFeedback: globalFeedbackApi,
          menu: menuApi,
        })}
      </PauseBoundary>

      {/* Chat is club-context vocabulary ("anyone in the club may send a
          message"), so it gets the FULL club roster (`clubMembers` via
          useClubRoster), not just this game's `players` — so a message from a
          club member who ISN'T in this game still resolves to their handle +
          color instead of a '?'. (`players` remains the right data for the
          PlayersStrip / peer-game feedback, which are about THIS game.)

          hideClosedButton: the closed-state toggle lives in the header
          (<ChatBubble> above) on GamePage; FloatingChat only renders the panel
          itself, not a duplicate bubble. */}
      <FloatingChat
        clubHandle={commonGame.club_handle}
        members={clubMembers}
        selfId={session.user.id}
        hideClosedButton
      />

      {/* Per-game scratchpad — opt-in via the manifest. Outside PauseBoundary
          (survives pause + shows at terminal). Compete gets a private pad per
          player when perPlayerInCompete; coop shares one. */}
      {manifest.scratchpad?.enabled && (
        <GameScratchpad
          gameId={gameId}
          ownerId={
            manifest.scratchpad.perPlayerInCompete && manifest.mode === 'compete'
              ? session.user.id
              : null
          }
          myId={session.user.id}
          username={players.find((p) => p.user_id === session.user.id)?.username ?? 'You'}
          isTerminal={commonGame.is_terminal}
        />
      )}

      {/* Help modal — lazy-loaded from the manifest. Suspense
          fallback is null because a brief blank moment during chunk
          fetch is acceptable for a help modal (the user just
          clicked Help; they expect it to appear within a beat). */}
      {helpOpen && (
        <Suspense fallback={null}>
          <HelpComponent onClose={() => setHelpOpen(false)} brand={manifest.name} />
        </Suspense>
      )}

      {/* The "~" word-lookup dialog (owned by useAppShortcuts). Null
          when closed; a FloatingPanel when open. Sits at the page level
          so it stays available in any state, including the post-game
          reveal where chasing a "see X" definition is a prime use. */}
      {lookupDialog}

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
