// cs-audited-feedback

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFeedbackSlot } from './feedbackSlotStore'
import { FeedbackMessage, KINDS } from './FeedbackMessage'

/**
 * The slot's list rules, tested without React: the lowest rank shows, ties go
 * to the newest, nothing is discarded on the way in so the message underneath
 * is drawn again when the top one goes, a timer kind retracts itself,
 * `dismiss` and `close` each remove the top only when its kind leaves that
 * way, and `destroy` clears every timer.
 */

const moth = { username: 'moth', color: 'green' }
const over = { pillText: 'Won: all found', infoColText: 'You won!', outcome: 'won' as const }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createFeedbackSlot — which message shows', () => {
  it('starts empty', () => {
    const slot = createFeedbackSlot('local')
    expect(slot.getTop()).toBeNull()
    expect(slot.peek()).toEqual([])
  })

  it('draws the lowest rank, whatever order they arrived in', () => {
    const slot = createFeedbackSlot('local')
    const waiting = FeedbackMessage.waiting(moth)
    const verdict = FeedbackMessage.terminalVerdict(over)
    slot.show(waiting)
    slot.show(verdict)
    expect(slot.getTop()).toBe(verdict)
    // …and the lower one is still live underneath.
    expect(slot.peek().map((e) => e.message)).toEqual([verdict, waiting])
  })

  it('a not-ok shows over the verdict, and the verdict is back when it is closed', () => {
    const slot = createFeedbackSlot('local')
    const verdict = FeedbackMessage.terminalVerdict(over)
    slot.show(verdict)
    const notOk = FeedbackMessage.result('warning', 'Someone got there first', { ...KINDS.notOk })
    slot.show(notOk)
    expect(slot.getTop()).toBe(notOk)
    slot.close()
    expect(slot.getTop()).toBe(verdict)
  })

  it('ties within a rank go to the newest', () => {
    const slot = createFeedbackSlot('local')
    const first = FeedbackMessage.note('first')
    const second = FeedbackMessage.note('second', { rank: first.rank + 1 })
    slot.show(first)
    slot.show(second)
    expect(slot.getTop()).toBe(first)
    // Same rank → newest wins, and the older one stays live underneath.
    const third = FeedbackMessage.note('third')
    slot.show(third)
    expect(slot.getTop()).toBe(third)
    expect(slot.peek()).toHaveLength(3)
  })

  it('a message never takes its rank-mate down: retracting the newer draws the older', () => {
    // The letterboxed case — two conditions of one rank, each owned by its own
    // effect. The second must not end the first, because the first's owner
    // showed it on a rising edge and will not show it again.
    const slot = createFeedbackSlot('local')
    const wait = FeedbackMessage.note('Waiting on the chain')
    const full = FeedbackMessage.note('Chain is full — remove a word')
    slot.show(wait)
    const fullId = slot.show(full)
    expect(slot.getTop()).toBe(full)
    slot.retract(fullId)
    expect(slot.getTop()).toBe(wait)
  })

  it('the hint is still there under "Not a word", and back when that clears', () => {
    const slot = createFeedbackSlot('local')
    const hint = FeedbackMessage.hint('noted', 'Hint: a fruit')
    slot.show(hint)
    slot.show(FeedbackMessage.result('lost', 'Not a word'))
    expect(slot.getTop()?.text).toBe('Not a word')
    slot.dismiss()
    expect(slot.getTop()).toBe(hint)
  })
})

