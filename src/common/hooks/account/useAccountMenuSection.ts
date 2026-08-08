import { useMemo } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useProfile } from '../session/useProfile'
import { supabase } from '../../lib/supabase/supabase'
import { setEditProfileOpen } from '../../lib/account/editProfileStore'
import { setWordEdit } from '../../lib/definitions/wordEditStore'
import type { MenuSection } from '../../lib/games'

/**
 * The **account submenu** — the user-focused items, as one collapsed row to
 * drop at the bottom of any page's menu.
 *
 * These used to be a separate `<UserMenu>` pinned to the top-right of the
 * viewport on every authenticated screen. It was pulled in because that fixed
 * chip forced `GamePage.module.css`'s header to carry `margin-right: 2rem` of
 * permanently reserved width for it to overlap — dead space at every viewport,
 * and space the mobile game header badly needs for feedback. Folding the items
 * into the menu that's already there reclaims all of it and removes a control
 * rather than adding one.
 *
 * **The row is your profile dot + your username**, not "Account" — the chip it
 * replaced was that dot, and both halves of "who am I signed in as" survive the
 * move rather than only the name.
 *
 * It stays a SUBMENU rather than a flat section even though it's two items
 * today: it's the same row in the same place on every page, and account items
 * are a different mental model from "things you can do to this game" — the
 * separation `docs/ui.md` records for the old UserMenu, kept by nesting instead
 * of by a second menu.
 *
 * @param session The signed-in session (for the profile lookup).
 * @returns One `MenuSection` holding one submenu row. Spread it at the END of a
 *          page's `sections` array.
 */
export function useAccountMenuSection(session: Session): MenuSection {
  const profile = useProfile(session)
  const username = profile?.username
  const color = profile?.color

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
          // The dot the old fixed chip used to be — see MenuItemBase.dot.
          dot: color,
          items: [
            {
              id: 'profile',
              label: 'Profile',
              onClick: () => setEditProfileOpen(true),
            },
            // Dictionary curation — editors only (profiles.can_edit_words;
            // the RPC enforces the same gate server-side). Everyone else
            // never sees the item.
            ...(profile?.can_edit_words
              ? [{
                  id: 'add-word',
                  label: 'Add word',
                  onClick: () => setWordEdit({ mode: 'add' }),
                }]
              : []),
            {
              id: 'logout',
              label: 'Log out',
              onClick: () => {
                supabase.auth.signOut().then(({ error }) => {
                  if (error) console.error('sign out failed', error)
                })
              },
            },
          ],
        },
      ],
    }),
    [username, color, profile?.can_edit_words],
  )
}
