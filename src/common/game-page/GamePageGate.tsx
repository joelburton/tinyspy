// cs-unmet

import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { GamePageCtx } from './gamePageCtx'
import { Loading } from '../loading/Loading'
import { EnvelopeErrorPage } from '../error-page/ErrorPage'
import type { GameManifest } from '../manifest/gameManifest'
import { db as commonDb } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import type { NotOkEnvelope } from '../supabase/envelope'
import { GamePageLoader } from './GamePageLoader'
import { NoSuchGamePage } from './NoSuchGamePage'

/**
 * What the game route hands down, the whole way: the gate takes these, passes
 * them to the loader, and the loader passes them to the page alongside the
 * state it loaded.
 */
export type GameRouteProps = {
  // The game's id. Drives every common-side data read (common.games,
  // common.game_players) and the channel name.
  gameId: string
  // Authenticated session, threaded into useCommonGame for presence tracking
  // and re-exposed via ctx to PlayArea.
  session: Session
  // The game's manifest, not the gametype string: the router has already
  // looked it up to decide whether the URL names a real game at all, so a
  // second lookup here could only fail in a way the first one ruled out. Every
  // per-game thing the shell draws or dispatches comes off it.
  manifest: GameManifest
  // Render-prop child. Receives `GamePageCtx` and returns the per-gametype play
  // surface JSX. Called only when the game is loaded AND not paused —
  // PauseBoundary conditional-renders the overlay otherwise (children unmount
  // cleanly).
  children: (ctx: GamePageCtx) => ReactNode
}

/** Could this string BE a game id? Not "does the game exist" — that is a
 *  question for the server, and one worth asking only about ids that could
 *  have an answer. Postgres rejects anything else as `22P02`, once per query,
 *  and every one of those becomes its own fault modal. */
const isGameId = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/**
 * **Does this game exist? — asked once, before anything else runs.** The first
 * of the game route's three components: this gate, then `GamePageLoader`, then
 * `GamePage`. Renders nothing of its own beyond the waiting and not-found
 * pages.
 *
 * One cheap `select id` and three answers, and NOTHING below mounts until it
 * says yes. **That gate is the reason the route is three components and not
 * two**: `useCommonGame` cannot be called conditionally, and calling it does
 * far more than fetch — it joins the realtime channel, tracks presence and
 * asserts `set_current_view`. Those must not run for a game that may not be
 * there, so the only place they can live is a child this component has not
 * mounted yet.
 *
 * **Why the id test appears twice.** In the effect it prevents the request: an
 * id that cannot be a uuid is a `22P02` per query and a fault modal per
 * `22P02`, and the answer is knowable without asking. In the render it picks
 * the page. Two different jobs — *don't ask*, and *say why*.
 *
 * The `'checking'` state and the `mounted` flag are React's tax and nothing
 * more: a render is synchronous so it cannot await, and a render that gets
 * discarded must not write state.
 */
export function GamePageGate(props: GameRouteProps) {
  const { gameId, manifest } = props
  const [exists, setExists] = useState<'checking' | 'yes' | 'no' | NotOkEnvelope>('checking')

  useEffect(function askWhetherTheGameExists() {
    if (!isGameId(gameId)) return
    let mounted = true
    async function readAndAnswer() {
      const res = await readRows(commonDb.from('games').select('id').eq('id', gameId))
      if (!mounted) return
      // Three-way on purpose. Collapsing a FAILED read into "no" would tell a
      // player their game is gone because the network blinked — the confident
      // wrong answer this whole area exists to stop.
      setExists(res.type === 'not-ok' ? res : res.data.length > 0 ? 'yes' : 'no')
    }
    void readAndAnswer()
    return function ignoreALateAnswer() {
      mounted = false
    }
  }, [gameId])

  if (!isGameId(gameId)) return <NoSuchGamePage detail={`not a game id: ${gameId}`} />
  if (exists === 'checking') return <Loading />
  if (exists === 'no') return <NoSuchGamePage detail={`rows=0 gametype=${manifest.gametype} game=${gameId}`} />
  if (exists !== 'yes') return <EnvelopeErrorPage envelope={exists} />
  return <GamePageLoader {...props} />
}
