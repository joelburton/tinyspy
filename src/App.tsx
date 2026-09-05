// cs-unmet

import { Suspense } from 'react'
import { useSession } from './common/session/useSession'
import { LoginScreen } from './common/auth/LoginScreen'
import { ClaimHandleScreen } from './common/auth/ClaimHandleScreen'
import { ClubPage } from './common/club/ClubPage'
import { GamePage } from './common/game-page/GamePage'
import { PlayAreaErrorBoundary } from './common/game-page/PlayAreaErrorBoundary'
import { PlayAreaSlotLog, PlayAreaReadyLog } from './common/game-page/PlayAreaMountLog'
import { HomePage } from './common/home/HomePage'
import { FontPage } from './common/devtools/FontPage'
import { PalettePage } from './common/devtools/PalettePage'
import { EditProfileModal } from './common/account/EditProfileModal'
import { useEditProfileOpen, setEditProfileOpen } from './common/account/editProfileStore'
import { WordEditDialog } from './common/definitions/WordEditDialog'
import { useWordEdit } from './common/definitions/wordEditStore'
import { GameInvitations } from './common/invitations/GameInvitations'
import { ToastHost } from './common/toasts/ToastHost'
import { FaultModal } from './common/faults/FaultModal'
import { Loading } from './common/loading/Loading'
import { ErrorPage, EnvelopeErrorPage } from './common/error-page/ErrorPage'
import { StandardButton } from './common/buttons/StandardButton'
import { diagnosticsLine } from './common/supabase/dbLog'
import { TooltipHost } from './common/tooltips/TooltipHost'
import { useRealtimeReconnect } from './common/realtime/useRealtimeReconnect'
import { useBacktickEscape } from './common/keyboard/useBacktickEscape'
import { usePath } from './common/routing/router'
import { matchClubRoute, matchGameRoute } from './common/routing/routes'
import { gametypes } from './gametypes'


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
 * The Suspense fallback inside the GamePage render-prop handles
 * the brief moment between "navigated to /g/<gametype>/<id>" and
 * "the game's JS chunk arrived." Subsequent in-session navigations
 * to that game are cached.
 */

export default function App() {
  const { session, needsClaim, probeFailed, loading, refresh } = useSession()
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

  // Developer pages --- ahead of auth gates.
  if (path === '/palette') return <PalettePage />
  if (path === '/font') return <FontPage />

  if (!session) return <LoginScreen />
  // The profile read failed, so whether this person has claimed a username is
  // unknown — and every route below needs that answer. The page takes the
  // place of the guess; Try again re-runs the same probe.
  if (probeFailed) return (
    <EnvelopeErrorPage
      envelope={probeFailed}
      action={<StandardButton name="Try again" weight="primary" onClick={() => void refresh()} />}
    />
  )
  // Signed in but no profile row yet — block all app routes until
  // they pick a username. ClaimHandleScreen calls refresh() on
  // success so this gate flips off without a page reload.
  if (needsClaim) return (
    <ClaimHandleScreen onClaimed={refresh} email={session.user.email} />
  )

  // The game route: the `<GamePage>` shell with the manifest's PlayArea as its
  // render-prop child.
  //
  // The gametype is matched case-INSENSITIVELY but the registry is keyed on the
  // lowercase codename, so it is normalized before the lookup. Without that,
  // `/g/Wordle/<id>` matches the route, misses the registry, and is reported as
  // a fault — which it isn't. `urlGametype` survives for the two places that
  // should echo what the URL actually said.
  const gamePage = (urlGametype: string, gameId: string) => {
    const gametype = urlGametype.toLowerCase()
    const gameManifest = gametypes.find((g) => g.gametype === gametype)

    if (!gameManifest)
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

    const PlayArea = gameManifest.PlayArea
    // Keyed by gameId so navigating between games REMOUNTS — a clean state
    // slate, no stale subscriptions.
    return (
      <GamePage key={gameId} gameId={gameId} session={session} manifest={gameManifest}>
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

  // The current route, as a page. CALLED, not rendered as a component — the
  // elements it returns reconcile exactly as if they were written inline, where
  // a component defined in here would take a new identity every render and
  // remount its whole subtree.
  const currentPage = () => {

    const club = matchClubRoute(path)
    // Keyed by handle so a club→club navigation REMOUNTS — fresh subscriptions
    if (club) return <ClubPage key={club.handle} handle={club.handle} session={session} />

    const game = matchGameRoute(path)
    if (game) return gamePage(game.gametype, game.gameId)

    if (path === '/') return <HomePage session={session} />

    // Anything else lands on home too — but add to console for debugging.
    console.warn(`[route] no match for ${path} — showing the home page`)
    return <HomePage session={session} />
  }

  return (
    <>
      {currentPage()}

      {editingProfile && (
        <EditProfileModal
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
