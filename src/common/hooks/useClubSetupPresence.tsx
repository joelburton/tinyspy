import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { MODE_LABEL } from '../lib/games'
import { showToast, dismissToast } from '../lib/toastStore'

/**
 * "Someone's already setting up a game" heads-up. Two club members who don't
 * realize who's starting the next game would both open the setup dialog and
 * create duplicate games; this surfaces a toast — "moth is setting up a new
 * FreeBee Co-op game…" — to everyone ELSE on the club page while a member has
 * the setup dialog open, so the others hold off.
 *
 * **Presence, not a fire-and-forget broadcast** — deliberately. Unlike the game
 * INVITE (a durable `game_players` row watched via postgres-changes), "a dialog
 * is open right now" is ephemeral state with no row to watch. Presence fits it
 * exactly and beats a raw open/close broadcast on two counts:
 *   - **auto-clears on disconnect** — if the setter's tab crashes mid-setup,
 *     their presence expires and everyone's toast drops (no stuck "close" to
 *     miss), and
 *   - **syncs to late-joiners** — a member landing on the club page *after* the
 *     dialog opened still sees it on the next presence sync (a broadcast has no
 *     replay).
 *
 * ClubPage owns the ONE channel (`club-setup:<handle>`) so a single client never
 * double-subscribes the same name: it TRACKS its own setup (from `announce`,
 * derived from `pendingSetup`) and RECEIVES peers' via presence sync. When the
 * setter cancels/starts, the dialog unmounts → `announce` goes null → untrack →
 * peers' toasts clear. If they started a game, the separate INVITE toast then
 * arrives through its own DB-backed path (`useGameInvitations`).
 *
 * The toast is deliberately NOT user-dismissible (`dismissible: false`): it's a
 * live status that retires itself, and an X would just reappear on the next sync.
 */
export function useClubSetupPresence({
  clubHandle,
  selfUserId,
  announce,
}: {
  clubHandle: string | null
  selfUserId: string
  /**
   * What I'm setting up right now (with my display name for the announcement),
   * or `null` when I'm not — which is **receive-only**: subscribe + toast peers,
   * announce nothing. ClubPage passes the live value (driven by `pendingSetup`);
   * GamePage passes `null` so players IN a game (paused or active) still see a
   * peer's "setting up" toast. The two pages are never mounted at once, so a
   * single client never double-subscribes `club-setup:<handle>`.
   */
  announce: { brand: string; mode: 'coop' | 'compete'; username: string } | null
}): void {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const subscribedRef = useRef(false)
  // The invite-toast ids we currently own, so we can drop the ones whose setter
  // has left on the next sync (mirrors the game-invite reconcile).
  const shownRef = useRef<Set<string>>(new Set())
  // Latest announce for the async SUBSCRIBED callback (fires after mount).
  const announceRef = useRef(announce)
  useEffect(() => {
    announceRef.current = announce
  })

  // Subscribe once per club: peers' setup presence → toasts.
  useEffect(() => {
    if (!clubHandle) return
    const ch = supabase.channel(`club-setup:${clubHandle}`, {
      config: { presence: { key: selfUserId } },
    })
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<
        string,
        Array<{ user_id?: string; username?: string; brand?: string; mode?: 'coop' | 'compete' }>
      >
      const present = new Set<string>()
      for (const list of Object.values(state)) {
        for (const e of list) {
          if (!e.user_id || e.user_id === selfUserId) continue // never toast my own setup
          const id = `setup:${e.user_id}`
          present.add(id)
          const modeLabel = e.mode ? ` ${MODE_LABEL[e.mode]}` : ''
          showToast({
            id,
            tone: 'info',
            dismissible: false, // a live status — it clears itself when they finish
            message: (
              <>
                <strong>{e.username ?? 'Someone'}</strong> is setting up a new{' '}
                <strong>{e.brand ?? 'game'}</strong>
                {modeLabel} game…
              </>
            ),
          })
        }
      }
      for (const id of shownRef.current) if (!present.has(id)) dismissToast(id)
      shownRef.current = present
    })
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        subscribedRef.current = true
        // Apply whatever setup state already exists (dialog may have opened
        // before the channel finished subscribing).
        const a = announceRef.current
        if (a) void ch.track({ user_id: selfUserId, username: a.username, brand: a.brand, mode: a.mode })
      }
    })
    channelRef.current = ch
    return () => {
      subscribedRef.current = false
      for (const id of shownRef.current) dismissToast(id)
      shownRef.current = new Set()
      supabase.removeChannel(ch)
      channelRef.current = null
    }
  }, [clubHandle, selfUserId])

  // Announce (or stop announcing) MY setup as the dialog opens/closes. Primitive
  // deps (not the recreated-each-render object) so this only fires on real change.
  // Receive-only callers pass `announce: null`, so `brand`/`mode` stay null and
  // this only ever untracks (a no-op) — they never announce.
  const brand = announce?.brand ?? null
  const mode = announce?.mode ?? null
  const username = announce?.username ?? null
  useEffect(() => {
    const ch = channelRef.current
    if (!ch || !subscribedRef.current) return // the SUBSCRIBED callback handles the initial track
    if (brand && mode) {
      void ch.track({ user_id: selfUserId, username: username ?? 'Someone', brand, mode })
    } else {
      void ch.untrack()
    }
  }, [brand, mode, username, selfUserId])
}
