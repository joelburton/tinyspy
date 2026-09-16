// cs-blessed-board-marks

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTENTION_FADE_MS, WORD_ANSWER_MS } from './feedbackTiming'
import { useAnnouncedMark } from './useAnnouncedMark'

describe('useAnnouncedMark', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('points first, answers when the attention flash has faded, then goes', () => {
    const { result } = renderHook(() => useAnnouncedMark<string>())
    act(() => result.current[1]('PRIDE'))
    expect(result.current[0]).toEqual({ value: 'PRIDE', phase: 'pointing' })

    // The changeover is at the fade, not a moment before: earlier would paint the
    // answer's color under a flash still on top of it.
    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS - 1))
    expect(result.current[0]?.phase).toBe('pointing')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toEqual({ value: 'PRIDE', phase: 'answering' })

    act(() => vi.advanceTimersByTime(WORD_ANSWER_MS - 1))
    expect(result.current[0]).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBeNull()
  })

  it('skips the announcement for a player already looking', () => {
    const { result } = renderHook(() => useAnnouncedMark<string>())
    act(() => result.current[1]('MINE', { announce: false }))
    expect(result.current[0]).toEqual({ value: 'MINE', phase: 'answering' })

    // …and the answer gets its full beat, not the leftover of a lead it skipped.
    act(() => vi.advanceTimersByTime(WORD_ANSWER_MS - 1))
    expect(result.current[0]).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBeNull()
  })

  it('restarts the whole sequence when a second mark arrives', () => {
    const { result } = renderHook(() => useAnnouncedMark<string>())
    act(() => result.current[1]('FIRST'))
    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS + 100)) // into the answer
    expect(result.current[0]?.phase).toBe('answering')

    act(() => result.current[1]('SECOND'))
    expect(result.current[0]).toEqual({ value: 'SECOND', phase: 'pointing' })
    // The first mark's clear-timer is canceled, not inherited.
    act(() => vi.advanceTimersByTime(WORD_ANSWER_MS))
    expect(result.current[0]).not.toBeNull()
  })

  it('runs onEnd when the mark comes off, with the answer it was raised for', () => {
    const ended: string[] = []
    const { result } = renderHook(() => useAnnouncedMark<string>())
    act(() => result.current[1]('PRIDE', { onEnd: () => ended.push('PRIDE') }))
    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS + WORD_ANSWER_MS))
    expect(ended).toEqual(['PRIDE'])
  })

  it('does not run onEnd for a mark that was cleared', () => {
    // A cleared mark did not finish — the caller interrupted it, and knows more
    // about what should happen next than the hook does.
    const ended: string[] = []
    const { result } = renderHook(() => useAnnouncedMark<string>())
    act(() => result.current[1]('PRIDE', { onEnd: () => ended.push('PRIDE') }))
    act(() => result.current[2]())
    expect(result.current[0]).toBeNull()
    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS + WORD_ANSWER_MS))
    expect(ended).toEqual([])
  })

  it('does not fire after unmount', () => {
    const { result, unmount } = renderHook(() => useAnnouncedMark<string>())
    act(() => result.current[1]('PRIDE'))
    unmount()
    expect(() =>
      act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS + WORD_ANSWER_MS)),
    ).not.toThrow()
  })
})
