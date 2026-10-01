// cs-blessed-club-page

import type { Session } from '@supabase/supabase-js'
import { environmentalEnvelope, OUR_BUG_TO_CODE_AND_TEXT } from '../supabase/dbEnvelope'
import { Loading } from '../loading/Loading'
import { EnvelopeErrorPage } from '../error-page/ErrorPage'
import { ClubPage } from './ClubPage'
import { useClubPageData } from './useClubPageData'

type Props = {
  // The handle from `/c/<handle>` — raw URL text until the RPC says a club
  // answers to it.
  handle: string
  authSession: Session
}

/**
 * The club page's load, and the pages it can end in: `<Loading>`, an error
 * page, or `<ClubPage>` itself.
 *
 * **It exists so `<ClubPage>` never holds a club that might not be there.**
 * Everything the page draws needs the club, the roster and the enrolled
 * gametypes; splitting the wait out means those arrive as ordinary props
 * rather than as nullable state the whole file has to keep narrowing. The read
 * is `useClubPageData`; every not-ok it answers becomes the error page here.
 *
 * Takes the URL's handle and the session; renders nothing of its own.
 */
export function ClubPageLoader({ handle, authSession }: Props) {
  const { clubPageData, loading, failure } = useClubPageData(handle)

  if (loading) return <Loading />

  // The server wrote the sentence — including "no club with that name" and
  // "not a member", which it can tell apart and a direct read could not.
  if (failure) return <EnvelopeErrorPage envelope={failure} />

  // An answer `useClubPageData` couldn't read; it has already screamed.
  if (!clubPageData) {
    return (
      <EnvelopeErrorPage
        envelope={environmentalEnvelope(
          OUR_BUG_TO_CODE_AND_TEXT.unhandledAnswer,
          'get_club_page: neither a club nor a failure',
        )}
      />
    )
  }

  return (
    <ClubPage
      club={clubPageData.club}
      members={clubPageData.members}
      // Seeds `ClubPage`'s own state rather than staying a prop: the club
      // editor changes the enrolled set while the page is up, and nothing
      // reloads it.
      initialGametypes={clubPageData.gametypes}
      authSession={authSession}
    />
  )
}
