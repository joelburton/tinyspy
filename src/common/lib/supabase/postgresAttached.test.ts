/**
 * Tests for onPostgresAttached — the deaf-window closer's filter. The
 * contract is tiny but load-bearing (every postgres_changes hook routes its
 * attach-time refetch through it): fire on the server's postgres_changes
 * attach confirmation, on EVERY such confirmation (rejoins re-attach), and
 * on nothing else the `system` event stream might carry.
 */
import { describe, expect, it, vi } from 'vitest'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { onPostgresAttached } from './postgresAttached'

/** A channel stub exposing just the `system` binding the helper installs. */
function fakeChannel() {
  let handler: ((payload: unknown) => void) | null = null
  const ch = {
    on: (_type: string, _filter: object, cb: (payload: unknown) => void) => {
      handler = cb
      return ch
    },
  } as unknown as RealtimeChannel
  return { ch, fire: (payload: unknown) => handler?.(payload) }
}

describe('onPostgresAttached', () => {
  it('fires on the postgres_changes attach confirmation', () => {
    const { ch, fire } = fakeChannel()
    const cb = vi.fn()
    onPostgresAttached(ch, cb)
    fire({ status: 'ok', extension: 'postgres_changes', message: 'Subscribed to PostgreSQL' })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('fires again on a re-attach (reconnects re-confirm)', () => {
    const { ch, fire } = fakeChannel()
    const cb = vi.fn()
    onPostgresAttached(ch, cb)
    fire({ status: 'ok', extension: 'postgres_changes' })
    fire({ status: 'ok', extension: 'postgres_changes' })
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('ignores everything else the system stream carries', () => {
    const { ch, fire } = fakeChannel()
    const cb = vi.fn()
    onPostgresAttached(ch, cb)
    fire({ status: 'error', extension: 'postgres_changes' }) // attach FAILED
    fire({ status: 'ok', extension: 'presence' }) // some other subsystem
    fire({ status: 'ok' }) // no extension at all
    fire(undefined) // defensive: payloadless system event
    expect(cb).not.toHaveBeenCalled()
  })
})
