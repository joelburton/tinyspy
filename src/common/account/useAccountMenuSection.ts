// cs-unmet

import { useMemo } from 'react'
import { useProfile } from '../session/useProfile'
import { supabase } from '../supabase/supabase'
import { setEditProfileOpen } from './editProfileStore'
import { setWordEdit } from '../definitions/wordEditStore'
import { useBoundAction } from '../actions/useBoundAction'
import type { MenuSection } from '../menu/menuModel'

/**
 * The **account submenu** — the user-focused items, as one collapsed row to
 * drop at the bottom of any page's menu. It binds `act-edit-profile`,
 * `act-add-word` (editors only) and `act-log-out`.
 *
 * Inside the page's menu rather than a control of its own: a fixed chip would
 * cost the header permanently reserved width, which the mobile game header
 * needs for feedback.
 *
 * **The row is your profile dot + your username**, not "Account" — both halves
 * of "who am I signed in as", so the menu is somewhere you see your own color.
 *
 * It is a SUBMENU rather than a flat section: it's the same row in the same
 * place on every page, and account items are a different mental model from
 * "things you can do to this game" — a separation kept by nesting instead of
 * by a second menu.
 *
 * @returns One `MenuSection` holding one submenu row. Spread it at the END of a
 *          page's `sections` array.
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
        if (error) console.error('sign out failed', error)
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
          // Before the profile store has resolved, "Account" is the honest
          // placeholder — better than a flash of empty label.
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
