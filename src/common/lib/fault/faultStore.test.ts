/**
 * The fault store + the ROUTING guard: a `fault: true` message handed to a
 * feedback sink must reach the modal queue, never slot state. This is the
 * contract that let GenericFeedbackPill's bare-red branch be deleted — if the
 * routing ever regresses, faults would silently vanish (no pill branch left
 * to catch them), which is why this file exists.
 * (Guard verified by planting: disable the sink's fault branch and the
 * routing tests fail.)
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearFaultsForTest, dismissFault, presentFault, useCurrentFault } from './faultStore'
import { useLocalFeedback } from '../../hooks/feedback/useLocalFeedback'
import { failureMessage } from '../game/serverError'

afterEach(() => {
  clearFaultsForTest()
  vi.restoreAllMocks()
})

describe('faultStore', () => {
  it('queues FIFO and dismisses to the next', () => {
    const { result } = renderHook(() => useCurrentFault())
    act(() => {
      presentFault({ text: 'one' })
      presentFault({ text: 'two' })
    })
    expect(result.current?.text).toBe('one')
    act(() => dismissFault())
    expect(result.current?.text).toBe('two')
    act(() => dismissFault())
    expect(result.current).toBeNull()
  })

  it('caps the queue at 5 — overflow is silently dropped from the UI', () => {
    // Joel's ruling D: no batching, no filtering; beyond the cap a new fault
    // just doesn't get a modal. (Its [db] console line already fired — the
    // classifier logs before any routing.)
    const { result } = renderHook(() => useCurrentFault())
    act(() => {
      for (let i = 1; i <= 8; i++) presentFault({ text: `f${i}` })
    })
    const seen: unknown[] = []
    for (let i = 0; i < 6; i++) {
      seen.push(result.current?.text ?? null)
      act(() => dismissFault())
    }
    expect(seen).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', null])
  })
})

describe('routing: a fault never reaches slot state', () => {
  it('useLocalFeedback sends fault messages to the modal queue, not the slot', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const slot = renderHook(() => useLocalFeedback())
    const modal = renderHook(() => useCurrentFault())

    // A real classified fault (unknown key + SQLSTATE) — diagnostics included.
    const fault = failureMessage({ message: 'planted-key|x|', code: 'P0001' }, 'word')
    expect(fault.fault).toBe(true)

    act(() => slot.result.current.showLocalFeedback(fault))
    expect(slot.result.current.localFeedback).toBeNull()
    expect(modal.result.current?.text).toBe('word|planted-key|x|')
    expect(modal.result.current?.diagnostics).toContain('key=planted-key')
    expect(modal.result.current?.diagnostics).toContain('code=P0001')
  })

  it('a normal pill still lands in the slot untouched', () => {
    const slot = renderHook(() => useLocalFeedback())
    const modal = renderHook(() => useCurrentFault())
    act(() =>
      slot.result.current.showLocalFeedback({
        tone: 'info', text: 'Game over', mode: { kind: 'sticky' },
      }),
    )
    expect(slot.result.current.localFeedback?.text).toBe('Game over')
    expect(modal.result.current).toBeNull()
  })
})
