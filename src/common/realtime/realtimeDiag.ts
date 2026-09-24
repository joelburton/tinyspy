// cs-blessed-realtime

import type { RealtimeChannel } from '@supabase/supabase-js'
import { logStamp } from '../utils/logStamp'
import { readStored } from '../web-storage/storage'

/**
 * **This is what writes the `[rt …]` lines in the browser console.** They are
 * the Realtime layer's evidence trail, and they are on for everyone, always —
 * no flag, no opt-in per hook (see "How it's wired" below). Read them when a
 * page has quietly stopped updating; what the trail is FOR is the deaf window
 * `onPostgresAttached` explains.
 *
 * ─── What it makes visible ────────────────────────────────────────────
 * A deaf channel, an errored one and a healthy one look identical to the
 * app: every subscribe callback checks `SUBSCRIBED`, and all three report
 * it. What tells them apart is the server's later `system` message —
 * `onPostgresAttached` is where that message is explained and why a hook
 * acts on it. These lines are where the difference is legible in a real
 * browser.
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
 *   - the `system` message — the postgres-changes health signal
 *     (`SystemPayload`, below)
 *   - every delivered `postgres_changes` event (schema.table + kind), and
 *     the payload's `errors` field when set (RLS/row-image failures ride
 *     inside otherwise-successful deliveries)
 *   - every delivered `broadcast` (event name)
 *   - `unsubscribe` — so a channel that vanished on purpose is
 *     distinguishable from one that went quiet
 *
 * Reading the trail: healthy is `status SUBSCRIBED` → `system ok`. What the
 * other shapes mean, and what a client that has quietly stopped updating
 * leaves behind, is this folder's doc.md → Reading the `[rt …]` trail.
 *
 * ─── Verbose mode ─────────────────────────────────────────────────────
 * For deep debugging in a deployed browser, flip on the raw socket log
 * (every push/receive/heartbeat realtime-js sees) with:
 *
 *     localStorage.setItem('puzpuzpuz:rt:verbose', '1')   // then reload
 *     localStorage.removeItem('puzpuzpuz:rt:verbose')     // back to normal
 *
 * The always-on lines above are low-frequency (channel lifecycle + one
 * line per game event) and stay on for everyone — that's the point:
 * when a friend hits the bug, the evidence is already in their console.
 */

/**
 * Timestamped, prefixed console line. Level `'warn'` for things that should pop
 * out of a screenshot (failure statuses, system errors).
 *
 * **`level` comes before `extra`** because that is how callers use them: most
 * pass neither, several want the level alone, and none has ever wanted `extra`
 * alone — which the other order would have made them write `undefined` to reach.
 */
export function rtLog(
  topic: string,
  msg: string,
  level: 'log' | 'warn' = 'log',
  extra?: unknown,
): void {
  const line = `[rt ${logStamp()}] ${topic} — ${msg}`
  if (extra === undefined) console[level](line)
  else console[level](line, extra)
}

/** The verbose-mode flag's key, on the app-wide `puzpuzpuz:` scope like every
 *  other key the app stores under. */
const VERBOSE_KEY = 'puzpuzpuz:rt:verbose'

/** True when the raw realtime-js socket log is enabled (see the module
 *  docstring → Verbose mode). localStorage can throw (privacy modes); treat
 *  that as off. */
export function rtVerbose(): boolean {
  return readStored('local', VERBOSE_KEY, null) === '1'
}

/**
 * **The server's `system` message**, which is how a channel reports on its
 * postgres_changes subscription AFTER the join ack: `status: 'ok'` means
 * events will flow, `'error'` that they never will. What that report is worth
 * to a hook is `onPostgresAttached`'s subject.
 *
 * Named here rather than at each reader because two things read it and they
 * are the two that must not fail together: `onPostgresAttached` closes the
 * deaf window with it, and `instrumentChannel` below is what you would read to
 * find out that the first had stopped firing.
 *
 * Every field is optional — it is a wire shape, not ours.
 */
export type SystemPayload = {
  status?: string
  extension?: string
  message?: string
}

/**
 * **A realtime-js topic as the name we gave it.** The library prefixes every
 * topic with `realtime:`; our channel names — and the rest of the app's logs —
 * speak the bare one.
 *
 * Exported because `channelTeardown` keys its in-flight map on the same bare
 * name, and the prefix is a convention of a DEPENDENCY: one place to change if
 * a version ever changes it, rather than two that would have to be found.
 */
export function bareName(topic: string): string {
  return topic.replace(/^realtime:/, '')
}

/**
 * Attach the diagnostic listeners/wrappers to a freshly created channel.
 * Called from the patched `supabase.channel()` factory, so it runs before
 * any `.on()` / `.subscribe()` the owning hook performs. Returns the same
 * channel (the factory's callers chain off it).
 */
export function instrumentChannel(ch: RealtimeChannel): RealtimeChannel {
  // Deliberately wrap-the-public-API, not reach-into-internals: `.on()`,
  // `.subscribe()` and `.unsubscribe()` are stable surface. The `system`
  // binding is safe to add here, before subscribe, because only
  // `postgres_changes` bindings affect the join payload.
  const topic = bareName(ch.topic)

  // The postgres-changes health signal. `status: 'ok'` means the WAL
  // poller really carries this channel's subscription; its absence after
  // SUBSCRIBED is the deaf-channel signature.
  ch.on('system', {}, (payload: SystemPayload | undefined) => {
    rtLog(
      topic,
      `system ${String(payload?.status)}: ${payload?.message ?? ''}`,
      payload?.status === 'ok' ? 'log' : 'warn',
      payload?.extension ? `(${payload.extension})` : undefined,
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
          p.errors ? 'warn' : 'log',
          p.errors ?? undefined,
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
        status === 'SUBSCRIBED' || status === 'CLOSED' ? 'log' : 'warn',
        err ?? undefined,
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
