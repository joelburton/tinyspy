import type { Session } from '@supabase/supabase-js'
import { useGameInvitations } from '../hooks/useGameInvitations'
import styles from './GameInvitations.module.css'

/**
 * The game-invitation popups — mounted once on every authenticated page
 * (App.tsx, sibling to UserMenu). When a friend adds you to a game you
 * get a card here: "Moth added you to a new spellingbee game" with a Join
 * button. Replaces the old auto-navigate-into-the-club's-game behavior:
 * you choose when to join (the game also waits for you — it's paused
 * until every invited player is present), or dismiss and join later from
 * the club page.
 *
 * Logic lives in `useGameInvitations`; this is just the presentation.
 */
export function GameInvitations({ session }: { session: Session }) {
  const { invites, dismiss, join } = useGameInvitations(session)
  if (invites.length === 0) return null

  return (
    <div className={styles.stack} role="region" aria-label="Game invitations">
      {invites.map((invite) => (
        <div key={invite.gameId} className={styles.card} role="alertdialog">
          <button
            type="button"
            className={styles.close}
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => dismiss(invite.gameId)}
          >
            ×
          </button>
          <p className={styles.message}>
            <strong>{invite.inviterName}</strong> added you to a new{' '}
            <strong>{invite.gameName}</strong> game.
          </p>
          <button
            type="button"
            className={styles.join}
            onClick={() => join(invite)}
          >
            Join
          </button>
        </div>
      ))}
    </div>
  )
}
