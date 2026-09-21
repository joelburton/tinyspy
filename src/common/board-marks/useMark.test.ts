// cs-blessed-board-marks

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTENTION_FADE_MS } from './feedbackTiming'
import { useMark } from './useMark'

type Answer = { word: string; outcome: string }

describe('useMark', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts with nothing up', () => {
    const { result } = renderHook(() => useMark<Answer>(1000))
    expect(result.current[0]).toBeNull()
  })

  it('shows a mark and takes it down after the beat', () => {
    const { result } = renderHook(() => useMark<Answer>(1000))
    act(() => result.current[1]({ word: 'CAT', outcome: 'lost' }))
    expect(result.current[0]?.value).toEqual({ word: 'CAT', outcome: 'lost' })
    // A mark that did not ask to announce itself is answering from the start,
    // so a plain flash never reads the phase at all.
    expect(result.current[0]?.phase).toBe('answer')

    act(() => vi.advanceTimersByTime(999))
    expect(result.current[0]).not.toBeNull() // not yet
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBeNull()
  })

  it('points first when asked, changes over at the fade, then goes', () => {
    const { result } = renderHook(() => useMark<string>(1000))
    act(() => result.current[1]('PRIDE', { attention: true }))
    expect(result.current[0]).toEqual({ value: 'PRIDE', phase: 'attention', nonce: 1 })

    // The changeover is at the fade, not a moment before: earlier would paint
    // the answer's color under a flash still on top of it.
    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS - 1))
    expect(result.current[0]?.phase).toBe('attention')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]?.phase).toBe('answer')

    // …and the answer gets its FULL beat after the fade, not a share of one.
    act(() => vi.advanceTimersByTime(999))
    expect(result.current[0]).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBeNull()
  })

  it('stands until cleared when it has no clock', () => {
    // `ms: null` — the "until the next action" lifetime: a refused word that
    // the next keystroke takes off, with nothing on a timer to end it.
    const { result } = renderHook(() => useMark<string>(null))
    act(() => result.current[1]('ABD'))
    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current[0]?.value).toBe('ABD')

    act(() => result.current[2]())
    expect(result.current[0]).toBeNull()
  })

  it('announces a clockless mark too, then stands in the answer', () => {
    const { result } = renderHook(() => useMark<string>(null))
    act(() => result.current[1]('MINE', { attention: true }))
    expect(result.current[0]?.phase).toBe('attention')
    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS))
    expect(result.current[0]?.phase).toBe('answer')
    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current[0]?.phase).toBe('answer') // and it is still up
  })

  it('restarts the beat when shown again, and the older timer cannot reach the newer mark', () => {
    // A second refusal replaces the first and gets its own full beat, rather
    // than inheriting what was left of the last one — and the first one's
    // clock, which is now mid-flight, must not take the second one down.
    const { result } = renderHook(() => useMark<Answer>(1000))
    act(() => result.current[1]({ word: 'CAT', outcome: 'lost' }))
    act(() => vi.advanceTimersByTime(800))
    act(() => result.current[1]({ word: 'DOG', outcome: 'warning' }))
    expect(result.current[0]?.value).toEqual({ word: 'DOG', outcome: 'warning' })

    act(() => vi.advanceTimersByTime(200)) // where the FIRST mark's beat ended
    expect(result.current[0]?.value).toEqual({ word: 'DOG', outcome: 'warning' })
    act(() => vi.advanceTimersByTime(799))
    expect(result.current[0]).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBeNull()
  })

  it('counts the raises, and keeps counting across a clear', () => {
    // The nonce is what a board keys its marked pieces on, so it has to change
    // even when a clear sits between two raises of the same thing — otherwise
    // the piece is the same element and its animation does not replay.
    const { result } = renderHook(() => useMark<string>(1000))
    act(() => result.current[1]('CAT'))
    expect(result.current[0]?.nonce).toBe(1)
    act(() => result.current[1]('CAT'))
    expect(result.current[0]?.nonce).toBe(2)

    act(() => result.current[2]())
    act(() => result.current[1]('CAT'))
    expect(result.current[0]?.nonce).toBe(3)
  })

  it('runs onEnd when the clock ends the mark, with the answer it was raised for', () => {
    const ended: string[] = []
    const { result } = renderHook(() => useMark<string>(1000))
    act(() => result.current[1]('PRIDE', { onEnd: () => ended.push('PRIDE') }))
    act(() => vi.advanceTimersByTime(1000))
    expect(ended).toEqual(['PRIDE'])
  })

  it('does not run onEnd for a mark that was cleared', () => {
    // A cleared mark did not finish — the caller interrupted it, and knows more
    // about what should happen next than the hook does.
    const ended: string[] = []
    const { result } = renderHook(() => useMark<string>(1000))
    act(() => result.current[1]('PRIDE', { onEnd: () => ended.push('PRIDE') }))
    act(() => result.current[2]())
    expect(result.current[0]).toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(ended).toEqual([])
  })

  it('never runs onEnd for a mark with no clock', () => {
    // Nothing ends it but the caller, and the caller ending it is a clear.
    const ended: string[] = []
    const { result } = renderHook(() => useMark<string>(null))
    act(() => result.current[1]('ABD', { onEnd: () => ended.push('ABD') }))
    act(() => vi.advanceTimersByTime(60_000))
    expect(ended).toEqual([])
  })

  it('clears on demand, without waiting for the beat', () => {
    const { result } = renderHook(() => useMark<Answer>(1000))
    act(() => result.current[1]({ word: 'CAT', outcome: 'lost' }))
    act(() => result.current[2]())
    expect(result.current[0]).toBeNull()
    act(() => result.current[1]({ word: 'DOG', outcome: 'won' }))
    act(() => vi.advanceTimersByTime(999))
    expect(result.current[0]?.value).toEqual({ word: 'DOG', outcome: 'won' })
  })

  it('does not render when clearing an empty board', () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders++
      return useMark<string>(1000)
    })
    const before = renders
    act(() => result.current[2]())
    expect(renders).toBe(before)
  })

  it('hands back the same mark object while nothing about it changes', () => {
    // Callers derive from the mark — a hot set, a memoized answer — so a fresh
    // object on a render the mark had no part in would re-run all of that.
    const { result, rerender } = renderHook(({ n }: { n: number }) => [n, useMark<string>(1000)] as const, {
      initialProps: { n: 1 },
    })
    act(() => result.current[1][1]('CAT'))
    const mark = result.current[1][0]
    rerender({ n: 2 })
    expect(result.current[1][0]).toBe(mark)
  })

  it('can be shown during render', () => {
    // The raise that has to land in the same commit as the change it points at:
    // the caller compares renders and raises from its own render body. The latch
    // stands in for the caller's own (connections keeps it in state).
    const raisedFor = { current: null as string | null }
    const { result, rerender } = renderHook(
      ({ word }: { word: string | null }) => {
        const mark = useMark<string>(1000)
        if (word !== null && raisedFor.current !== word) {
          raisedFor.current = word
          mark[1](word)
        }
        return mark
      },
      { initialProps: { word: null as string | null } },
    )
    expect(result.current[0]).toBeNull()

    rerender({ word: 'PRIDE' })
    expect(result.current[0]?.value).toBe('PRIDE')
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current[0]).toBeNull()
  })

  it('does not fire after unmount', () => {
    const ended: string[] = []
    const { result, unmount } = renderHook(() => useMark<Answer>(1000))
    act(() => result.current[1]({ word: 'CAT', outcome: 'lost' }, { onEnd: () => ended.push('CAT') }))
    unmount()
    // No "setState on an unmounted component" — the effect's cleanup took the
    // timers with it, and a mark that never finished runs no `onEnd`.
    expect(() => act(() => vi.advanceTimersByTime(1000))).not.toThrow()
    expect(ended).toEqual([])
  })
})
