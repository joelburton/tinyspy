import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Console diagnostics for the Realtime layer — the evidence trail for the
 * lost-event failure mode (docs/realtime-lost-events.md).
 *
 * ─── Why this exists ──────────────────────────────────────────────────
 * A channel can report `SUBSCRIBED` and then never deliver a single
 * `postgres_changes` event. The client-side mechanism (verified against
 * realtime-js 2.108.1): `SUBSCRIBED` fires on the **join ack** — the server
 * accepted the topic and assigned ids to the postgres_changes bindings. But
 * wiring those bindings into the WAL poller is a SECOND, asynchronous phase
 * on the server, and its outcome arrives later as a separate `system`
 * message on the channel:
 *
 *     { extension: 'postgres_changes', status: 'ok',
 *       message: 'Subscribed to PostgreSQL' }        ← events will flow
 *     { …, status: 'error', message: '…' }           ← they never will
 *
 * Nothing in the app listened for that message, and every subscribe
 * callback checked only `SUBSCRIBED` — so a deaf channel, an errored
 * channel, and a healthy one all looked identical in a real browser.
 * This module makes the difference visible in the console.
 *
 * ─── How it's wired ───────────────────────────────────────────────────
 * `supabase.ts` wraps the client's `channel()` factory with
 * `instrumentChannel`, so EVERY channel in the app (all per-game data
 * channels, the game/club rooms, chat, scratchpad, presence) is covered
 * without touching each hook. Per channel it logs:
 *
 *   - every subscribe status (`SUBSCRIBED` / `CHANNEL_ERROR` / `TIMED_OUT`
 *     / `CLOSED`), with the error when there is one — warn-level for the
 *     failure statuses so they stand out in a screenshot
 *   - the `system` message — the postgres-changes health signal above
 *   - every delivered `postgres_changes` event (schema.table + kind), and
 *     the payload's `errors` field when set (RLS/row-image failures ride
 *     inside otherwise-successful deliveries)
 *   - every delivered `broadcast` (event name)
 *   - `unsubscribe` — so a channel that vanished on purpose is
 *     distinguishable from one that went quiet
 *
 * Reading the trail: a healthy channel shows `status SUBSCRIBED` followed
 * shortly by `system ok`. A channel with `SUBSCRIBED` but NO `system ok`
 * is the deaf state — it will never deliver events, and no amount of
 * waiting helps.
 *
 * ─── Verbose mode ─────────────────────────────────────────────────────
 * For deep debugging in a deployed browser, flip on the raw socket log
 * (every push/receive/heartbeat realtime-js sees) with:
 *
 *     localStorage.setItem('rt-verbose', '1')   // then reload
 *     localStorage.removeItem('rt-verbose')     // back to normal
 *
 * The always-on lines above are low-frequency (channel lifecycle + one
 * line per game event) and stay on for everyone — that's the point:
 * when a friend hits the bug, the evidence is already in their console.
 */

/** Timestamped, prefixed console line. Level 'warn' for things that should
 *  pop out of a screenshot (failure statuses, system errors). */
export function rtLog(
  topic: string,
  msg: string,
  extra?: unknown,
  level: 'log' | 'warn' = 'log',
): void {
  const t = new Date()
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  const ss = String(t.getSeconds()).padStart(2, '0')
  const ms = String(t.getMilliseconds()).padStart(3, '0')
  const line = `[rt ${hh}:${mm}:${ss}.${ms}] ${topic} — ${msg}`
  if (extra === undefined) console[level](line)
  else console[level](line, extra)
}

/** True when the raw realtime-js socket log is enabled (see docstring).
 *  localStorage can throw (privacy modes); treat that as off. */
export function rtVerbose(): boolean {
  try {
    return localStorage.getItem('rt-verbose') === '1'
  } catch {
    return false
  }
}

/** realtime-js prefixes every topic with `realtime:`; our channel names —
 *  and the rest of the app's logs — speak the bare name. */
function bareTopic(ch: RealtimeChannel): string {
  return ch.topic.replace(/^realtime:/, '')
}

/**
 * Attach the diagnostic listeners/wrappers to a freshly created channel.
 * Called from the patched `supabase.channel()` factory, so it runs before
 * any `.on()` / `.subscribe()` the owning hook performs. Returns the same
 * channel (the factory's callers chain off it).
 *
 * Implementation is deliberately wrap-the-public-API, not reach-into-
 * internals: `.on()`, `.subscribe()`, `.unsubscribe()` are stable surface.
 * The `system` binding is safe to add here (before subscribe) because only
 * `postgres_changes` bindings affect the join payload.
 */
export function instrumentChannel(ch: RealtimeChannel): RealtimeChannel {
  const topic = bareTopic(ch)

  // The postgres-changes health signal. `status: 'ok'` means the WAL
  // poller really carries this channel's subscription; its absence after
  // SUBSCRIBED is the deaf-channel signature.
  ch.on('system', {}, (payload: Record<string, unknown> | undefined) => {
    const status = payload?.['status']
    rtLog(
      topic,
      `system ${String(status)}: ${String(payload?.['message'] ?? '')}`,
      payload?.['extension'] ? `(${String(payload['extension'])})` : undefined,
      status === 'ok' ? 'log' : 'warn',
    )
  })

  // Wrap .on() so postgres_changes / broadcast deliveries are logged next
  // to the app callback that consumes them. Typed loosely on purpose —
  // RealtimeChannel.on has a dozen overloads and we forward verbatim.
  const origOn = ch.on.bind(ch) as (
    type: string,
    filter: object,
    cb: (payload: never) => void,
  ) => RealtimeChannel
  ;(ch as { on: unknown }).on = (
    type: string,
    filter: object,
    cb: (payload: unknown) => void,
  ) => {
    let wrapped = cb
    if (type === 'postgres_changes') {
      wrapped = (payload: unknown) => {
        const p = payload as {
          eventType?: string
          schema?: string
          table?: string
          errors?: unknown
        }
        rtLog(
          topic,
          `event ${p.eventType} ${p.schema}.${p.table}`,
          p.errors ?? undefined,
          p.errors ? 'warn' : 'log',
        )
        cb(payload)
      }
    } else if (type === 'broadcast') {
      wrapped = (payload: unknown) => {
        const p = payload as { event?: string }
        rtLog(topic, `broadcast "${p.event}"`)
        cb(payload)
      }
    }
    return origOn(type, filter, wrapped as (payload: never) => void)
  }

  // Wrap .subscribe() so EVERY status lands in the console — the app's
  // own callbacks only act on SUBSCRIBED, which is exactly why errored
  // channels have been invisible.
  const origSubscribe = ch.subscribe.bind(ch)
  ch.subscribe = (...[cb, timeout]: Parameters<RealtimeChannel['subscribe']>) => {
    rtLog(topic, 'subscribing')
    return origSubscribe((status, err) => {
      rtLog(
        topic,
        `status ${status}`,
        err ?? undefined,
        status === 'SUBSCRIBED' || status === 'CLOSED' ? 'log' : 'warn',
      )
      cb?.(status, err)
    }, timeout)
  }

  // Wrap .unsubscribe() (removeChannel calls through it) so deliberate
  // teardown is distinguishable from a channel that just went silent.
  const origUnsubscribe = ch.unsubscribe.bind(ch)
  ch.unsubscribe = (timeout?: number) => {
    rtLog(topic, 'unsubscribing (deliberate teardown)')
    return origUnsubscribe(timeout)
  }

  return ch
}
