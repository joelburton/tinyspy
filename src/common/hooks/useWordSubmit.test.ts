import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/**
 * Tests for the shared word validate/submit engine. The cases that matter are the
 * ones the two games used to get wrong or duplicate: an accepted word fires the
 * commit exactly once and shows the pill (with the bonus dot); the optimistic
 * in-flight guard stops a same-word re-submit from double-committing during the
 * realtime-lag window (code-review §1.4); dedup is mode-aware; a non-legal word is
 * rejected with the per-game reason and NEVER hits the RPC; and a failed commit
 * releases the word so a retry works.
 */
import { useWordSubmit, type WordSubmitConfig, type WordEntry } from './useWordSubmit'

const APPLE: WordEntry = { word: 'apple', points: 5, isBonus: false }
const ZESTY: WordEntry = { word: 'zesty', points: 9, isBonus: true }

/** A legal list of two words; everything else misses. */
const lookup = (w: string): WordEntry | null =>
  w === 'apple' ? APPLE : w === 'zesty' ? ZESTY : null

function makeCfg(over: Partial<WordSubmitConfig> = {}): WordSubmitConfig {
  return {
    mode: 'coop',
    userId: 'u1',
    isTerminal: false,
    minWordLength: 4,
    foundWords: [],
    lookup,
    commit: vi.fn().mockResolvedValue({ error: null }),
    explainReject: () => ({ text: 'not a word', tone: 'error' }),
    successText: (e) => `${e.word.toUpperCase()} +${e.points}`,
    ...over,
  }
}

/** Render the hook and give back a typed handle + the ability to swap config
 *  (e.g. to simulate a realtime `found_words` update mid-test). */
function setup(cfg: WordSubmitConfig) {
  const view = renderHook((props: WordSubmitConfig) => useWordSubmit(props), {
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

describe('useWordSubmit', () => {
  it('accepts a legal word: fires commit once and shows a success pill', async () => {
    const cfg = makeCfg()
    const { result, type, submit } = setup(cfg)

    type('apple')
    await submit()

    expect(cfg.commit).toHaveBeenCalledTimes(1)
    expect(cfg.commit).toHaveBeenCalledWith(APPLE)
    expect(result.current.localFeedback?.tone).toBe('success')
    expect(result.current.localFeedback?.text).toBe('APPLE +5')
    expect(result.current.word).toBe('') // box cleared
    expect(result.current.lastWord).toBe('apple')
  })

  it('appends the bonus dot for a bonus word, not for a required word', async () => {
    const cfg = makeCfg()
    const { result, type, submit } = setup(cfg)

    type('zesty')
    await submit()
    expect(result.current.localFeedback?.text).toBe('ZESTY +9 •')

    type('apple')
    await submit()
    expect(result.current.localFeedback?.text).toBe('APPLE +5')
  })

  it('guards against a same-word re-submit during the realtime-lag window', async () => {
    // First submit accepts + reserves 'apple' in the pending set. foundWords is
    // still empty (the realtime insert hasn't landed), so without the pending
    // guard the second submit would double-commit.
    const cfg = makeCfg()
    const { result, type, submit } = setup(cfg)

    type('apple')
    await submit()
    type('apple')
    await submit()

    expect(cfg.commit).toHaveBeenCalledTimes(1)
    expect(result.current.localFeedback?.tone).toBe('warning')
    expect(result.current.localFeedback?.text).toMatch(/already found/i)
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

  it('coop dedups across players; compete dedups per player', async () => {
    // A teammate already found 'apple'.
    const found = [{ word: 'apple', user_id: 'u2' }]

    const coop = makeCfg({ mode: 'coop', foundWords: found })
    const c1 = setup(coop)
    c1.type('apple')
    await c1.submit()
    expect(coop.commit).not.toHaveBeenCalled()
    expect(c1.result.current.localFeedback?.text).toMatch(/already found/i)

    // In compete, a different player's find does NOT block me.
    const compete = makeCfg({ mode: 'compete', userId: 'u1', foundWords: found })
    const c2 = setup(compete)
    c2.type('apple')
    await c2.submit()
    expect(compete.commit).toHaveBeenCalledTimes(1)
  })

  it('rejects a too-short word with a warning and no commit', async () => {
    const cfg = makeCfg({ minWordLength: 4 })
    const { result, type, submit } = setup(cfg)

    type('ab')
    await submit()
    expect(cfg.commit).not.toHaveBeenCalled()
    expect(result.current.localFeedback?.tone).toBe('warning')
    expect(result.current.localFeedback?.text).toMatch(/too short/i)
  })

  it('rejects a non-legal word via explainReject with no commit', async () => {
    const cfg = makeCfg({ explainReject: () => ({ text: 'not on the board', tone: 'error' }) })
    const { result, type, submit } = setup(cfg)

    type('qqqq')
    await submit()
    expect(cfg.commit).not.toHaveBeenCalled()
    expect(result.current.localFeedback?.tone).toBe('error')
    expect(result.current.localFeedback?.text).toBe('not on the board')
  })

  it('is a no-op once terminal', async () => {
    const cfg = makeCfg({ isTerminal: true })
    const { result, type, submit } = setup(cfg)

    type('apple')
    await submit()
    expect(cfg.commit).not.toHaveBeenCalled()
    expect(result.current.localFeedback).toBeNull()
  })

  it('releases the word on a failed commit so a retry succeeds', async () => {
    const commit = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'network boom' } })
      .mockResolvedValueOnce({ error: null })
    const cfg = makeCfg({ commit })
    const { result, type, submit } = setup(cfg)

    type('apple')
    await submit()
    // The background commit rejected → error pill + the word is freed.
    expect(result.current.localFeedback?.tone).toBe('error')
    expect(result.current.localFeedback?.text).toBe('network boom')

    // Retyping + resubmitting is allowed (not stuck on "already found").
    type('apple')
    await submit()
    expect(commit).toHaveBeenCalledTimes(2)
    expect(result.current.localFeedback?.tone).toBe('success')
  })
})
