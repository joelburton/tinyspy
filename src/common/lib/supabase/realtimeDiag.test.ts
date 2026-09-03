// cs-met-deep

import type { RealtimeChannel } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bareName, instrumentChannel, rtLog } from './realtimeDiag'

/**
 * **The instrumentation, held to its two promises.**
 *
 * `instrumentChannel` wraps three methods of a `RealtimeChannel` — `.on()`,
 * `.subscribe()`, `.unsubscribe()` — forwarding arguments verbatim because the
 * real `.on` has a dozen overloads. That makes it the one module here whose
 * correctness rests on a third-party shape, and it had no test: the failure
 * mode is a dependency bump, and the symptom is console lines going missing,
 * which is the one symptom nobody notices — the module's whole job is to be
 * what you read when something ELSE is wrong.
 *
 * So each test asserts BOTH halves, and the second is the one that matters:
 *
 *   1. the line is written, and
 *   2. **the app's own callback still runs, with the payload untouched.**
 *
 * A wrapper that logs but swallows the callback would break every realtime
 * feature in the app while looking healthy in the console.
 *
 * The double is hand-built rather than mocked from the library: what is being
 * tested is precisely that we forward what a channel hands us, so a double that
 * imitated our expectations would agree with us about the wrong thing.
 */

/** The parts of a channel this module touches, and nothing else. */
function fakeChannel(topic = 'realtime:game:abc') {
  const bindings: { type: string; filter: object; cb: (p: unknown) => void }[] = []
  let subscribeCb: ((status: string, err?: Error) => void) | undefined
  const ch = {
    topic,
    on(type: string, filter: object, cb: (p: unknown) => void) {
      bindings.push({ type, filter, cb })
      return ch
    },
    subscribe(cb?: (status: string, err?: Error) => void) {
      subscribeCb = cb
      return ch
    },
    unsubscribe: vi.fn((timeout?: number) => Promise.resolve(`ok:${timeout ?? 'none'}`)),
  }
  return {
    ch: ch as unknown as RealtimeChannel,
    /** Deliver a payload to every binding of a type, as the server would. */
    deliver: (type: string, payload: unknown) =>
      bindings.filter((b) => b.type === type).forEach((b) => b.cb(payload)),
    /** Report a subscribe status, as realtime-js would. */
    report: (status: string, err?: Error) => subscribeCb?.(status, err),
    bindings,
  }
}

let logged: string[]
let warned: string[]

beforeEach(() => {
  logged = []
  warned = []
  vi.spyOn(console, 'log').mockImplementation((...a) => void logged.push(a.join(' ')))
  vi.spyOn(console, 'warn').mockImplementation((...a) => void warned.push(a.join(' ')))
})
afterEach(() => vi.restoreAllMocks())

describe('bareName', () => {
  it('drops the prefix realtime-js adds', () => {
    expect(bareName('realtime:club:joel-leah')).toBe('club:joel-leah')
  })

  it('leaves a name that never had one alone', () => {
    expect(bareName('club:joel-leah')).toBe('club:joel-leah')
  })
})

describe('rtLog', () => {
  it('writes one line, stamped and topic-prefixed', () => {
    rtLog('game:abc', 'hello')
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatch(/^\[rt \d\d:\d\d:\d\d\.\d\d\d\] game:abc — hello$/)
  })

  it("takes the LEVEL before the extra, so a warn needs no placeholder", () => {
    rtLog('game:abc', 'trouble', 'warn')
    expect(logged).toHaveLength(0)
    expect(warned[0]).toContain('game:abc — trouble')
  })

  it('appends the extra when there is one', () => {
    rtLog('game:abc', 'with detail', 'log', 'the-extra')
    expect(logged[0]).toContain('the-extra')
  })
})

