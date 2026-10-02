// cs-unmet

/**
 * The verdict fill's two raisers and two endings: my own answer shown through
 * `showFor`, which leaves with its pill; a teammate's wrong guess
 * arriving in the log, which marks their four and ends mine; a teammate's
 * correct guess, which ends it with no mark; and my own row arriving, which
 * ends nothing.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { EventRow } from './useGame'
import { useVerdictMark } from './useVerdictMark'

function row(id: number, userId: string, result: EventRow['result'], tiles: string[]): EventRow {
  const matched = result === 'correct'
  return {
    id, user_id: userId, tiles, result, matched,
    outcome: matched ? 'won' : result === 'oneAway' ? 'near' : 'lost',
    matched_category_rank: matched ? 0 : null, created_at: 't',
  }
}

const MY_WRONG = row(1, 'u1', 'wrong', ['a', 'b', 'e', 'i'])
const THEIR_WRONG = row(2, 'u2', 'wrong', ['c', 'd', 'f', 'g'])
const THEIR_MATCH = row(3, 'u2', 'correct', ['a', 'b', 'c', 'd'])

/** Mount over a log, with my own guess's answer already shown. */
function setup(guesses: EventRow[] = [], isViewingHistory = false) {
  const slot = createFeedbackSlot('local')
  const hook = renderHook(
    ({ guesses }: { guesses: EventRow[] }) =>
      useVerdictMark({ guesses, myId: 'u1', localFeedbackSlot: slot, isViewingHistory }),
    { initialProps: { guesses } },
  )
  return { ...hook, slot }
}

describe('useVerdictMark', () => {
  it('fills the tiles my answer is about, in its outcome, and shows the message', () => {
    const { result, slot } = setup()
    act(() => result.current.showFor(['a', 'b', 'e', 'i'], FeedbackMessage.result('lost', 'Wrong')))
    expect([...result.current.mark!.value.tiles]).toEqual(['a', 'b', 'e', 'i'])
    expect(result.current.mark!.value.outcome).toBe('lost')
    expect(slot.peek().map((e) => e.message.text)).toEqual(['Wrong'])
  })

  it('leaves with its pill', () => {
    const { result, slot } = setup()
    act(() => result.current.showFor(['a'], FeedbackMessage.result('lost', 'Wrong')))
    expect(result.current.mark).not.toBeNull()
    act(() => slot.dismiss())
    expect(result.current.mark).toBeNull()
  })

  it('survives my own row arriving back over realtime', () => {
    const { result, rerender } = setup()
    act(() => result.current.showFor(['a', 'b', 'e', 'i'], FeedbackMessage.result('lost', 'Wrong')))
    rerender({ guesses: [MY_WRONG] })
    expect(result.current.mark).not.toBeNull()
  })

  it('hands the mark to a teammate\'s wrong guess — their four, not mine', () => {
    const { result, rerender } = setup()
    act(() => result.current.showFor(['a', 'b', 'e', 'i'], FeedbackMessage.result('lost', 'Wrong')))
    rerender({ guesses: [THEIR_WRONG] })
    expect([...result.current.mark!.value.tiles]).toEqual(['c', 'd', 'f', 'g'])
  })

  it('goes when a teammate\'s guess is RIGHT — the band says it instead', () => {
    const { result, rerender } = setup()
    act(() => result.current.showFor(['e', 'f', 'g', 'm'], FeedbackMessage.result('near', 'One away')))
    rerender({ guesses: [THEIR_MATCH] })
    expect(result.current.mark).toBeNull()
  })

  it('marks nothing for a row arriving while a past turn is open', () => {
    const { result, rerender } = setup([], true)
    rerender({ guesses: [THEIR_WRONG] })
    expect(result.current.mark).toBeNull()
  })

  it('clears on demand', () => {
    const { result } = setup()
    act(() => result.current.showFor(['a'], FeedbackMessage.result('lost', 'Wrong')))
    act(() => result.current.clear())
    expect(result.current.mark).toBeNull()
  })
})
