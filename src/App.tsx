import { Suspense } from 'react'
import { useSession } from './common/hooks/useSession'
import { LoginScreen } from './common/components/LoginScreen'
import { ClubPage } from './common/components/ClubPage'
import { CreateClubPage } from './common/components/CreateClubPage'
import { GamePage } from './common/components/GamePage'
import { HomePage } from './common/components/HomePage'
import { UserMenu } from './common/components/UserMenu'
import { usePath } from './common/lib/router'
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
  const { session, loading } = useSession()
  const path = usePath()

  if (loading) return <div className="card">Loading…</div>
  if (!session) return <LoginScreen />

  // Resolve the current route to a page component. UserMenu is
  // mounted as a sibling below — appears on every authenticated
  // screen with no per-page wiring (see docs/ui.md → "UserMenu").
  let page
  if (path === '/c/new') {
    page = <CreateClubPage session={session} />
  } else {
    const clubMatch = path.match(/^\/c\/([^/]+)\/?$/)
    if (clubMatch) {
      page = <ClubPage handle={clubMatch[1]} />
    } else {
      // Game routes — GamePage shell + the manifest's PlayArea
      // as a render-prop child. Path shape: /g/<gametype>/<gameId>.
      // Anything else under /g/ falls through to HomePage (rather
      // than rendering a broken game screen), matching the
      // "be forgiving with URLs" stance.
      const gameMatch = path.match(/^\/g\/([a-z0-9]+)\/([0-9a-f-]+)\/?$/i)
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
      <UserMenu session={session} />
    </>
  )
}
