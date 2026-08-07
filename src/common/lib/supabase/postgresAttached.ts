import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Fire `cb` each time the server confirms this channel's postgres_changes
 * subscription is really attached to the WAL poller — the `system` message
 * `{ extension: 'postgres_changes', status: 'ok', message: 'Subscribed to
 * PostgreSQL' }`.
 *
 * ─── Why this exists: the deaf window ─────────────────────────────────
 * `SUBSCRIBED` is only the join ack. Attaching the channel's bindings to
 * the WAL poller is a second, asynchronous phase on the server, and events
 * committed before it completes are dropped — not delayed, dropped
 * (measured; see docs/realtime-lost-events.md). So the standard
 * refetch-on-SUBSCRIBED runs too early to be the last word: it reads state
 * as of the join, and a write landing in the SUBSCRIBED→attached gap is
 * lost with nothing left to trigger a re-read. The window is milliseconds
 * against a warm tenant but seconds during a tenant boot — exactly when a
 * player "connects at the wrong moment".
 *
 * The fix contract every postgres_changes hook follows: refetch on
 * SUBSCRIBED (fast first paint, reconnect catch-up) AND refetch again on
 * this attach confirmation (closing the window). Like SUBSCRIBED, the
 * confirmation fires again after every rejoin, so reconnects get the same
 * protection.
 *
 * Call it BEFORE `.subscribe()`, like any other `.on()`. Channels without
 * postgres_changes bindings never receive the message, so wiring it there
 * is a harmless no-op — but it's also pointless; keep it to hooks that
 * actually consume table changes.
 */
export function onPostgresAttached(ch: RealtimeChannel, cb: () => void): void {
  ch.on('system', {}, (payload: Record<string, unknown> | undefined) => {
    if (
      payload?.['status'] === 'ok' &&
      payload?.['extension'] === 'postgres_changes'
    ) {
      cb()
    }
  })
}
