// cs-blessed-common-hosts

/**
 * The fault store's queue: faults come out in the order they went in, and the
 * queue is capped.
 *
 * Nothing here checks that a fault stays out of a pill slot, because no code
 * could put it in one — a fault raises its modal inside the wrapper
 * (`reportDbFault`), before a call site has an answer to hand a feedback sink.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearFaultsForTest, dismissFaultModal, showFaultModal, useCurrentFault } from './faultStore'

afterEach(() => {
  clearFaultsForTest()
  vi.restoreAllMocks()
})

describe('faultStore', () => {
  it('queues FIFO and dismisses to the next', () => {
    const { result } = renderHook(() => useCurrentFault())
    act(() => {
      showFaultModal({ text: 'one' })
      showFaultModal({ text: 'two' })
    })
    expect(result.current?.text).toBe('one')
    act(() => dismissFaultModal())
    expect(result.current?.text).toBe('two')
    act(() => dismissFaultModal())
    expect(result.current).toBeNull()
  })

  it('caps the queue at 5 — overflow is silently dropped from the UI', () => {
    // The rule: no batching, no filtering. Beyond the cap a new fault simply
    // gets no modal — and nothing is lost to diagnosis, because whoever routed
    // it wrote its [db] console line before ever reaching the queue.
    const { result } = renderHook(() => useCurrentFault())
    act(() => {
      for (let i = 1; i <= 8; i++) showFaultModal({ text: `f${i}` })
    })
    const seen: unknown[] = []
    for (let i = 0; i < 6; i++) {
      seen.push(result.current?.text ?? null)
      act(() => dismissFaultModal())
    }
    expect(seen).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', null])
  })
})
