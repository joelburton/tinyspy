// cs-blessed-club-page

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import {
  environmentalEnvelope, OUR_BUG_TO_CODE_AND_TEXT, reportUnhandled,
} from '../supabase/dbEnvelope'
import type { NotOkEnvelope } from '../supabase/envelope'
import { Loading } from '../loading/Loading'
import { EnvelopeErrorPage } from '../error-page/ErrorPage'
import { ClubPage, type ClubPageData } from './ClubPage'

type Props = {
  // The handle from `/c/<handle>` — raw URL text until the RPC says a club
  // answers to it.
  handle: string
  session: Session
}

/**
 * The answer with neither a club nor a failure, which a load cannot produce
 * since it ends by setting one or the other. It exists because the render needs
 * an envelope for that arm, and a page saying "unknown error" with nothing
 * under it leaves nothing to diagnose. If it is ever on screen, the `else`
 * below has already screamed the answer it could not read.
 */
const LOADED_WITH_NEITHER = environmentalEnvelope(
  OUR_BUG_TO_CODE_AND_TEXT.unhandledAnswer,
  'get_club_page: neither a club nor a failure',
)

/**
 * The club page's load, and the three pages it can end in: `<Loading>`, an
 * error page, or `<ClubPage>` itself.
 *
 * **It exists so `<ClubPage>` never holds a club that might not be there.**
 * Everything the page draws needs the club, the roster and the enrolled
 * gametypes; splitting the wait out means those arrive as ordinary props
 * rather than as nullable state the whole file has to keep narrowing.
 *
 * `presentFaults: false` is the promise this component keeps: every not-ok
 * becomes the page, so a modal on top would say the same sentence twice
 * (error-page/doc.md — a modal when the page behind it survives, a page when
 * it does not). That covers the RPC's own refusals and a transport failure
 * alike.
 *
 * Takes the URL's handle and the session; renders nothing of its own.
 */
export function ClubPageLoader({ handle, session }: Props) {
  const [data, setData] = useState<ClubPageData | null>(null)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(function loadClubPage() {
    let mounted = true

    async function load() {
      // One call for the club, its roster and its enrolled gametypes; why it
      // is one call is docs/common.md → `get_club_page`.
      const res = await runRpc<ClubPageData>(
        commonDb.rpc('get_club_page', { target_handle: handle }),
        { presentFaults: false },
      )
      if (!mounted) return

      if (res.type === 'not-ok') {
        // Includes the two answers RLS could never tell apart from a direct
        // read: no such club, and a club that isn't yours.
        setFailure(res)
        setLoading(false)
        return
      } else if (res.type === 'ok' && res.data.result === 'loaded') {
        setData(res.data)
        setLoading(false)
        return
      } else {
        reportUnhandled('get_club_page', res)
        setLoading(false)
        return
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [handle])

  if (loading) return <Loading />
  // Both halves come off the envelope: the server wrote the sentence —
  // including "no club with that name" and "not a member", which it can tell
  // apart and a direct read could not — and the diagnostics line is derived
  // from the same answer.
  //
  // `!data` with no failure is the `else` above and nothing else: an answer
  // neither ok nor not-ok, which has already screamed.
  if (failure || !data) {
    return <EnvelopeErrorPage envelope={failure ?? LOADED_WITH_NEITHER} />
  }

  return (
    <ClubPage
      club={data.club}
      members={data.members}
      // Seeds `ClubPage`'s own state rather than staying a prop: the club
      // editor changes the enrolled set while the page is up, and nothing
      // reloads it.
      initialGametypes={data.gametypes}
      session={session}
    />
  )
}
