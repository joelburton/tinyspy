// cs-unmet

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRefetchOnGameUpdate, type GameLoad } from './useRefetchOnGameUpdate'

type Props = { commonGameUpdatedAt: string; resubscribeCount: number; load: GameLoad }

function mount(initial: Omit<Props, 'load'>, load: GameLoad) {
  return renderHook((p: Props) => useRefetchOnGameUpdate(p), {
    initialProps: { ...initial, load },
  })
}

describe('useRefetchOnGameUpdate', () => {
  it('loads once on mount', () => {
    const load = vi.fn(async () => {})
    mount({ commonGameUpdatedAt: 't1', resubscribeCount: 0 }, load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('loads again when updated_at moves, and not on a render that moves nothing', () => {
    const load = vi.fn(async () => {})
    const { rerender } = mount({ commonGameUpdatedAt: 't1', resubscribeCount: 0 }, load)
    rerender({ commonGameUpdatedAt: 't1', resubscribeCount: 0, load })
    expect(load).toHaveBeenCalledTimes(1)
    rerender({ commonGameUpdatedAt: 't2', resubscribeCount: 0, load })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('loads again on a resubscribe, though nobody moved', () => {
    const load = vi.fn(async () => {})
    const { rerender } = mount({ commonGameUpdatedAt: 't1', resubscribeCount: 0 }, load)
    rerender({ commonGameUpdatedAt: 't1', resubscribeCount: 1, load })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('runs the latest load closure, not the first', () => {
    const first = vi.fn(async () => {})
    const second = vi.fn(async () => {})
    const { rerender } = mount({ commonGameUpdatedAt: 't1', resubscribeCount: 0 }, first)
    rerender({ commonGameUpdatedAt: 't1', resubscribeCount: 0, load: second })
    rerender({ commonGameUpdatedAt: 't2', resubscribeCount: 0, load: second })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('tells an overtaken load, and one after unmount, not to commit', () => {
    const seen: (() => boolean)[] = []
    const load: GameLoad = async ({ isCurrent }) => {
      seen.push(isCurrent)
    }
    const { rerender, unmount } = mount({ commonGameUpdatedAt: 't1', resubscribeCount: 0 }, load)
    rerender({ commonGameUpdatedAt: 't2', resubscribeCount: 0, load })
    expect(seen.map((m) => m())).toEqual([false, true])
    unmount()
    expect(seen[1]!()).toBe(false)
  })
})
