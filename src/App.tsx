import { Suspense } from 'react'
import { useSession } from './common/hooks/session/useSession'
import { LoginScreen } from './common/components/auth/LoginScreen'
import { ClaimHandleScreen } from './common/components/auth/ClaimHandleScreen'
import { ClubPage } from './common/components/club/ClubPage'
import { CreateClubPage } from './common/components/club/CreateClubPage'
import { GamePage } from './common/components/game/GamePage'
import { PlayAreaErrorBoundary } from './common/components/game/PlayAreaErrorBoundary'
import { PlayAreaSlotLog, PlayAreaReadyLog } from './common/components/game/PlayAreaMountLog'
import { HomePage } from './common/components/home/HomePage'
import { PalettePage } from './common/components/palette/PalettePage'
import { EditProfileDialog } from './common/components/account/EditProfileDialog'
import { useEditProfileOpen, setEditProfileOpen } from './common/lib/account/editProfileStore'
import { WordEditDialog } from './common/components/definitions/WordEditDialog'
import { useWordEdit } from './common/lib/definitions/wordEditStore'
import { GameInvitations } from './common/components/game/GameInvitations'
import { ToastHost } from './common/components/toasts/ToastHost'
import { FaultDialog } from './common/components/feedback/FaultDialog'
import { TooltipHost } from './common/components/tooltips/TooltipHost'
import { useRealtimeReconnect } from './common/hooks/realtime/useRealtimeReconnect'
import { useBacktickEscape } from './common/hooks/input/useBacktickEscape'
import { usePath } from './common/lib/routing/router'
import { games } from './games'

/**
 * Top-level shell. Owns the URL → component routing for all paths
 * the app understands:
 *
 *   /                          →  HomePage (your clubs + create-club link)
 *   /c/new                     →  CreateClubPage
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
  // App level like EditProfileDialog, and for the same FloatingPanel-offset
  // reason. Keyed by the request so switching words remounts fresh state.
  const wordEdit = useWordEdit()

  if (loading) return <div className="card">Loading…</div>
  // The palette page, ahead of the auth gates on purpose: it renders tokens, not
  // data, so there is nothing to sign in for. Unlinked but not hidden — it ships,
  // and anyone who types the path gets it. See PalettePage for what it is for.
  if (path === '/palette') return <PalettePage />
  if (!session) return <LoginScreen />
  // Signed in but no profile row yet — block all app routes until
  // they pick a username. ClaimHandleScreen calls refresh() on
  // success so this gate flips off without a page reload.
  if (needsClaim) return (
    <ClaimHandleScreen onClaimed={refresh} email={session.user.email} />
  )

  // Resolve the current route to a page component. The account items (Profile /
  // Log out) are no longer a fixed chip mounted here — each page carries them as
  // the last submenu of its own menu (see useAccountMenuSection), which is what
  // freed the 2rem the game header was reserving for that chip to overlap.
  let page
  if (path === '/c/new') {
    page = <CreateClubPage session={session} />
  } else {
    const clubMatch = path.match(/^\/c\/([^/]+)\/?$/)
    if (clubMatch) {
      // Keyed by handle (like GamePage's gameId key below) so a club→club
      // navigation REMOUNTS — fresh subscriptions + a fresh chat-feedback
      // seen-set, so the new club's chat backlog doesn't replay as pills.
      page = <ClubPage key={clubMatch[1]} handle={clubMatch[1]} session={session} />
    } else {
      // Game routes — GamePage shell + the manifest's PlayArea
      // as a render-prop child. Path shape: /g/<gametype>/<gameId>.
      // Anything else under /g/ falls through to HomePage (rather
      // than rendering a broken game screen), matching the
      // "be forgiving with URLs" stance.
      // Gametype allows underscore so the sibling-manifest pair strings
      // (connections_coop, connections_compete, psychicnum_coop, …) match.
      // Without it, opening a sibling game silently falls through to
      // the HomePage fallback below — the user lands back at their
      // club list with no console error to explain why.
      const gameMatch = path.match(/^\/g\/([a-z0-9_]+)\/([0-9a-f-]+)\/?$/i)
      if (gameMatch) {
        const [, gametype, gameId] = gameMatch
        const game = games.find((g) => g.gametype === gametype)
        if (!game) {
          page = (
            <div className="card">
              <h1>Unknown game type</h1>
              <p className="error">
                No registered game called <code>{gametype}</code>.
              </p>
            </div>
          )
        } else {
          const PlayArea = game.PlayArea
          page = (
            <GamePage
              key={gameId}
              gameId={gameId}
              session={session}
              gametype={gametype}
            >
              {(ctx) => (
                // The two mount-only console breadcrumbs for "blank play
                // area" reports — slot handed over vs game code actually
                // committed. See PlayAreaMountLog for how to read them.
                <PlayAreaSlotLog
                  gametype={gametype}
                  gameId={gameId}
                  playState={ctx.playState}
                  isTerminal={ctx.isTerminal}
                >
                  <PlayAreaErrorBoundary>
                    <Suspense fallback={<p>Loading game…</p>}>
                      <PlayAreaReadyLog gametype={gametype} />
                      <PlayArea {...ctx} />
                    </Suspense>
                  </PlayAreaErrorBoundary>
                </PlayAreaSlotLog>
              )}
            </GamePage>
          )
        }
      } else {
        // Fallback (including the bare `/`): land on home. Better
        // UX than a 404 for a typo'd URL; if it matters we add a
        // real not-found screen later.
        page = <HomePage session={session} />
      }
    }
  }

  return (
    <>
      {page}
      {editingProfile && (
        <EditProfileDialog
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
      <FaultDialog />
      {/* The styled-tooltip renderer for every `data-tooltip` element
          (buttons' hover bubbles) — one delegated host, viewport-clamped. */}
      <TooltipHost />
    </>
  )
}