describe('createFeedbackSlot — how a message leaves', () => {
  it('retract(id) removes that message; an unknown id is a no-op', () => {
    const slot = createFeedbackSlot('local')
    const id = slot.show(FeedbackMessage.waiting(moth))
    slot.retract('nope')
    expect(slot.getTop()).not.toBeNull()
    slot.retract(id)
    expect(slot.getTop()).toBeNull()
    slot.retract(id)
    expect(slot.getTop()).toBeNull()
  })

  it('a timer kind retracts itself after its ms', () => {
    const slot = createFeedbackSlot('global')
    slot.show(FeedbackMessage.peer(moth, 'won', 'found APPLE'))
    vi.advanceTimersByTime(KINDS.peer.ms! - 1)
    expect(slot.getTop()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(slot.getTop()).toBeNull()
  })

  it('each timed message runs its own clock, so an older one expiring leaves the newer alone', () => {
    const slot = createFeedbackSlot('global')
    slot.show(FeedbackMessage.peer(moth, 'won', 'first'))
    vi.advanceTimersByTime(KINDS.peer.ms! - 10)
    slot.show(FeedbackMessage.peer(moth, 'won', 'second'))
    // The first one's fuse runs out while the second is on top: it goes, and
    // the second keeps the full fuse it was shown with.
    vi.advanceTimersByTime(10)
    expect(slot.getTop()?.text).toBe('second')
    expect(slot.peek()).toHaveLength(1)
    vi.advanceTimersByTime(KINDS.peer.ms! - 10)
    expect(slot.getTop()).toBeNull()
  })

  it('a chat line shows over a narration, which is drawn again when the chat fades', () => {
    const slot = createFeedbackSlot('global')
    const found = FeedbackMessage.peer(moth, 'won', 'found APPLE')
    slot.show(found)
    slot.show(FeedbackMessage.chat(moth, 'nice one'))
    expect(slot.getTop()?.kind).toBe('chat')
    // Chat's fuse is the shorter one, and the narration still has time left.
    vi.advanceTimersByTime(KINDS.chat.ms!)
    expect(slot.getTop()).toBe(found)
  })

  it('dismiss() removes the top only when it leaves by gesture', () => {
    const slot = createFeedbackSlot('local')
    slot.show(FeedbackMessage.waiting(moth)) // owner-cleared
    slot.dismiss()
    expect(slot.getTop()).not.toBeNull()
    slot.show(FeedbackMessage.result('lost', 'Not a word')) // gesture
    slot.dismiss()
    expect(slot.getTop()?.kind).toBe('waiting')
  })

  it('close() removes the top only when it leaves by the ×', () => {
    const slot = createFeedbackSlot('local')
    slot.show(FeedbackMessage.result('lost', 'Not a word'))
    slot.close()
    expect(slot.getTop()).not.toBeNull()
    slot.show(FeedbackMessage.hint('noted', 'Hint: a fruit'))
    // The hint is rank 50, the result rank 40: the result is on top, and a
    // close does not reach past it.
    slot.close()
    expect(slot.peek()).toHaveLength(2)
    slot.dismiss()
    slot.close()
    expect(slot.getTop()).toBeNull()
  })

  it('a gesture never removes a hint — that is the point of the ×', () => {
    const slot = createFeedbackSlot('local')
    slot.show(FeedbackMessage.hint('noted', 'Hint: a fruit'))
    slot.dismiss()
    expect(slot.getTop()?.kind).toBe('hint')
  })

  it('destroy() clears every timer and empties the slot', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const slot = createFeedbackSlot('global')
    slot.show(FeedbackMessage.peer(moth, 'won', 'a'))
    slot.show(FeedbackMessage.chat(moth, 'b'))
    slot.destroy()
    expect(clearSpy).toHaveBeenCalled()
    expect(slot.getTop()).toBeNull()
    clearSpy.mockRestore()
  })
})

describe('createFeedbackSlot — the subscription', () => {
  it('notifies on a change of top and keeps the snapshot stable otherwise', () => {
    const slot = createFeedbackSlot('local')
    const listener = vi.fn()
    slot.subscribe(listener)
    const verdict = FeedbackMessage.terminalVerdict(over)
    slot.show(verdict)
    expect(listener).toHaveBeenCalledTimes(1)
    // A lower-priority message arriving underneath changes nothing on top.
    slot.show(FeedbackMessage.waiting(moth))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(slot.getTop()).toBe(verdict)
  })

  it('ids are unique across slots and calls', () => {
    const a = createFeedbackSlot('local')
    const b = createFeedbackSlot('global')
    const ids = [a.show(FeedbackMessage.note('x')), a.show(FeedbackMessage.prompt('y')), b.show(FeedbackMessage.note('z'))]
    expect(new Set(ids).size).toBe(3)
  })
})
