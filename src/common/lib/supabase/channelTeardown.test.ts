/**
 * Tests for the stable-name channel teardown registry.
 *
 * What's worth pinning is the ORDERING contract the hooks depend on: while a
 * channel with a given room name is still leaving, `channelLeaving` hands back
 * a promise; once it settles the name is free again. Everything else about the
 * bug (realtime-js's cache returning the dying instance, the server rejecting a
 * racing re-join) lives outside our code — see the module docstring.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const removeChannel = vi.fn()
vi.mock('./supabase', () => ({ supabase: { removeChannel: (ch: unknown) => removeChannel(ch) } }))

import { channelLeaving, releaseChannel, __resetChannelTeardowns } from './channelTeardown'

/** A stand-in channel — the registry only reads `.topic`. */
const chan = (name: string) => ({ topic: `realtime:${name}` }) as never

beforeEach(() => {
  __resetChannelTeardowns()
  removeChannel.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('channelTeardown', () => {
  it('reports nothing pending for a name that was never released', () => {
    expect(channelLeaving('game:g1')).toBeNull()
  })

  it('holds the name while the leave is in flight, and frees it after', async () => {
    let finish!: () => void
    removeChannel.mockReturnValue(new Promise<void>((r) => (finish = r)))

    const done = releaseChannel(chan('game:g1'))
    expect(channelLeaving('game:g1')).not.toBeNull()
    // A DIFFERENT room is unaffected — the gate is per name, not global.
    expect(channelLeaving('game:g2')).toBeNull()

    finish()
    await done
    expect(channelLeaving('game:g1')).toBeNull()
  })

  it('keys off the bare name, not realtime-js\'s prefixed topic', async () => {
    removeChannel.mockResolvedValue('ok')
    const done = releaseChannel(chan('club:abc'))
    // The hooks ask with the name they passed to supabase.channel().
    expect(channelLeaving('club:abc')).not.toBeNull()
    expect(channelLeaving('realtime:club:abc')).toBeNull()
    await done
  })

  it('frees the name even when removeChannel REJECTS', async () => {
    // A failed leave must not wedge every future join of that room.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    removeChannel.mockRejectedValue(new Error('socket gone'))

    await expect(releaseChannel(chan('game:g1'))).resolves.toBeUndefined()
    expect(channelLeaving('game:g1')).toBeNull()
    expect(logged).toHaveBeenCalled()
  })

  it('a second release supersedes the first, and the stale one does not free the name', async () => {
    let finishA!: () => void
    removeChannel.mockReturnValueOnce(new Promise<void>((r) => (finishA = r)))
    let finishB!: () => void
    removeChannel.mockReturnValueOnce(new Promise<void>((r) => (finishB = r)))

    const a = releaseChannel(chan('game:g1'))
    const b = releaseChannel(chan('game:g1'))

    finishA()
    await a
    // B is still leaving — A settling must NOT report the room as free, or a
    // re-create would join straight into B's leave.
    expect(channelLeaving('game:g1')).not.toBeNull()

    finishB()
    await b
    expect(channelLeaving('game:g1')).toBeNull()
  })
})
