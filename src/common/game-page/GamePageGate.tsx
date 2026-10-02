// cs-blessed-game-page

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Loading } from '../loading/Loading'
import { EnvelopeErrorPage, ErrorPage } from '../error-page/ErrorPage'
import { diagnosticsLine } from '../supabase/dbLog'
import { manifestFor } from '@/gametypes'
import { db as commonDb } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import type { Envelope, NotOkEnvelope } from '../supabase/envelope'
import { navigate } from '../routing/router'
import { clubPath } from '../routing/routes'
import { showToast } from '../toasts/toastStore'
import { GamePageLoader } from './GamePageLoader'
import { NoSuchGamePage } from './NoSuchGamePage'
import { reloadIfStaleBuild } from '../boot/reloadOnStaleBuild'
import { noShellEnvelope, type Shell } from './shell'

type Props = {
  // The gametype EXACTLY as the URL spelled it. Matched case-insensitively but
  // looked up in lowercase, since the registry is keyed on the lowercase
  // codename — without normalizing, `/g/Wordle/<id>` matches the route, misses
  // the registry, and is reported as a fault, which it isn't. The raw spelling
  // survives because the not-found page echoes what the URL actually said.
  urlGametype: string
  gameId: string
  auth: Session
}

/** Could this string BE a game id? Not "does the game exist" — that is a
 *  question for the server, and one worth asking only about ids that could
 *  have an answer. Postgres rejects anything else as `22P02`, once per query,
 *  and every one of those becomes its own fault modal. */
const isGameId = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/**
 * **Can this URL name a game, and is the signed-in user in it? — asked once,
 * before anything else runs.** The first of the game route's three components:
 * this gate, then `GamePageLoader`, then `GamePage`. Renders nothing of its
 * own beyond the waiting, error and not-found pages.
 *
 * Every way a game URL can come to nothing is answered here, which is why the
 * route hands over the gametype as the URL spelled it rather than a manifest:
 * an unknown gametype, an id that cannot be one, an id that names no row, a
 * game the user has no seat in, and a read that failed are five different
 * answers and they belong together.
 *
 * One cheap read and NOTHING below mounts until it says yes. **That gate is
 * the reason the route is three components and not two**: `useCommonGame`
 * cannot be called conditionally, and calling it does far more than fetch —
 * it joins the realtime channel, tracks presence and asserts
 * `set_current_view`. Those must not run for a game that may not be there, or
 * for a member who may not open it, so the only place they can live is a
 * child this component has not mounted yet.
 *
 * **There is no spectating.** A club member without a seat in the game is
 * sent back to the club page, with a toast saying why — you must be seated to
 * open a game (CLAUDE.md → Audience). The read policies stay club-gated; this
 * gate is the whole of the rule.
 *
 * **Why the id test appears twice.** In `useCanOpenGame` it prevents the
 * request: an id that cannot be a uuid is a `22P02` per query and a fault
 * modal per `22P02`, and the answer is knowable without asking. In the render
 * it picks the page. Two different jobs — *don't ask*, and *say why*.
 */
export function GamePageGate({ urlGametype, gameId, auth }: Props) {
  const manifest = manifestFor(urlGametype.toLowerCase())
  const answer = useCanOpenGame(gameId, auth.user.id)

  // Entering a game fetches its chunk anyway, so the stale-build check rides
  // along; a tab open across a deploy reloads here rather than playing on old
  // code — see `reloadOnStaleBuild`.
  useEffect(function checkBuildOnEntry() {
    void reloadIfStaleBuild('game-page')
  }, [gameId])

  // `replace`, so Back does not land on the page that just turned them away.
  // The toast's id is stable: opening a second such link replaces it rather
  // than stacking another.
  useEffect(function sendAnUnseatedMemberBack() {
    if (answer.kind !== 'not-seated') return
    showToast({ id: 'not-in-game', message: "You're not in this game", tone: 'error' })
    navigate(clubPath(answer.clubHandle), true)
  }, [answer])

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

  if (!isGameId(gameId)) return (
    <NoSuchGamePage detail={`not a game id: ${gameId}`}/>)

  // Not seated shows the same waiting page: the effect above is already
  // navigating away, and nothing of the game may be drawn meanwhile.
  if (answer.kind === 'checking' || answer.kind === 'not-seated') return <Loading/>

  if (answer.kind === 'no-such-game')
    return (
      <NoSuchGamePage
        detail={`rows=0 gametype=${manifest.gametype} game=${gameId}`}/>)

  if (answer.kind === 'failed') return <EnvelopeErrorPage envelope={answer.failure}/>

  return (
    <GamePageLoader
      gameId={gameId}
      auth={auth}
      manifest={manifest}/>)
}

