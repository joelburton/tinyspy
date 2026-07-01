import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGlobalFeedback } from './useGlobalFeedback'
import type { GenericFeedbackMsg } from '../lib/games'

/**
 * Tests for the shared peer-narration bootstrap. The cases that matter are the
 * seed-TIMING ones from docs/peer-feedback-audit.md → §1.1, which the games'
 * synchronous PlayArea mocks never reproduced (they hand the backlog to the
 * first render, hiding the async-load bug). Here we drive the async explicitly
 * via `rerender`: enabled/items flip across renders the way a real load does.
 */

type Props = { enabled: boolean; items: readonly string[] }

/** A harness that narrates every item as `"{item}"`, except `"self"` (skipped,
 *  standing in for the player's own action). Returns the feedback spy. */
function setup(initial: Props) {
  const globalFeedback = { show: vi.fn(), clear: vi.fn() }
  const messageFor = (item: string): GenericFeedbackMsg | null =>
    item === 'self' ? null : { tone: 'neutral', text: item, dismiss: { kind: 'timed' } }
  const { rerender } = renderHook(
    (p: Props) =>
      useGlobalFeedback({
        enabled: p.enabled,
        items: p.items,
        keyOf: (x) => x,
        messageFor,
        globalFeedback,
      }),
    { initialProps: initial },
  )
  return { globalFeedback, rerender }
}

describe('useGlobalFeedback', () => {
  it('bootstraps silently — an existing backlog at load fires nothing', () => {
    const { globalFeedback } = setup({ enabled: true, items: ['a', 'b'] })
    expect(globalFeedback.show).not.toHaveBeenCalled()
  })

  it('fires a pill for each NEW event after bootstrap', () => {
    const { globalFeedback, rerender } = setup({ enabled: true, items: ['a'] })
    rerender({ enabled: true, items: ['a', 'b', 'c'] })
    expect(globalFeedback.show).toHaveBeenCalledTimes(2)
    expect(globalFeedback.show.mock.calls[0][0].text).toBe('b')
    expect(globalFeedback.show.mock.calls[1][0].text).toBe('c')
  })

  it('skips events messageFor maps to null (own actions)', () => {
    const { globalFeedback, rerender } = setup({ enabled: true, items: [] })
    rerender({ enabled: true, items: ['self', 'a'] })
    expect(globalFeedback.show).toHaveBeenCalledTimes(1)
    expect(globalFeedback.show.mock.calls[0][0].text).toBe('a')
  })

  // §1.1 — the confirmed wordle bug: enabled/items are the loading values on the
  // first render, then the real backlog arrives. The seed must capture it, not
  // replay it.
  it('does NOT replay a backlog that arrives after the loading render', () => {
    const { globalFeedback, rerender } = setup({ enabled: false, items: [] })
    // game loads: mode becomes coop AND the backlog arrives in the same commit
    rerender({ enabled: true, items: ['a', 'b', 'c'] })
    expect(globalFeedback.show).not.toHaveBeenCalled()
  })

  // §1.1 — the opposite bug (psychicnum/connections): a fresh game seeds empty,
  // so the peer's FIRST event must fire, not get adopted as "seen".
  it('fires the FIRST peer event of a fresh game', () => {
    const { globalFeedback, rerender } = setup({ enabled: true, items: [] })
    rerender({ enabled: true, items: ['a'] })
    expect(globalFeedback.show).toHaveBeenCalledTimes(1)
    expect(globalFeedback.show.mock.calls[0][0].text).toBe('a')
  })

  it('never fires while disabled, and seeds only once enabled', () => {
    const { globalFeedback, rerender } = setup({ enabled: false, items: ['a'] })
    rerender({ enabled: false, items: ['a', 'b'] })
    expect(globalFeedback.show).not.toHaveBeenCalled()
    // Enabling now seeds the current backlog silently…
    rerender({ enabled: true, items: ['a', 'b'] })
    expect(globalFeedback.show).not.toHaveBeenCalled()
    // …and only later arrivals narrate.
    rerender({ enabled: true, items: ['a', 'b', 'c'] })
    expect(globalFeedback.show).toHaveBeenCalledTimes(1)
    expect(globalFeedback.show.mock.calls[0][0].text).toBe('c')
  })

  it('a remount with a backlog re-seeds silently (no replay on reconnect)', () => {
    // First mount seeds ['a','b'] and would fire nothing…
    const first = setup({ enabled: true, items: ['a', 'b'] })
    expect(first.globalFeedback.show).not.toHaveBeenCalled()
    // A fresh mount (PauseBoundary remount / deep-link) with the same backlog
    // must also stay silent — a fresh hook instance re-bootstraps.
    const second = setup({ enabled: true, items: ['a', 'b'] })
    expect(second.globalFeedback.show).not.toHaveBeenCalled()
  })
})
