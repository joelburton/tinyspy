import { Suspense } from 'react'
import { useSession } from './common/hooks/useSession'
import { LoginScreen } from './common/components/LoginScreen'
import { ClubPage } from './common/components/ClubPage'
import { CreateClubPage } from './common/components/CreateClubPage'
import { usePath } from './common/lib/router'
import { games } from './games'

/**
 * Top-level shell. Handles the three things every game shares:
 *
 *   1. Auth — wait for session, fall back to LoginScreen if not signed in.
 *   2. Cross-game club routes (`/c/new`, `/c/<handle>`) — common UI
 *      for setting up and viewing clubs, independent of any game.
 *   3. Delegating everything else to the registered game's Root.
 *
 * The shell deliberately does NOT name any specific game — it iterates
 * `games` from src/games.ts. Removing a game is three actions
 * (delete folder, delete its line in games.ts, drop its DB schema)
 * and the shell is untouched. See docs/naming.md.
 *
 * Each game's `Root` is loaded as a lazy chunk (see the game's
 * manifest), so the main bundle ships only the shell + common +
 * manifests. The `<Suspense>` boundary handles the brief moment
 * between "user navigates into this game" and "the game's JS chunk
 * has finished downloading." After the first navigation in a session,
 * the chunk is browser-cached and subsequent renders are instant.
 *
 * URL shape — see src/common/lib/router.ts for the routing model.
 * Anything not matched as a club route falls through to the game's
 * Root, which does its own internal matching for `/g/<gameId>` etc.
 */
export default function App() {
  const { session, loading } = useSession()
  const path = usePath()

  if (loading) return <div className="card">Loading…</div>
  if (!session) return <LoginScreen />

  // Club routes — shell-level since they're cross-game / common.
  if (path === '/c/new') {
    return <CreateClubPage session={session} />
  }
  const clubMatch = path.match(/^\/c\/([^/]+)\/?$/)
  if (clubMatch) {
    return <ClubPage session={session} handle={clubMatch[1]} />
  }

  // Anything else → the registered game's Root. For now there's only
  // tinyspy, so we always mount games[0]; when games.length > 1, the
  // picker / chooser logic goes here.
  const game = games[0]
  return (
    <Suspense fallback={<div className="card">Loading game…</div>}>
      <game.Root session={session} />
    </Suspense>
  )
}
