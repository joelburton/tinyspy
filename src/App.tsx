// cs-met-deep

import { Suspense } from 'react'
import { useSession } from './common/hooks/session/useSession'
import { LoginScreen } from './common/components/auth/LoginScreen'
import { ClaimHandleScreen } from './common/components/auth/ClaimHandleScreen'
import { ClubPage } from './common/components/club/ClubPage'
import { GamePage } from './common/components/game/GamePage'
import { PlayAreaErrorBoundary } from './common/components/game/PlayAreaErrorBoundary'
import { PlayAreaSlotLog, PlayAreaReadyLog } from './common/components/game/PlayAreaMountLog'
import { HomePage } from './common/components/home/HomePage'
import { FontPage } from './common/components/font/FontPage'
import { PalettePage } from './common/components/palette/PalettePage'
import { EditProfileModal } from './common/components/account/EditProfileModal'
import { useEditProfileOpen, setEditProfileOpen } from './common/lib/account/editProfileStore'
import { WordEditDialog } from './common/components/definitions/WordEditDialog'
import { useWordEdit } from './common/lib/definitions/wordEditStore'
import { GameInvitations } from './common/components/game/GameInvitations'
import { ToastHost } from './common/components/toasts/ToastHost'
import { FaultModal } from './common/components/feedback/FaultModal'
import { Loading } from './common/components/loading-and-errs/Loading'
import { ErrorPage } from './common/components/loading-and-errs/ErrorPage'
import { diagnosticsLine } from './common/lib/supabase/dbLog'
import { TooltipHost } from './common/components/tooltips/TooltipHost'
import { useRealtimeReconnect } from './common/hooks/realtime/useRealtimeReconnect'
import { useBacktickEscape } from './common/hooks/input/useBacktickEscape'
import { usePath } from './common/lib/routing/router'
import { games } from './games'

/**
 * Top-level shell. Owns the URL → component routing for all paths
 * the app understands:
 *
 *   /                          →  HomePage (your clubs, and the button that
 *                                  opens <CreateClubModal> over them)
 *   /c/<handle>                →  ClubPage
 *   /g/<gametype>/<gameId>     →  <GamePage> wrapping the manifest's
 *                                  PlayArea via render-prop. Lazy-loaded.
 *   <anything else>            →  HomePage  (treated as "go home"
 *                                  rather than a 404 screen)
 *
 * Why the gametype is in the URL: with more than one registered
 * game, `/g/<id>` alone wouldn't tell us which schema to look the
 * id up in. Embedding the gametype keeps the route purely
 * structural — no cross-schema id resolution, no soft-FK lookup.
 *
 * **Game route shape**: `<GamePage>` is the shell mounted at the
 * route level. PlayArea is the gametype-specific play surface
 * mounted as GamePage's render-prop child:
 *
 *     <GamePage gameId session gametype>
 *       {(ctx) => <manifest.PlayArea {...ctx} />}
 *     </GamePage>
 *
 * GamePage owns the cross-cutting render (header, PauseBoundary,
 * chat); PlayArea owns the game-specific render. The render-prop
 * passes GamePageCtx (session, gameId, members, timer) into PlayArea.
 *
 * The whole GamePage is keyed by gameId so navigation between
 * games forces a remount — clean state slate, no stale subscriptions.
 *
 * Removing a game is still three actions (delete folder, delete
 * its line in games.ts, drop its DB schema). The shell is
 * untouched. See docs/common.md for the removability invariant.
 *
 * The Suspense fallback inside the GamePage render-prop handles
 * the brief moment between "navigated to /g/<gametype>/<id>" and
 * "the game's JS chunk arrived." Subsequent in-session navigations
 * to that game are cached.
 */
/** `/c/<handle>`, with or without a trailing slash. */
const CLUB_ROUTE = /^\/c\/([^/]+)\/?$/

/**
 * `/g/<gametype>/<gameId>`.
 *
 * The gametype allows UNDERSCORES so the sibling-manifest pair strings match
 * (`connections_coop`, `connections_compete`, `psychicnum_coop`, …); without
 * that, opening a sibling game falls through to the home page.
 *
 * The id is matched LOOSELY — anything that is not a slash. Whether a string
 * could name a game is `GamePage`'s question, not this one's: it is where the
 * other "no such game" is answered, so both arrive at the same page instead of
 * a URL-shaped rule here and a row-shaped rule there.
 */
const GAME_ROUTE = /^\/g\/([a-z0-9_]+)\/([^/]+)\/?$/i

