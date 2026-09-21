// cs-met-found-words

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/**
 * Tests for the shared word validate/submit engine. The cases that matter are the
 * ones a hand-rolled submit path gets wrong or duplicates: an accepted word fires the
 * commit exactly once and shows the pill (with the bonus dot); the optimistic
 * in-flight guard stops a same-word re-submit from double-committing during the
 * realtime-lag window (code-review §1.4); dedup is mode-aware; a non-legal word is
 * rejected with the per-game reason and NEVER hits the RPC; and a failed commit
 * releases the word so a retry works.
 */
import { clearFaultsForTest } from '@/common/faults/faultStore'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { useFoundWordSubmit, type FoundWordSubmitConfig, type WordEntry } from './useFoundWordSubmit'

const APPLE: WordEntry = { word: 'apple', points: 5, isBonus: false }
const ZESTY: WordEntry = { word: 'zesty', points: 9, isBonus: true }

/** A legal list of two words; everything else misses. */
const lookup = (w: string): WordEntry | null =>
  w === 'apple' ? APPLE : w === 'zesty' ? ZESTY : null

function makeCfg(over: Partial<FoundWordSubmitConfig> = {}): FoundWordSubmitConfig {
  return {
    mode: 'coop',
    userId: 'u1',
    isTerminal: false,
    minWordLength: 4,
    // A real slot: what the hook shows is read back as its top message.
    localFeedbackSlot: createFeedbackSlot('local'),
    foundWords: [],
    lookup,
    commit: vi.fn().mockResolvedValue(null), // null = the word landed
    explainReject: () => 'not a word',
    // A stand-in reading, not a default: the hook has none, and each game says
    // its own. These cases are about WHICH branch ran, so the words below are
    // the ones the roster's majority uses (boggle, spellingbee, wordwheel) —
    // including `accepted`, which routes through here like every other answer.
    outcomeFor: (_w, answer) =>
      answer === 'accepted' ? 'won' : answer === 'not_legal' ? 'lost' : 'warning',
    ...over,
  }
}

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

beforeEach(() => clearFaultsForTest())

