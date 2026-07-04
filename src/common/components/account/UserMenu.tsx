import type { Session } from '@supabase/supabase-js'
import { useProfile } from '../../hooks/session/useProfile'
import { colorVarFor } from '../../lib/color/memberColor'
import { supabase } from '../../lib/supabase/supabase'
import type { MenuSection } from '../../lib/games'
import { Menu } from '../panels/Menu'
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
 * in the empty 2rem padding zone above any page header. Shows
 * the current user's username with a small chevron; clicking
 * opens a dropdown of **user-focused** actions:
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
          <span className={styles.triggerContent}>
            {/* Profile-color dot, same visual vocabulary as the
                PlayersStrip / ClubPage member-list dots. Reassures
                the user "this is my color across the app." */}
            <span
              className={styles.dot}
              style={{ background: colorVarFor(profile?.color) }}
              aria-hidden
            />
            <span className={styles.name}>{profile?.username ?? '…'}</span>
            <ChevronDown />
          </span>
        }
        sections={sections}
        triggerLabel="User menu"
        triggerClassName={styles.trigger}
        popoverAlign="right"
      />
    </div>
  )
}

/** Tiny down-chevron next to the username. Inline SVG so it
 *  inherits `currentColor`; size kept small to match the
 *  tight-padding aesthetic Joel asked for. */
function ChevronDown() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}
