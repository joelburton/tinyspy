// cs-blessed-found-words

/**
 * Tests for the shared word validate/submit engine. The cases that matter are the
 * ones a hand-rolled submit path gets wrong or duplicates: an accepted word fires the
 * send exactly once; the optimistic in-flight guard stops a same-word re-submit
 * from double-submitting during the realtime-lag window; the dedup is over the finds
 * I can see; a
 * non-legal word NEVER hits the RPC; and a failed send shows the server's
 * sentence and releases the word so a retry works. The engine says nothing of its
 * own, so what it decided is read off `onAnswer`; the answers a caller can act on
 * — which of them record a rejection, which reach `onAnswer` — are pinned at the
 * bottom.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ZTest_clearFaultMessages, ZTest_peekFaultMessages } from '@/common/faults/faultStore'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import {
  useFoundWordSubmit,
  type FoundWordSubmitConfig,
  type WordSubmitReport,
} from './useFoundWordSubmit'

import type { FoundWordsWord } from './foundWords'

const APPLE: FoundWordsWord = { word: 'apple', points: 5, pangram: false, bonus: false }
const ZESTY: FoundWordsWord = { word: 'zesty', points: 9, pangram: false, bonus: true }

/** A board of two words; everything else misses. */
const lookup = (w: string): FoundWordsWord | null =>
  w === 'apple' ? APPLE : w === 'zesty' ? ZESTY : null

function makeCfg(over: Partial<FoundWordSubmitConfig> = {}): FoundWordSubmitConfig {
  return {
    isMyTurn: true,
    minWordLength: 4,
    // A real slot: the one thing the hook shows (a send's not-ok) is read
    // back as its top message.
    localFeedbackSlot: createFeedbackSlot('local'),
    foundWords: [],
    lookup,
    send: vi.fn().mockResolvedValue(null), // null = the word landed
    onAnswer: vi.fn(),
    ...over,
  }
}

/** The last report the hook handed `onAnswer`. */
const lastReport = (cfg: FoundWordSubmitConfig): WordSubmitReport | undefined =>
  vi.mocked(cfg.onAnswer).mock.lastCall?.[0]

/** The message the hook last showed — the slot's top. */
const shown = (cfg: FoundWordSubmitConfig) => cfg.localFeedbackSlot.getTop()

/** Render the hook and give back a typed handle + the ability to swap config
 *  (e.g. to simulate a realtime `found_words` update mid-test). */
function setup(cfg: FoundWordSubmitConfig) {
  const view = renderHook((props: FoundWordSubmitConfig) => useFoundWordSubmit(props), {
    initialProps: cfg,
  })
  const type = (w: string) => act(() => view.result.current.setWord(w))
  const submit = async () => {
    await act(async () => {
      view.result.current.submit()
    })
  }
  return { ...view, type, submit }
}

beforeEach(() => ZTest_clearFaultMessages())

