import type { Session } from '@supabase/supabase-js'
import { useProfile } from '../../hooks/session/useProfile'
import { supabase } from '../../lib/supabase/supabase'
import type { MenuSection } from '../../lib/games'
import { Menu } from '../panels/Menu'
import { TriggerWithChevron } from '../panels/TriggerWithChevron'
import { Dot } from '../text/Dot'
import styles from './UserMenu.module.css'

type Props = {
  session: Session
  /** Open the Edit-profile dialog (mounted at the App level next to
   *  this menu, so the popup coexists with chat / notifications). */
  onEditProfile: () => void
}

/**
 * The global user menu — mounted once at the App level (after
 * the auth check), so every authenticated page picks it up
 * with zero per-page wiring.
 *
 * Sits at the top-right of the viewport with `position: fixed`,
 * overlapping the right end of the page header row (the GamePage
 * header reserves room for it — see GamePage.module.css `.right`).
 * Shows just the user's profile-color dot with a small chevron;
 * clicking opens a dropdown of **user-focused** actions:
 *
 *   - **Profile** — opens the Edit-profile dialog (player color today;
 *     username and more later) via the `onEditProfile` callback.
 *   - **Log out** — calls `supabase.auth.signOut()`; useSession
 *     detects the change, App re-renders, the user lands on
 *     `<LoginScreen>`.
 *
 * Strict scope: this menu NEVER carries club- or game-specific
 * items. Those belong on ClubPage / GamePage menus off the logo.
 * Keeping the user menu user-focused keeps the two mental models
 * separate. See docs/ui.md → "UserMenu" for the spec.
 *
 * Uses the shared `<Menu>` component (same chrome as the
 * logo-anchored menus); passes `popoverAlign="right"` so the
 * dropdown opens leftward into the page rather than overflowing
 * off-screen.
 */
export function UserMenu({ session, onEditProfile }: Props) {
  const profile = useProfile(session)

  const sections: MenuSection[] = [
    {
      items: [
        {
          id: 'profile',
          label: 'Profile',
          onClick: onEditProfile,
        },
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
  ]

  return (
    <div className={styles.anchor}>
      <Menu
        trigger={
          <TriggerWithChevron>
            {/* Profile-color dot, same visual vocabulary as the
                PlayersStrip / ClubPage member-list dots — the dot IS the
                whole identity display (no username text; the chip stays
                tiny so it doesn't crowd the header row it overlaps). */}
            <Dot color={profile?.color} className={styles.dot} />
          </TriggerWithChevron>
        }
        sections={sections}
        triggerLabel="User menu"
        triggerClassName={styles.trigger}
        popoverAlign="right"
      />
    </div>
  )
}
