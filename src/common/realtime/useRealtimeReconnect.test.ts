// cs-blessed-realtime

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

/**
 * The reconnect nudge is pure wiring — event listeners → a guarded
 * `realtime.connect()`. We mock the supabase client's realtime surface and drive
 * the browser events to pin the contract: reconnect only when the socket is down
 * AND (for focus/visibility) the tab is actually visible; never when connected;
 * the token renewed before the socket reopens; and listeners are cleaned up on
 * unmount.
 */
const isConnected = vi.fn()
const connect = vi.fn()
const setAuth = vi.fn()
vi.mock('../supabase/supabase', () => ({
  supabase: {
    realtime: {
      isConnected: () => isConnected(),
      connect: () => connect(),
      setAuth: () => setAuth(),
    },
  },
}))

/** Let the hook's awaited `setAuth` settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

import { useRealtimeReconnect } from './useRealtimeReconnect'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

describe('useRealtimeReconnect', () => {
  beforeEach(() => {
    isConnected.mockReset()
    connect.mockReset()
    setAuth.mockReset()
    setAuth.mockResolvedValue(undefined)
    setVisibility('visible')
  })

  it('reconnects on visibilitychange→visible when the socket is down', async () => {
    isConnected.mockReturnValue(false)
    renderHook(() => useRealtimeReconnect())
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1))
  })

  it('renews the token before it reopens the socket', async () => {
    // A socket reopened first would rejoin with the token it held when the tab
    // went to sleep, which may have expired.
    isConnected.mockReturnValue(false)
    let renew: () => void = () => {}
    setAuth.mockReturnValue(new Promise<void>((resolve) => { renew = resolve }))
    renderHook(() => useRealtimeReconnect())
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(setAuth).toHaveBeenCalledTimes(1)
    expect(connect).not.toHaveBeenCalled()
    renew()
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1))
  })

  it('reconnects on the online event when the socket is down', async () => {
    isConnected.mockReturnValue(false)
    renderHook(() => useRealtimeReconnect())
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1))
  })

  it('does nothing when already connected (connect() guard)', async () => {
    isConnected.mockReturnValue(true)
    renderHook(() => useRealtimeReconnect())
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(connect).not.toHaveBeenCalled()
  })

  it('does not reconnect while the tab is hidden', async () => {
    isConnected.mockReturnValue(false)
    setVisibility('hidden')
    renderHook(() => useRealtimeReconnect())
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(setAuth).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })

  it('removes its listeners on unmount', async () => {
    isConnected.mockReturnValue(false)
    const { unmount } = renderHook(() => useRealtimeReconnect())
    unmount()
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(connect).not.toHaveBeenCalled()
  })
})