export default function App() {
  const { session, needsClaim, loading, refresh } = useSession()
  const path = usePath()
  // Reopen the Realtime socket the moment the tab regains focus / the network
  // returns, so a slept-then-resumed session re-establishes presence instead of
  // sitting wedged in a game's pause overlay until a refresh. See the hook.
  useRealtimeReconnect()
  // Let `` ` `` stand in for Escape app-wide (keyboards without a physical
  // Esc key). Window-level, so it's mounted here at the root — see the hook.
  useBacktickEscape()
  // Edit-profile popup, opened from the account submenu in whichever page menu
  // is on screen. Still mounted HERE, not in the menu: it's a <FloatingPanel>,
  // and react-rnd positions one from its static flow position — mounted inside
  // a page's flex column it lands far from where you expect (docs/ui.md). The
  // flag therefore has to cross subtrees, hence the store rather than useState.
  const editingProfile = useEditProfileOpen()
  // The word-edit dialog (editors only — its openers are gated) mounts at the
  // App level like EditProfileModal, and for the same FloatingPanel-offset
  // reason. Keyed by the request so switching words remounts fresh state.
  const wordEdit = useWordEdit()

  if (loading) return <Loading />
  // The palette page, ahead of the auth gates on purpose: it renders tokens, not
  // data, so there is nothing to sign in for. Unlinked but not hidden — it ships,
  // and anyone who types the path gets it. See PalettePage for what it is for.
  if (path === '/palette') return <PalettePage />
  // Its twin for type, and here for the same reasons: no data, no session, no
  // link to it. See FontPage.
  if (path === '/font') return <FontPage />
  if (!session) return <LoginScreen />
  // Signed in but no profile row yet — block all app routes until
  // they pick a username. ClaimHandleScreen calls refresh() on
  // success so this gate flips off without a page reload.
  if (needsClaim) return (
    <ClaimHandleScreen onClaimed={refresh} email={session.user.email} />
  )

  /**
   * The game route: the `<GamePage>` shell with the manifest's PlayArea as its
   * render-prop child.
   *
   * The gametype is matched case-INSENSITIVELY but the registry is keyed on the
   * lowercase codename, so it is normalized before the lookup. Without that,
   * `/g/Wordle/<id>` matches the route, misses the registry, and is reported as
   * a fault — which it isn't. `urlGametype` survives for the two places that
   * should echo what the URL actually said.
   */
  const gamePage = (urlGametype: string, gameId: string) => {
    const gametype = urlGametype.toLowerCase()
    const game = games.find((g) => g.gametype === gametype)
    // A FAULT, not a polite empty state (Joel, 2026-08-23): every gametype in a
    // URL came from a link this app wrote, so an unregistered one means the
    // registry and the link disagree. There is no server error to classify, so
    // the diagnostics line is written by hand, the same way the homepage's
    // no-clubs fault writes its own.
    if (!game)
      return (
        <ErrorPage
          message={
            <>
              There's no game type called <code>{urlGametype}</code>. The link is
              wrong, or the game was removed from the app.
            </>
          }
          diagnostics={diagnosticsLine('FAULT', {
            call: `GET /g/${urlGametype}`,
            severity: 'fault',
            detail: 'no manifest registered for this gametype',
          })}
        />
      )
    const PlayArea = game.PlayArea
    // Keyed by gameId so navigating between games REMOUNTS — a clean state
    // slate, no stale subscriptions.
    return (
      <GamePage key={gameId} gameId={gameId} session={session} manifest={game}>
        {(ctx) => (
          // The two mount-only console breadcrumbs for "blank play area"
          // reports — slot handed over vs game code actually committed. See
          // PlayAreaMountLog for how to read them.
          <PlayAreaSlotLog
            gametype={gametype}
            gameId={gameId}
            playState={ctx.playState}
            isTerminal={ctx.isTerminal}
          >
            <PlayAreaErrorBoundary>
              <Suspense fallback={<Loading />}>
                <PlayAreaReadyLog gametype={gametype} />
                <PlayArea {...ctx} />
              </Suspense>
            </PlayAreaErrorBoundary>
          </PlayAreaSlotLog>
        )}
      </GamePage>
    )
  }

  /**
   * The current route, as a page. CALLED, not rendered as a component — the
   * elements it returns reconcile exactly as if they were written inline, where
   * a component defined in here would take a new identity every render and
   * remount its whole subtree.
   *
   * The account items (Profile / Log out) are not a fixed chip mounted here —
   * each page carries them as the last submenu of its own menu (see
   * `useAccountMenuSection`), which is what freed the 2rem the game header was
   * reserving for that chip to overlap.
   */
  const currentPage = () => {
    const club = path.match(CLUB_ROUTE)
    // Keyed by handle so a club→club navigation REMOUNTS — fresh subscriptions
    // and a fresh chat-feedback seen-set, so the new club's chat backlog
    // doesn't replay as pills.
    if (club) return <ClubPage key={club[1]} handle={club[1]} session={session} />
    const game = path.match(GAME_ROUTE)
    if (game) return gamePage(game[1], game[2])
    if (path === '/') return <HomePage session={session} />
    // Anything else lands on home too — better than a 404 for a typo'd URL —
    // but it says so, because the silent version of this hid a real bug: a
    // sibling gametype that failed GAME_ROUTE went home with nothing to
    // explain why. Unlike an unknown GAMETYPE, which is a fault (a link this
    // app wrote disagreeing with the registry), an unknown PATH is just
    // something someone typed.
    console.warn(`[route] no match for ${path} — showing the home page`)
    return <HomePage session={session} />
  }

  return (
    <>
      {currentPage()}
      {editingProfile && (
        <EditProfileModal
          session={session}
          onSaved={() => setEditProfileOpen(false)}
          onCancel={() => setEditProfileOpen(false)}
        />
      )}
      {wordEdit && (
        <WordEditDialog
          // Keyed by the target so switching words remounts fresh form state.
          key={wordEdit.mode === 'edit' ? wordEdit.word : 'add'}
          request={wordEdit}
        />
      )}
      {/* Mounted after the auth + claim-handle gates, so invitations
          pop on every real page but never the login / claim screens.
          GameInvitations is headless — it pushes invite toasts into the
          shared store; ToastHost renders that store's stack (bottom-right,
          above everything, portaled to <body>). */}
      <GameInvitations session={session} />
      <ToastHost />
      {/* The ONE fault-modal host (docs/ui.md → Faults): every sink routes
          fault-classified failures into the shared fault store; this renders
          them one at a time as a blocking modal. */}
      <FaultModal />
      {/* The styled-tooltip renderer for every `data-tooltip` element
          (buttons' hover bubbles) — one delegated host, viewport-clamped. */}
      <TooltipHost />
    </>
  )
}
