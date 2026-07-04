import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

/**
 * The reconnect nudge is pure wiring — event listeners → a guarded
 * `realtime.connect()`. We mock the supabase client's realtime surface and drive
 * the browser events to pin the contract: reconnect only when the socket is down
 * AND (for focus/visibility) the tab is actually visible; never when connected;
 * and listeners are cleaned up on unmount.
 */
const isConnected = vi.fn()
const connect = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: { realtime: { isConnected: () => isConnected(), connect: () => connect() } },
}))

import { useRealtimeReconnect } from './useRealtimeReconnect'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

describe('useRealtimeReconnect', () => {
  beforeEach(() => {
    isConnected.mockReset()
    connect.mockReset()
    setVisibility('visible')
  })

  it('reconnects on visibilitychange→visible when the socket is down', () => {
    isConnected.mockReturnValue(false)
    renderHook(() => useRealtimeReconnect())
    document.dispatchEvent(new Event('visibilitychange'))
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('reconnects on the online event when the socket is down', () => {
    isConnected.mockReturnValue(false)
    renderHook(() => useRealtimeReconnect())
    window.dispatchEvent(new Event('online'))
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('does nothing when already connected (connect() guard)', () => {
    isConnected.mockReturnValue(true)
    renderHook(() => useRealtimeReconnect())
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('focus'))
    expect(connect).not.toHaveBeenCalled()
  })

  it('does not reconnect while the tab is hidden', () => {
    isConnected.mockReturnValue(false)
    setVisibility('hidden')
    renderHook(() => useRealtimeReconnect())
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    expect(connect).not.toHaveBeenCalled()
  })

  it('removes its listeners on unmount', () => {
    isConnected.mockReturnValue(false)
    const { unmount } = renderHook(() => useRealtimeReconnect())
    unmount()
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('focus'))
    expect(connect).not.toHaveBeenCalled()
  })
})
