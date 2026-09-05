// cs-blessed-realtime

import { vi, type Mock } from 'vitest'

/**
 * A stand-in for a Supabase realtime channel, with the server's two moves —
 * the join ack and a presence sync — under the test's hand.
 *
 * Reach for this when a test drives a HOOK through a channel's life —
 * subscribe, presence, teardown. It is shaped like realtime-js's
 * `RealtimeChannel` in the four ways those hooks touch: `on` to register the
 * presence-sync handler, `subscribe` for the join ack, `track` / `untrack` to
 * announce, and `presenceState()` for the roster. `topic` carries the
 * `realtime:` prefix the real one does, because `channelTeardown` reads it.
 *
 * A test of a smaller surface keeps its own smaller double, on purpose:
 * `realtimeDiag.test.ts` needs an UNINSTRUMENTED channel that records its
 * bindings by type (it is testing the instrumentation itself),
 * `postgresAttached.test.ts` needs one `system` binding, and
 * `channelTeardown.test.ts` needs nothing but `.topic`.
 *
 * **Nothing happens until the test says so**, which is the point. A real
 * channel answers on its own schedule, so the window between mount and the
 * first sync — the one a page paints its first render in — is impossible to
 * hold still against the real thing. Here it is simply the default state, and
 * {@link FakeChannel.subscribed} / {@link FakeChannel.sync} step out of it.
 *
 * The mock that hands these out belongs in each test file (`vi.mock` is
 * hoisted, so it cannot be shared), and `lastFakeChannel` reads the most
 * recent one back out of it.
 *
 * Not a `.test.ts` file, so it ships no cases of its own, the way
 * `common/boot/reload.fake.ts` does not.
 */

/** One client's presence payload, as its `track()` sent it. */
export type FakePresence = { user_id?: string } & Record<string, unknown>

/** A presence roster, keyed the way `presenceState()` keys it. */
export type FakePresenceState = Record<string, FakePresence[]>

export type FakeChannel = {
  topic: string
  /** Records the callback. Our hooks register exactly one `presence`/`sync`
   *  handler per channel, so the event and filter are ignored. */
  on: (event: string, filter: unknown, cb: () => void) => FakeChannel
  subscribe: (cb?: (status: string) => void) => FakeChannel
  track: Mock
  untrack: Mock
  presenceState: () => FakePresenceState
  /** Play the join ack — `SUBSCRIBED` — to whoever is waiting on it. */
  subscribed: () => void
  /** Publish `state` as the channel's roster and fire the sync handler. */
  sync: (state: FakePresenceState) => void
}

/** A fake channel joined under `name` (what `supabase.channel(name)` was given). */
export function fakeChannel(name: string): FakeChannel {
  let onSync: (() => void) | undefined
  let onStatus: ((status: string) => void) | undefined
  let presence: FakePresenceState = {}

  const ch: FakeChannel = {
    topic: `realtime:${name}`,
    on: (_event, _filter, cb) => {
      onSync = cb
      return ch
    },
    subscribe: (cb) => {
      onStatus = cb
      return ch
    },
    track: vi.fn(),
    untrack: vi.fn(),
    presenceState: () => presence,
    subscribed: () => onStatus?.('SUBSCRIBED'),
    sync: (state) => {
      presence = state
      onSync?.()
    },
  }
  return ch
}

/** The channel most recently handed out by a `supabase.channel` mock whose
 *  implementation is {@link fakeChannel}. */
export function lastFakeChannel(channel: Mock): FakeChannel {
  const { results } = channel.mock
  if (results.length === 0) throw new Error('no channel was joined')
  return results[results.length - 1].value as FakeChannel
}
