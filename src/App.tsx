import { Suspense } from 'react'
import { useSession } from './common/hooks/useSession'
import { LoginScreen } from './common/components/LoginScreen'
import { games } from './games'

/**
 * Top-level shell. Handles the three things every game shares:
 *
 *   1. Auth — wait for session, fall back to LoginScreen if not signed in.
 *   2. Selecting which game is mounted (today: always games[0]; later: a
 *      picker when games.length > 1).
 *   3. Delegating everything else to that game's Root component.
 *
 * The shell deliberately does NOT name any specific game — it iterates
 * `games` from src/games.ts. Removing a game is three actions
 * (delete folder, delete its line in games.ts, drop its DB schema)
 * and the shell is untouched. See docs/naming.md.
 *
 * Each game's `Root` is loaded as a lazy chunk (see the game's
 * manifest), so the main bundle ships only the shell + common +
 * manifests. The `<Suspense>` boundary below handles the brief moment
 * between "user navigates into this game" and "the game's JS chunk
 * has finished downloading." After the first navigation in a session,
 * the chunk is browser-cached and subsequent renders are instant.
 */
export default function App() {
  const { session, loading } = useSession()

  if (loading) return <div className="card">Loading…</div>
  if (!session) return <LoginScreen />

  // For now there's only one game registered, so we always mount it.
  // When games.length > 1, this is where the chooser/picker goes
  // (or routes to `/<gametype>/...`, or persists last-played, etc.).
  const game = games[0]
  return (
    <Suspense fallback={<div className="card">Loading game…</div>}>
      <game.Root session={session} />
    </Suspense>
  )
}