/** What the gate's reads found about this id, for this user. */
type CanOpenAnswer =
  // No answer yet for THIS id, or an id that could never be one.
  | { kind: 'checking' }
  // The game is there and the user has a seat in it.
  | { kind: 'seated' }
  // The game is there and the user has no seat in it; the club to send them to.
  | { kind: 'not-seated'; clubHandle: string }
  // Zero rows. Only a read that WORKED can say this.
  | { kind: 'no-such-game' }
  // A read failed — not the same as the game being gone. The envelope names
  // which read died.
  | { kind: 'failed'; failure: NotOkEnvelope }

const CHECKING: CanOpenAnswer = { kind: 'checking' }

/**
 * May the signed-in user open the game with this id? `'seated'` when the game
 * exists and they are one of its players; `'not-seated'` when it exists and
 * they are not; `'no-such-game'`, the failure of a read that failed, or
 * `'checking'` until the server has answered for THIS id. An id that cannot be
 * a game id is never asked about, so it stays `'checking'`; the gate turns it
 * away before reading this.
 *
 * The answer is stored WITH the id it answers for, and the result DERIVED from
 * the pair, so an id with no answer yet is `'checking'` by construction rather
 * than by an effect that remembers to clear.
 *
 * It has to notice a different id, because nothing below the gate does.
 * Navigating game → game happens inside this route (the invitation toast's
 * `join` changes only the params), `GamePage` keys the play surface on
 * `restart_count` — right for a restart, silent about a different game — and a
 * game's own `useGame` refetches on `gameId` while keeping the header and rows
 * it already holds. Saying `'checking'` is what unmounts the subtree, so every
 * game's hooks start the new game clean; without it the player reads the
 * previous game's board under the new game's URL.
 *
 * The `'checking'` state and the `mounted` flag are React's tax and nothing
 * more: a render is synchronous so it cannot await, and a render that gets
 * discarded must not write state.
 */
function useCanOpenGame(gameId: string, myId: string): CanOpenAnswer {
  const [answer, setAnswer] = useState<{
    id: string
    canOpen: CanOpenAnswer
  } | null>(null)

  useEffect(function askWhetherICanOpenTheGame() {
    if (!isGameId(gameId)) return
    let mounted = true

    async function readAndAnswer() {
      // The seat is read off shell_data's roster, which the game's builder
      // writes (supabase/sql/common.sql → The page blobs' common parts).
      const gameRes = await readRows(
        commonDb.from('games').select('id, club_handle, shell_data').eq('id', gameId),
      )
      if (!mounted) return
      setAnswer({ id: gameId, canOpen: answerFrom(gameId, myId, gameRes) })
    }

    void readAndAnswer()
    return function ignoreALateAnswer() {
      mounted = false
    }
  }, [gameId, myId])

  return answer?.id === gameId ? answer.canOpen : CHECKING
}

/** The answer the read adds up to. Five-way on purpose: collapsing a FAILED
 *  read into "no such game" would tell a player their game is gone because the
 *  network blinked — the confident wrong answer this whole area exists to stop.
 *  A game with no shell_data yet is a failure too, named as such, rather than
 *  a seat nobody holds. */
function answerFrom(
  gameId: string,
  myId: string,
  gameRes: Envelope<{ id: string; club_handle: string; shell_data: unknown }[]>,
): CanOpenAnswer {
  if (gameRes.type === 'not-ok') return { kind: 'failed', failure: gameRes }
  const game = gameRes.data[0]
  if (!game) return { kind: 'no-such-game' }
  if (game.shell_data === null) return { kind: 'failed', failure: noShellEnvelope(gameId) }
  const seated = (game.shell_data as Shell).players.some((p) => p.id === myId)
  if (!seated) return { kind: 'not-seated', clubHandle: game.club_handle }
  return { kind: 'seated' }
}
