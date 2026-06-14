import { Suspense } from 'react'
import { useSession } from './common/hooks/useSession'
import { LoginScreen } from './common/components/LoginScreen'
import { ClubPage } from './common/components/ClubPage'
import { CreateClubPage } from './common/components/CreateClubPage'
import { HomePage } from './common/components/HomePage'
import { usePath } from './common/lib/router'
import { games } from './games'

/**
 * Top-level shell. Owns the URL → component routing for all paths
 * the app understands:
 *
 *   /                          →  HomePage (your clubs + create-club link)
 *   /c/new                     →  CreateClubPage
 *   /c/<handle>                →  ClubPage
 *   /g/<gametype>/<gameId>     →  the manifest matching <gametype>,
 *                                  mounted as <manifest.Root> with
 *                                  the gameId as a prop. Lazy-loaded.
 *   <anything else>            →  HomePage  (treated as "go home"
 *                                  rather than a 404 screen)
 *
 * Why the gametype is in the URL: with more than one registered
 * game, `/g/<id>` alone wouldn't tell us which schema to look the
 * id up in. Embedding the gametype keeps the route purely
 * structural — no cross-schema id resolution, no soft-FK lookup.
 *
 * Each Root receives `gameId` as a prop and is keyed by it. The
 * key forces a remount when navigating between games, so each
 * Root starts with a clean state slate (no stale realtime
 * subscriptions or cached fetches leaking across games).
 *
 * Removing a game is still three actions (delete folder, delete
 * its line in games.ts, drop its DB schema). The shell is
 * untouched. See docs/common.md for the removability invariant.
 *
 * The Suspense fallback handles the brief moment between
 * "navigated to /g/<gametype>/<id>" and "the game's JS chunk
 * arrived." Subsequent in-session navigations to that game are
 * cached.
 */
export default function App() {
  const { session, loading } = useSession()
  const path = usePath()

  if (loading) return <div className="card">Loading…</div>
  if (!session) return <LoginScreen />

  // Club routes — common UI, no game involvement.
  if (path === '/c/new') {
    return <CreateClubPage session={session} />
  }
  const clubMatch = path.match(/^\/c\/([^/]+)\/?$/)
  if (clubMatch) {
    return <ClubPage session={session} handle={clubMatch[1]} />
  }

  // Game routes — delegated to the registered manifest's Root.
  // Path shape: /g/<gametype>/<gameId>. Anything else under /g/
  // falls through to HomePage (rather than rendering a broken
  // game screen), matching the "be forgiving with URLs" stance.
  const gameMatch = path.match(/^\/g\/([a-z0-9]+)\/([0-9a-f-]+)\/?$/i)
  if (gameMatch) {
    const [, gametype, gameId] = gameMatch
    const game = games.find((g) => g.gametype === gametype)
    if (!game) {
      return (
        <div className="card">
          <h1>Unknown game type</h1>
          <p className="error">
            No registered game called <code>{gametype}</code>.
          </p>
        </div>
      )
    }
    return (
      <Suspense fallback={<div className="card">Loading game…</div>}>
        <game.Root key={gameId} session={session} gameId={gameId} />
      </Suspense>
    )
  }

  // Fallback (including the bare `/`): land on home. Better UX
  // than a 404 for a typo'd URL; if it matters we add a real
  // not-found screen later.
  return <HomePage session={session} />
}
