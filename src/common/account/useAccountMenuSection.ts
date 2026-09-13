// cs-blessed-account

import { useMemo } from 'react'
import type { AuthError } from '@supabase/supabase-js'
import { useProfile } from '../session/useProfile'
import { supabase } from '../supabase/supabase'
import { getTextualOnlineStatus } from '../supabase/dbFetch'
import {
  AUTH_FAILURE_TO_CODE_AND_TEXT,
  environmentalEnvelope,
  reportDbFault,
} from '../supabase/dbEnvelope'
import { setEditProfileOpen } from './editProfileStore'
import { setWordEdit } from '../definitions/wordEditStore'
import { useBoundAction } from '../actions/useBoundAction'
import type { MenuSection } from '../menu/menuModel'

/**
 * **Report a sign-out that did not happen**, as a fault.
 *
 * `GoTrueClient._signOut` returns before it clears the local session, so a
 * failed revoke leaves you signed in with no `SIGNED_OUT` event coming — the
 * screen does not change on its own, and nothing else would say so.
 *
 * It builds the envelope and the transport facts itself because an auth call
 * reaches no wrapper: `/auth/v1/` is outside that system (docs/envelopes.md →
 * the `FE` codes), so the call site is the transport layer too.
 */
function reportFailedSignOut(error: AuthError): void {
  reportDbFault(
    { call: 'POST /auth/v1/logout', status: error.status, detail: getTextualOnlineStatus() },
    environmentalEnvelope(AUTH_FAILURE_TO_CODE_AND_TEXT.signOut, `${error.name}: ${error.message}`),
  )
}

/**
 * The **account submenu** — your profile dot and username as one collapsed row,
 * opening `act-edit-profile`, `act-add-word` (editors only) and `act-log-out`.
 *
 * Hands back one `MenuSection` holding that row. Spread it at the END of a
 * page's `sections`, which is where every page puts it. Why it is a submenu
 * inside the page's menu, and why the row is your name, are doc.md's Intro to area.
 */
export function useAccountMenuSection(): MenuSection {
  const profile = useProfile()
  const username = profile?.username
  const color = profile?.color
  // Dictionary curation is editors-only (`profiles.can_edit_words`; the RPC
  // enforces the same gate server-side). Everyone else never sees the row —
  // which is `hidden`, so the row simply is not there rather than being there
  // and refusing.
  const canEditWords = profile?.can_edit_words === true

  const actEditProfile = useBoundAction('act-edit-profile', {
    describe: () => 'active',
    run: () => setEditProfileOpen(true),
  })
  const actAddWord = useBoundAction('act-add-word', {
    describe: () => (canEditWords ? 'active' : 'hidden'),
    run: () => setWordEdit({ mode: 'add' }),
  })
  const actLogOut = useBoundAction('act-log-out', {
    describe: () => 'active',
    run: () => {
      supabase.auth.signOut().then(({ error }) => {
        if (error) reportFailedSignOut(error)
      })
    },
  })

  return useMemo<MenuSection>(
    () => ({
      items: [
        {
          // A stable id even though the label is the (loadable) username, so
          // React keying doesn't churn when the profile lands.
          id: 'account',
          // The gates make a missing profile unreachable here: `useSession`
          // seeds the store before `loading` clears, and a page with a menu
          // renders only past that. So the `??` — and the undefined `dot`
          // below — belong to `Profile | null`, which is the signed-out state
          // its readers on the login screen see, rather than to a moment.
          label: username ?? 'Account',
          // Your color, as the identity disc — see `MenuSubmenu.dot`. It is
          // why this row is a submenu and not an action: what it shows is WHO
          // you are, and an action says what you can do.
          dot: color,
          items: [actEditProfile, actAddWord, actLogOut],
        },
      ],
    }),
    [username, color, actEditProfile, actAddWord, actLogOut],
  )
}
