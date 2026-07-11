import { Suspense, useState } from 'react'
import { useSession } from './common/hooks/session/useSession'
import { LoginScreen } from './common/components/auth/LoginScreen'
import { ClaimHandleScreen } from './common/components/auth/ClaimHandleScreen'
import { ClubPage } from './common/components/club/ClubPage'
import { CreateClubPage } from './common/components/club/CreateClubPage'
import { GamePage } from './common/components/game/GamePage'
import { HomePage } from './common/components/home/HomePage'
import { UserMenu } from './common/components/account/UserMenu'
import { EditProfileDialog } from './common/components/account/EditProfileDialog'
import { GameInvitations } from './common/components/game/GameInvitations'
import { ToastHost } from './common/components/toasts/ToastHost'
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
  // Edit-profile popup, opened from the UserMenu. Held here (not in the
  // menu) so the dialog is a sibling of the page — the popup coexists
  // with chat / invitations rather than replacing the current screen.
  const [editingProfile, setEditingProfile] = useState(false)

  if (loading) return <div className="card">Loading…</div>
  if (!session) return <LoginScreen />
  // Signed in but no profile row yet — block all app routes until
  // they pick a username. ClaimHandleScreen calls refresh() on
  // success so this gate flips off without a page reload.
  if (needsClaim) return (
    <ClaimHandleScreen onClaimed={refresh} email={session.user.email} />
  )

  // Resolve the current route to a page component. UserMenu is
  // mounted as a sibling below — appears on every authenticated
  // screen with no per-page wiring (see docs/ui.md → "UserMenu").
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
                <Suspense fallback={<p>Loading game…</p>}>
                  <PlayArea {...ctx} />
                </Suspense>
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
      <UserMenu
        session={session}
        onEditProfile={() => setEditingProfile(true)}
      />
      {editingProfile && (
        <EditProfileDialog
          session={session}
          onSaved={() => setEditingProfile(false)}
          onCancel={() => setEditingProfile(false)}
        />
      )}
      {/* Mounted after the auth + claim-handle gates, so invitations
          pop on every real page but never the login / claim screens.
          GameInvitations is headless — it pushes invite toasts into the
          shared store; ToastHost renders that store's stack (bottom-right,
          above everything, portaled to <body>). */}
      <GameInvitations session={session} />
      <ToastHost />
      {/* The styled-tooltip renderer for every `data-tooltip` element
          (buttons' hover bubbles) — one delegated host, viewport-clamped. */}
      <TooltipHost />
    </>
  )
}
