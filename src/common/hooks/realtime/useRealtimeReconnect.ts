import { useEffect } from 'react'
import { supabase } from '../../lib/supabase/supabase'

/**
 * Nudge the Realtime socket back to life when the user returns to a tab that was
 * asleep (laptop closed, went to dinner) or when the network comes back.
 *
 * Why this matters — the presence-pause deadlock: two players walk away, their
 * presence times out, and the game shows the pause overlay. On its own, Supabase
 * only notices a dead socket via its ~25s heartbeat and then reconnects on a
 * backoff — so after a real OS sleep the socket can sit half-dead and the game
 * stays wedged in "Waiting for…" until someone hard-refreshes. Forcing a
 * `connect()` the instant the tab becomes visible / the network returns reopens
 * the socket immediately; the app's channels then rejoin and re-fire their
 * `SUBSCRIBED` handlers, which re-`track()` presence and clear the pause.
 *
 * Mounted once, app-wide (App.tsx). `connect()` is idempotent — a no-op when the
 * socket is already connecting/open — so the guarded call is safe to fire on
 * every focus. (The half-dead-but-"connected" case still falls back to the 25s
 * heartbeat; this handles the common clean-close-after-sleep case right away.
 * The pause overlay's Return-to-club / End-game buttons are the manual backstop
 * for anything this doesn't recover.)
 */
export function useRealtimeReconnect(): void {
  useEffect(() => {
    const reconnectIfDown = () => {
      if (!supabase.realtime.isConnected()) supabase.realtime.connect()
    }
    // Only when the tab is actually visible — no point reconnecting a
    // backgrounded tab (and its token auto-refresh is paused while hidden).
    const onVisible = () => {
      if (document.visibilityState === 'visible') reconnectIfDown()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', reconnectIfDown)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', reconnectIfDown)
    }
  }, [])
}
