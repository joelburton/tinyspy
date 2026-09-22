// cs-blessed-game-page

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Loading } from '../loading/Loading'
import { EnvelopeErrorPage, ErrorPage } from '../error-page/ErrorPage'
import type { GameManifest } from '../manifest/gameManifest'
import { diagnosticsLine } from '../supabase/dbLog'
import { manifestFor } from '@/gametypes'
import { db as commonDb } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import type { NotOkEnvelope } from '../supabase/envelope'
import { GamePageLoader } from './GamePageLoader'
import { NoSuchGamePage } from './NoSuchGamePage'
import { reloadIfStaleBuild } from '../boot/reloadOnStaleBuild'

/**
 * What the gate hands down once the URL has survived it: the loader takes
 * these, and passes them to the page alongside the state it loaded. Nothing
 * else is supplied from outside — the play surface and its wrappers are
 * assembled by `GamePage` off the manifest.
 */
export type GameShellProps = {
  // The game's id. Drives every common-side data read (common.games,
  // common.game_players) and the channel name.
  gameId: string
  // Authenticated session, threaded into useCommonGame for presence tracking
  // and re-exposed via ctx to PlayArea.
  session: Session
  // The game's manifest, resolved by the gate — so below here it is a
  // manifest, not a lookup that might miss. Every per-game thing the shell
  // draws or dispatches comes off it.
  manifest: GameManifest
}

type Props = {
  // The gametype EXACTLY as the URL spelled it. Matched case-insensitively but
  // looked up in lowercase, since the registry is keyed on the lowercase
  // codename — without normalizing, `/g/Wordle/<id>` matches the route, misses
  // the registry, and is reported as a fault, which it isn't. The raw spelling
  // survives because the not-found page echoes what the URL actually said.
  urlGametype: string
  gameId: string
  session: Session
}

/** Could this string BE a game id? Not "does the game exist" — that is a
 *  question for the server, and one worth asking only about ids that could
 *  have an answer. Postgres rejects anything else as `22P02`, once per query,
 *  and every one of those becomes its own fault modal. */
const isGameId = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/**
 * **Can this URL name a game at all? — asked once, before anything else runs.**
 * The first of the game route's three components: this gate, then
 * `GamePageLoader`, then `GamePage`. Renders nothing of its own beyond the
 * waiting, error and not-found pages.
 *
 * Every way a game URL can come to nothing is answered here, which is why the
 * route hands over the gametype as the URL spelled it rather than a manifest:
 * an unknown gametype, an id that cannot be one, an id that names no row, and
 * a read that failed are four different answers and they belong together.
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
export function GamePageGate({ urlGametype, gameId, session }: Props) {
  const manifest = manifestFor(urlGametype.toLowerCase())
  // The existence answer, stored WITH the id it answers for — and `exists`
  // DERIVED from the pair, so an id we have no answer for is 'checking' by
  // construction rather than by an effect that remembers to clear.
  //
  // It has to notice a different id, because nothing below does. Navigating
  // game → game happens inside this route (the invitation toast's `join`
  // changes only the params), `GamePage` keys the play surface on `restarts` —
  // right for a restart, silent about a different game — and a game's own
  // `useGame` refetches on `gameId` while keeping the header and rows it
  // already holds. Saying 'checking' is what unmounts the subtree, so every
  // game's hooks start the new game clean; without it the player reads the
  // previous game's board under the new game's URL.
  const [answer, setAnswer] = useState<{
    id: string
    exists: 'yes' | 'no' | NotOkEnvelope
  } | null>(null)
  const exists = answer?.id === gameId ? answer.exists : 'checking'

  // Entering a game fetches its chunk anyway, so the stale-build check rides
  // along; a tab open across a deploy reloads here rather than playing on old
  // code — see `reloadOnStaleBuild`.
  useEffect(function checkBuildOnEntry() {
    void reloadIfStaleBuild('game-page')
  }, [gameId])

  useEffect(function askWhetherTheGameExists() {
    if (!isGameId(gameId)) return
    let mounted = true
    async function readAndAnswer() {
      const res = await readRows(commonDb.from('games').select('id').eq('id', gameId))
      if (!mounted) return
      // Three-way on purpose. Collapsing a FAILED read into "no" would tell a
      // player their game is gone because the network blinked — the confident
      // wrong answer this whole area exists to stop.
      setAnswer({
        id: gameId,
        exists: res.type === 'not-ok' ? res : res.data.length > 0 ? 'yes' : 'no',
      })
    }
    void readAndAnswer()
    return function ignoreALateAnswer() {
      mounted = false
    }
  }, [gameId])

  // A gametype the registry has never heard of is a different thing from a
  // game that isn't there, and the two wear different screens on purpose: this
  // is a fault — the app cannot name the thing the link asks for — while the
  // calmer card below is a 404 for an id that is malformed or names no row.
  if (!manifest)
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
  if (!isGameId(gameId)) return <NoSuchGamePage detail={`not a game id: ${gameId}`} />
  if (exists === 'checking') return <Loading />
  if (exists === 'no') return <NoSuchGamePage detail={`rows=0 gametype=${manifest.gametype} game=${gameId}`} />
  if (exists !== 'yes') return <EnvelopeErrorPage envelope={exists} />
  return <GamePageLoader gameId={gameId} session={session} manifest={manifest} />
}