describe('useFoundWordSubmit', () => {
  it('accepts a legal word: fires commit once and shows a success pill', async () => {
    const cfg = makeCfg()
    const { result, type, submit } = setup(cfg)

    type('apple')
    await submit()

    expect(cfg.commit).toHaveBeenCalledTimes(1)
    expect(cfg.commit).toHaveBeenCalledWith(APPLE)
    expect(shown(cfg)?.kind).toBe('result')
    expect(shown(cfg)?.outcome).toBe('won')
    expect(shown(cfg)?.text).toBe('APPLE — +5')
    expect(result.current.word).toBe('') // box cleared
    expect(result.current.lastWord).toBe('apple')
  })

  it('with hideAccepted, an accepted word commits but shows nothing; a rejection still shows', async () => {
    const cfg = makeCfg({ hideAccepted: true, explainReject: () => 'not a word' })
    const { type, submit } = setup(cfg)

    type('apple')
    await submit()
    expect(cfg.commit).toHaveBeenCalledWith(APPLE)
    expect(shown(cfg)).toBeNull()

    type('zzzzz')
    await submit()
    expect(shown(cfg)?.text).toBe('ZZZZZ — not a word')
  })

  it('appends the bonus dot for a bonus word, not for a required word', async () => {
    const cfg = makeCfg()
    const { type, submit } = setup(cfg)

    // Bonus dot sits right after the word, before the em-dash.
    type('zesty')
    await submit()
    expect(shown(cfg)?.text).toBe('ZESTY • — +9')

    type('apple')
    await submit()
    expect(shown(cfg)?.text).toBe('APPLE — +5')
  })

  it('keeps the bonus dot on an already-found bonus word', async () => {
    const cfg = makeCfg()
    const { type, submit } = setup(cfg)

    type('zesty') // ZESTY is a bonus word
    await submit()
    type('zesty')
    await submit()
    expect(shown(cfg)?.text).toBe('ZESTY • — already found')
  })

  it('guards against a same-word re-submit during the realtime-lag window', async () => {
    // First submit accepts + reserves 'apple' in the pending set. foundWords is
    // still empty (the realtime insert hasn't landed), so without the pending
    // guard the second submit would double-commit.
    const cfg = makeCfg()
    const { type, submit } = setup(cfg)

    type('apple')
    await submit()
    type('apple')
    await submit()

    expect(cfg.commit).toHaveBeenCalledTimes(1)
    expect(shown(cfg)?.outcome).toBe('warning')
    expect(shown(cfg)?.text).toMatch(/already found/i)
  })

  it('a same-tick double submit fires commit once (input consumed synchronously)', async () => {
    const cfg = makeCfg()
    const { result, type } = setup(cfg)

    type('apple')
    // Two submits before any re-type: the first blanks the word ref synchronously,
    // so the second sees an empty box and no-ops.
    await act(async () => {
      result.current.submit()
      result.current.submit()
    })
    expect(cfg.commit).toHaveBeenCalledTimes(1)
  })

  it('submits the word set in the SAME batch (fast tap-then-Submit, no effect flush)', async () => {
    // Regression: the tap-to-trace flow sets the word (setWord) and then the
    // player taps Submit. A Submit button's onClick is committed synchronously,
    // but if `submit` read the word from a ref synced in a PASSIVE effect, a tap
    // in the commit→paint gap would read a stale word — "tapped 3 tiles, submitted
    // 2 letters". Set + submit in ONE act (React hasn't flushed passive effects
    // between them) must still commit the full word. `setWord` keeps the ref
    // current synchronously, so it does.
    const cfg = makeCfg()
    const { result } = setup(cfg)

    await act(async () => {
      result.current.setWord('apple')
      result.current.submit()
    })

    expect(cfg.commit).toHaveBeenCalledTimes(1)
    expect(cfg.commit).toHaveBeenCalledWith(APPLE)
  })

  it('coop dedups across players; compete dedups per player', async () => {
    // A teammate already found 'apple'.
    const found = [{ word: 'apple', user_id: 'u2' }]

    const coop = makeCfg({ mode: 'coop', foundWords: found })
    const c1 = setup(coop)
    c1.type('apple')
    await c1.submit()
    expect(coop.commit).not.toHaveBeenCalled()
    expect(shown(coop)?.text).toMatch(/already found/i)

    // In compete, a different player's find does NOT block me.
    const compete = makeCfg({ mode: 'compete', userId: 'u1', foundWords: found })
    const c2 = setup(compete)
    c2.type('apple')
    await c2.submit()
    expect(compete.commit).toHaveBeenCalledTimes(1)
  })

  it('shows the game\'s own outcome for a too-short word, and does not commit', async () => {
    const cfg = makeCfg({ minWordLength: 4 })
    const { type, submit } = setup(cfg)

    type('ab')
    await submit()
    expect(cfg.commit).not.toHaveBeenCalled()
    expect(shown(cfg)?.outcome).toBe('warning')
    expect(shown(cfg)?.text).toMatch(/too short/i)
  })

  it('shows the game\'s own outcome for a non-legal word, via explainReject', async () => {
    const cfg = makeCfg({ explainReject: () => 'not on board' })
    const { type, submit } = setup(cfg)

    type('qqqq')
    await submit()
    expect(cfg.commit).not.toHaveBeenCalled()
    expect(shown(cfg)?.outcome).toBe('lost')
    expect(shown(cfg)?.text).toBe('QQQQ — not on board')
  })

  it('formats a pangram accept as "WORD — pangram +N"', async () => {
    // A pangram entry (spellingbee) gets the "pangram" prefix; a bonus pangram
    // also gets the dot after the word.
    const PANGRAM = { word: 'abcdefg', points: 17, isBonus: true, isPangram: true }
    const cfg = makeCfg({ lookup: (w) => (w === 'abcdefg' ? PANGRAM : null) })
    const { type, submit } = setup(cfg)

    type('abcdefg')
    await submit()
    expect(shown(cfg)?.text).toBe('ABCDEFG • — pangram +17')
  })

  it('is a no-op once terminal', async () => {
    const cfg = makeCfg({ isTerminal: true })
    const { type, submit } = setup(cfg)

    type('apple')
    await submit()
    expect(cfg.commit).not.toHaveBeenCalled()
    expect(shown(cfg)).toBeNull()
  })

  it('releases the word on a failed commit so a retry succeeds', async () => {
    // A FAULT envelope — what `runRpc` builds when nothing answered. The game's
    // commit hands it straight back; the hook reads its severity, not its words.
    const commit = vi
      .fn()
      .mockResolvedValueOnce({
        type: 'not-ok', data: null, outcome: null, severity: 'fault',
        message: 'You appear to be offline. Please refresh and try again.',
        field: null, meta: null, dbcode: 'FE001', detail: null,
      })
      .mockResolvedValueOnce(null)
    const cfg = makeCfg({ commit })
    const { type, submit } = setup(cfg)

    type('apple')
    await submit()
    // The commit lost → the word is freed and the server's own sentence goes
    // up as a notOk — over the optimistic "+N", in red (the `fault` severity's
    // default), and × only. The modal is raised centrally by `runRpc`, not
    // here — so the slot carries the words rather than going blank.
    expect(shown(cfg)?.kind).toBe('notOk')
    expect(shown(cfg)?.outcome).toBe('error')
    expect(shown(cfg)?.text).toBe('You appear to be offline. Please refresh and try again.')

    // Retyping + resubmitting is allowed (not stuck on "already found"). The
    // notOk keeps its place until its ×; the new result sits under it.
    cfg.localFeedbackSlot.close()
    type('apple')
    await submit()
    expect(commit).toHaveBeenCalledTimes(2)
    expect(shown(cfg)?.outcome).toBe('won')
  })
})
