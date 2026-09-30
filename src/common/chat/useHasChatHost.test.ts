// cs-fixed-chat

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { registerChatHost, useHasChatHost } from './useHasChatHost'

describe('useHasChatHost', () => {
  it("follows a chat panel's lifetime, and re-renders a reader either way", () => {
    const { result } = renderHook(() => useHasChatHost())
    expect(result.current).toBe(false)
    let release = () => {}
    act(() => {
      release = registerChatHost()
    })
    expect(result.current).toBe(true)
    act(() => release())
    expect(result.current).toBe(false)
  })

  it('counts panels, so the next page mounting before the last releases stays mounted', () => {
    const { result } = renderHook(() => useHasChatHost())
    let releaseFirst = () => {}
    let releaseSecond = () => {}
    act(() => {
      releaseFirst = registerChatHost()
      releaseSecond = registerChatHost()
    })
    act(() => releaseFirst())
    expect(result.current).toBe(true)
    act(() => releaseSecond())
    expect(result.current).toBe(false)
  })
})
