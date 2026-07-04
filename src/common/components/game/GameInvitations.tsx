import { useEffect, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useGameInvitations } from '../../hooks/game/useGameInvitations'
import { showToast, dismissToast } from '../../lib/toast/toastStore'

/**
 * The game-invitation announcements — mounted once on every authenticated page
 * (App.tsx). When a friend adds you to a game you get a toast: "Moth added you
 * to a new spellingbee game" with a Join button. Replaces the old
 * auto-navigate-into-the-club's-game behavior: you choose when to join (the
 * game also waits for you — it's paused until every invited player is present),
 * or dismiss and join later from the club page.
 *
 * This is now HEADLESS (renders nothing): the reactive invite list from
 * `useGameInvitations` (realtime + dedup, unchanged) is mirrored into the shared
 * toast store, so invitations render in the same bottom-right stack as any other
 * announcement — and, since toasts sit above chat, they're no longer hidden
 * behind an open chat panel. One toast per invite, keyed by game id:
 *   - **Join** → `join` (navigates; the invite then drops from the list, which
 *     removes the toast here — see the reconcile below).
 *   - **X** → `dismiss` (hide now; recoverable from the club page later).
 */
export function GameInvitations({ session }: { session: Session }) {
  const { invites, dismiss, join } = useGameInvitations(session)

  // Mirror the invite list → the toast store. `showToast` with a stable id is
  // an idempotent upsert, so re-running just refreshes each card; we track the
  // ids we've shown and dismiss any whose invite has since disappeared (joined,
  // or auto-hidden because you're now viewing that game).
  const shownIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    const next = new Set<string>()
    for (const inv of invites) {
      const id = `invite:${inv.gameId}`
      next.add(id)
      showToast({
        id,
        tone: 'info',
        message: (
          <>
            <strong>{inv.inviterName}</strong> added you to a new{' '}
            <strong>{inv.gameName}</strong> game.
          </>
        ),
        action: { label: 'Join', onClick: () => join(inv) },
        onClose: () => dismiss(inv.gameId),
      })
    }
    for (const id of shownIds.current) if (!next.has(id)) dismissToast(id)
    shownIds.current = next
  }, [invites, dismiss, join])

  // On unmount (e.g. sign-out), clear any invite toasts we still own so they
  // don't linger over the login screen.
  useEffect(
    () => () => {
      for (const id of shownIds.current) dismissToast(id)
    },
    [],
  )

  return null
}
