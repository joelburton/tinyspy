// cs-unmet

import { useEffect, useState } from 'react'
import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import { reportUnhandled } from '../supabase/dbEnvelope'
import type { NotOkEnvelope } from '../supabase/envelope'
import type { ClubPageData } from './ClubPage'

/**
 * Reads everything the club page draws — the club, its members and its
 * gametypes — in one call, `common.get_club_page` (docs/common-schema.md →
 * RPCs says why it is one).
 *
 * Once the read has answered, exactly one of `clubPageData` and `failure` is
 * set, except for an answer this hook can't read, which it reports and leaves
 * both null.
 *
 * `presentFaults: false`: the caller turns every not-ok into the page itself,
 * so a modal on top would say the same sentence twice (error-page/doc.md). That
 * covers the RPC's own refusals — no such club, and a club that isn't yours —
 * and a transport failure alike.
 */
export function useClubPageData(handle: string): {
  clubPageData: ClubPageData | null
  // True until the read answers, however it answers.
  loading: boolean
  failure: NotOkEnvelope | null
} {
  const [clubPageData, setClubPageData] = useState<ClubPageData | null>(null)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(function loadClubPage() {
    let mounted = true

    async function load() {
      const res = await runRpc<ClubPageData>(
        commonDb.rpc('get_club_page', { target_handle: handle }),
        { presentFaults: false },
      )
      if (!mounted) return

      if (res.type === 'not-ok') {
        setFailure(res)
      } else if (res.type === 'ok' && res.data.result === 'loaded') {
        setClubPageData(res.data)
      } else {
        reportUnhandled('get_club_page', res)
      }
      setLoading(false)
    }

    load()
    return () => {
      mounted = false
    }
  }, [handle])

  return { clubPageData, loading, failure }
}
