// cs-blessed-deep

/**
 * The fault store: its FIFO queue, and the one thing a feedback sink does with
 * a message now — put it in the slot.
 *
 * It used to guard a routing rule as well: a `fault: true` message handed to a
 * sink had to reach the modal queue instead of slot state. That flag is gone
 * (2026-09-01). It existed because ONE classifier returned either a pill or a
 * fault and the sink had to tell them apart; a fault now raises its modal in
 * `runRpc`, before any call site has an answer to show, so nothing arrives at a
 * sink needing to be sorted. The rule it encoded still holds — a fault never
 * sits in a pill slot — but by construction rather than by a branch.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearFaultsForTest, dismissFaultModal, showFaultModal, useCurrentFault } from './faultStore'
import { useLocalFeedback } from '../../hooks/feedback/useLocalFeedback'

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
    // Joel's ruling D: no batching, no filtering; beyond the cap a new fault
    // just doesn't get a modal. (Its [db] console line already fired — the
    // classifier logs before any routing.)
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

describe('a sink puts what it is handed in the slot', () => {
  it('a normal pill still lands in the slot untouched', () => {
    const slot = renderHook(() => useLocalFeedback())
    const modal = renderHook(() => useCurrentFault())
    act(() =>
      slot.result.current.showLocalFeedback({
        tone: 'noted', text: 'Game over', mode: { kind: 'sticky' },
      }),
    )
    expect(slot.result.current.localFeedback?.text).toBe('Game over')
    expect(modal.result.current).toBeNull()
  })
})