describe('instrumentChannel', () => {
  it('logs the postgres-changes health signal, and warns when it is not ok', () => {
    const { ch, deliver } = fakeChannel()
    instrumentChannel(ch)

    deliver('system', { status: 'ok', extension: 'postgres_changes', message: 'Subscribed' })
    expect(logged.some((l) => l.includes('system ok: Subscribed'))).toBe(true)

    deliver('system', { status: 'error', extension: 'postgres_changes', message: 'nope' })
    expect(warned.some((l) => l.includes('system error: nope'))).toBe(true)
  })

  it('logs a postgres_changes event AND still calls the app callback', () => {
    const { ch, deliver } = fakeChannel()
    instrumentChannel(ch)
    const app = vi.fn()
    ch.on('postgres_changes', { event: '*' } as never, app as never)

    const payload = { eventType: 'INSERT', schema: 'common', table: 'games' }
    deliver('postgres_changes', payload)

    expect(logged.some((l) => l.includes('event INSERT common.games'))).toBe(true)
    // The half that matters: the payload reaches the app, unmodified.
    expect(app).toHaveBeenCalledWith(payload)
  })

  it("warns when a delivery carries `errors`, which ride inside successful ones", () => {
    const { ch, deliver } = fakeChannel()
    instrumentChannel(ch)
    ch.on('postgres_changes', {} as never, vi.fn() as never)
    deliver('postgres_changes', { eventType: 'UPDATE', schema: 's', table: 't', errors: 'rls' })
    expect(warned.some((l) => l.includes('event UPDATE s.t'))).toBe(true)
  })

  it('logs a broadcast AND still calls the app callback', () => {
    const { ch, deliver } = fakeChannel()
    instrumentChannel(ch)
    const app = vi.fn()
    ch.on('broadcast', { event: 'move' } as never, app as never)

    deliver('broadcast', { event: 'move', payload: { x: 1 } })

    expect(logged.some((l) => l.includes('broadcast "move"'))).toBe(true)
    expect(app).toHaveBeenCalledWith({ event: 'move', payload: { x: 1 } })
  })

  it('leaves any other binding type completely alone', () => {
    const { ch, deliver } = fakeChannel()
    instrumentChannel(ch)
    const app = vi.fn()
    ch.on('presence', { event: 'sync' } as never, app as never)

    const before = logged.length + warned.length
    deliver('presence', { some: 'payload' })

    expect(app).toHaveBeenCalledWith({ some: 'payload' })
    expect(logged.length + warned.length).toBe(before)
  })

  it('logs every subscribe status AND still calls the app callback', () => {
    const { ch, report } = fakeChannel()
    instrumentChannel(ch)
    const app = vi.fn()
    ch.subscribe(app as never)

    expect(logged.some((l) => l.includes('subscribing'))).toBe(true)

    report('SUBSCRIBED')
    expect(logged.some((l) => l.includes('status SUBSCRIBED'))).toBe(true)

    // The failure statuses are the point of wrapping subscribe: the app's own
    // callbacks act only on SUBSCRIBED, which is why errored channels were
    // invisible before this module existed.
    const err = new Error('boom')
    report('CHANNEL_ERROR', err)
    expect(warned.some((l) => l.includes('status CHANNEL_ERROR'))).toBe(true)

    expect(app).toHaveBeenCalledWith('SUBSCRIBED', undefined)
    expect(app).toHaveBeenCalledWith('CHANNEL_ERROR', err)
  })

  it('survives a subscribe with no callback at all', () => {
    const { ch, report } = fakeChannel()
    instrumentChannel(ch)
    ch.subscribe()
    expect(() => report('SUBSCRIBED')).not.toThrow()
  })

  it('logs a deliberate teardown AND forwards to the real unsubscribe', async () => {
    const { ch } = fakeChannel()
    instrumentChannel(ch)

    await expect(ch.unsubscribe(1234)).resolves.toBe('ok:1234')
    expect(logged.some((l) => l.includes('unsubscribing (deliberate teardown)'))).toBe(true)
  })

  it('names every line by the BARE topic', () => {
    const { ch, deliver } = fakeChannel('realtime:club:joel-leah')
    instrumentChannel(ch)
    deliver('system', { status: 'ok', message: 'x' })
    expect(logged[0]).toContain('club:joel-leah —')
    expect(logged[0]).not.toContain('realtime:club')
  })
})
