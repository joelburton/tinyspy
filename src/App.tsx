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
 *   /                  →  HomePage (your clubs + create-club link)
 *   /c/new             →  CreateClubPage
 *   /c/<handle>        →  ClubPage
 *   /g/<gameId>        →  games[0].Root  (lazy-loaded; the game's
 *                          Root does its own /g/<id> matching to
 *                          render the right board)
 *   <anything else>    →  HomePage  (treated as "go home" rather
 *                          than a 404 screen)
 *
 * The shell deliberately does NOT name any specific game in its
 * route table — `/g/<id>` falls through to the first registered
 * game. Today that's tinyspy; when there are multiple games, the
 * URL space will need to disambiguate (e.g. `/tinyspy/g/<id>` vs
 * `/boggle/b/<id>`) and the picker for "which game?" before
 * entering a game will live in HomePage / ClubPage.
 *
 * Removing a game is still three actions (delete folder, delete
 * its line in games.ts, drop its DB schema). The shell is
 * untouched. See docs/naming.md.
 *
 * The Suspense fallback handles the brief moment between
 * "navigated to /g/<id>" and "the game's JS chunk arrived."
 * Subsequent in-session navigations to that game are cached.
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

  // Game routes — delegated to the registered game's Root.
  if (path.startsWith('/g/')) {
    const game = games[0]
    return (
      <Suspense fallback={<div className="card">Loading game…</div>}>
        <game.Root session={session} />
      </Suspense>
    )
  }

  // Fallback (including the bare `/`): land on home. Better UX
  // than a 404 for a typo'd URL; if it matters we add a real
  // not-found screen later.
  return <HomePage session={session} />
}