describe('useFoundWordSubmit', () => {
  it('accepts a legal word: fires send once and reports it with its entry', async () => {
    const cfg = makeCfg()
    const { result, type, submit } = setup(cfg)

    type('apple')
    await submit()

    expect(cfg.send).toHaveBeenCalledTimes(1)
    expect(cfg.send).toHaveBeenCalledWith(APPLE)
    expect(lastReport(cfg)).toEqual({ answer: 'accepted', word: 'apple', entry: APPLE })
    expect(result.current.word).toBe('') // box cleared
    expect(result.current.lastWord).toBe('apple')
  })

  it('shows nothing of its own for any answer', async () => {
    const cfg = makeCfg({ foundWords: [{ word: 'apple' }] })
    const { type, submit } = setup(cfg)

    for (const w of ['abc', 'zzzzz', 'apple', 'zesty']) {
      type(w)
      await submit()
    }
    expect(shown(cfg)).toBeNull()
  })

  it('an already-found word carries its entry, so a game can still dot a bonus word', async () => {
    const cfg = makeCfg()
    const { type, submit } = setup(cfg)

    type('zesty') // ZESTY is a bonus word
    await submit()
    type('zesty')
    await submit()
    expect(lastReport(cfg)).toEqual({ answer: 'already_found', word: 'zesty', entry: ZESTY })
  })

  it('guards against a same-word re-submit during the realtime-lag window', async () => {
    // First submit accepts + reserves 'apple' in the pending set. foundWords is
    // still empty (the realtime insert hasn't landed), so without the pending
    // guard the second submit would double-submit.
    const cfg = makeCfg()
    const { type, submit } = setup(cfg)

    type('apple')
    await submit()
    type('apple')
    await submit()

    expect(cfg.send).toHaveBeenCalledTimes(1)
    expect(lastReport(cfg)?.answer).toBe('already_found')
  })

  it('a same-tick double submit fires send once (input consumed synchronously)', async () => {
    const cfg = makeCfg()
    const { result, type } = setup(cfg)

    type('apple')
    // Two submits before any re-type: the first blanks the word ref synchronously,
    // so the second sees an empty box and no-ops.
    await act(async () => {
      result.current.submit()
      result.current.submit()
    })
    expect(cfg.send).toHaveBeenCalledTimes(1)
  })

  it('submits the word set in the SAME batch (fast tap-then-Submit, no effect flush)', async () => {
    // Regression: the tap-to-trace flow sets the word (setWord) and then the
    // player taps Submit. A Submit button's onClick runs synchronously,
    // but if `submit` read the word from a ref synced in a PASSIVE effect, a tap
    // in the state→paint gap would read a stale word — "tapped 3 tiles, submitted
    // 2 letters". Set + submit in ONE act (React hasn't flushed passive effects
    // between them) must still send the full word. `setWord` keeps the ref
    // current synchronously, so it does.
    const cfg = makeCfg()
    const { result } = setup(cfg)

    await act(async () => {
      result.current.setWord('apple')
      result.current.submit()
    })

    expect(cfg.send).toHaveBeenCalledTimes(1)
    expect(cfg.send).toHaveBeenCalledWith(APPLE)
  })

  it('refuses a word anyone in the visible finds has — the seat rule decides whose those are', async () => {
    // Whoever found 'apple', it is in the finds I can see: a teammate's in
    // coop, only my own mid-race in compete, where a rival's rows never
    // reach here and their words stay mine to find.
    const cfg = makeCfg({ foundWords: [{ word: 'apple' }] })
    const { type, submit } = setup(cfg)
    type('apple')
    await submit()
    expect(cfg.send).not.toHaveBeenCalled()
    expect(lastReport(cfg)?.answer).toBe('already_found')
  })

  it('reports a too-short word, and does not send', async () => {
    const cfg = makeCfg({ minWordLength: 4 })
    const { type, submit } = setup(cfg)

    type('ab')
    await submit()
    expect(cfg.send).not.toHaveBeenCalled()
    expect(lastReport(cfg)).toEqual({ answer: 'too_short', word: 'ab' })
  })

  it('reports a non-legal word, and does not send', async () => {
    const cfg = makeCfg()
    const { type, submit } = setup(cfg)

    type('qqqq')
    await submit()
    expect(cfg.send).not.toHaveBeenCalled()
    expect(lastReport(cfg)).toEqual({ answer: 'not_legal', word: 'qqqq' })
  })

  it('is a no-op unless the move is mine — the game over, or I am out', async () => {
    const cfg = makeCfg({ isMyTurn: false })
    const { type, submit } = setup(cfg)

    type('apple')
    await submit()
    expect(cfg.send).not.toHaveBeenCalled()
    expect(cfg.onAnswer).not.toHaveBeenCalled()
  })

  it('shows the server\'s sentence on a failed send, and releases the word so a retry succeeds', async () => {
    // A FAULT envelope — what `runRpc` builds when nothing answered. The game's
    // send hands it straight back; the hook reads its severity, not its words.
    const cfg = makeCfg({
      send: vi
      .fn()
      .mockResolvedValueOnce({
        type: 'not-ok', data: null, outcome: null, severity: 'fault',
        message: 'You appear to be offline. Please refresh and try again.',
        field: null, meta: null, dbcode: 'FE001', detail: null,
      })
      .mockResolvedValueOnce(null),
    })
    const { type, submit } = setup(cfg)

    type('apple')
    await submit()
    // The send lost → the word is freed and the server's own sentence goes
    // up as a notOk — in red (the `fault` severity's default), and × only. The
    // modal is raised centrally by `runRpc`, not here — so the slot carries the
    // words rather than going blank.
    expect(shown(cfg)?.kind).toBe('notOk')
    expect(shown(cfg)?.outcome).toBe('error')
    expect(shown(cfg)?.text).toBe('You appear to be offline. Please refresh and try again.')

    // Retyping + resubmitting is allowed (not stuck on "already found").
    type('apple')
    await submit()
    expect(cfg.send).toHaveBeenCalledTimes(2)
    expect(lastReport(cfg)?.answer).toBe('accepted')
  })

  it('raises a fault when the send THROWS rather than answering', async () => {
    // `runRpc` resolves for every answer it can classify, so a rejected promise
    // is a bug in the caller, not a refusal — and it gets the modal, not a pill.
    const cfg = makeCfg({ send: vi.fn().mockRejectedValue(new Error('boom')) })
    const { type, submit } = setup(cfg)

    type('apple')
    await submit()

    expect(ZTest_peekFaultMessages()).toHaveLength(1)
    expect(ZTest_peekFaultMessages()[0]?.text).toContain('BUG')
  })

  // ── What the caller's two callbacks are told ───────────────────────────────
  // The rule is a split: `recordReject` WRITES (wordiply logs the rejection and
  // it can cost a turn), `onAnswer` only shows. So the already-found answer
  // reaches one and not the other, and nothing but these cases holds that.

  it('records a rejection for too-short and not-legal, and NOT for already-found', async () => {
    const recordReject = vi.fn()
    const cfg = makeCfg({ recordReject, foundWords: [{ word: 'apple' }] })
    const { type, submit } = setup(cfg)

    type('abc') // under minWordLength
    await submit()
    type('zzzzz') // not on the legal list
    await submit()
    type('apple') // already in foundWords
    await submit()

    expect(recordReject.mock.calls).toEqual([
      ['abc', 'too_short'],
      ['zzzzz', 'not_legal'],
    ])
  })

  it('tells onAnswer about every answer, already-found included', async () => {
    const cfg = makeCfg({ foundWords: [{ word: 'apple' }] })
    const { type, submit } = setup(cfg)

    type('abc')
    await submit()
    type('zzzzz')
    await submit()
    type('apple')
    await submit()
    type('zesty')
    await submit()

    expect(vi.mocked(cfg.onAnswer).mock.calls.map(([r]) => r.answer)).toEqual([
      'too_short',
      'not_legal',
      'already_found',
      'accepted',
    ])
  })

  it('normalizes the word for lookup but recalls the raw text', async () => {
    const cfg = makeCfg()
    const { result, type, submit } = setup(cfg)

    type('  ApPle  ')
    await submit()

    // The lookup key is trimmed + lowercased, so a word typed loosely still
    // finds its entry and is reported normalized…
    expect(cfg.send).toHaveBeenCalledWith(APPLE)
    expect(lastReport(cfg)?.word).toBe('apple')
    // …while recall keeps what was actually typed, which is the point of it:
    // ArrowUp is for fixing a typo, not for reading back a normalized key.
    expect(result.current.lastWord).toBe('  ApPle  ')
  })
})
