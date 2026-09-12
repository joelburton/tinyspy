// cs-audited-feedback

import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePeerFeedback } from './usePeerFeedback'
import { FeedbackMessage } from './FeedbackMessage'
import { createFeedbackSlot } from './feedbackSlotStore'

/**
 * Tests for the shared peer-narration bootstrap. The cases that matter are the
 * seed-TIMING ones from docs/peer-feedback-audit.md → §1.1, which the games'
 * synchronous PlayArea mocks never reproduced (they hand the backlog to the
 * first render, hiding the async-load bug). Here we drive the async explicitly
 * via `rerender`: enabled/items flip across renders the way a real load does.
 */

type Props = { enabled: boolean; items: readonly string[]; ready?: boolean }

/** A harness that narrates every item as a note reading `"{item}"`, except
 *  `"self"` (skipped, standing in for the player's own action). Returns a spy on
 *  the slot's `show`. `ready` is omitted by single-fetch cases (defaults true
 *  in the hook). */
function setup(initial: Props) {
  const globalFeedbackSlot = createFeedbackSlot('global')
  const shown = vi.spyOn(globalFeedbackSlot, 'show')
  const messageFor = (item: string): FeedbackMessage | null =>
    item === 'self' ? null : FeedbackMessage.note(item)
  const { rerender } = renderHook(
    (p: Props) =>
      usePeerFeedback({
        enabled: p.enabled,
        ready: p.ready,
        items: p.items,
        keyOf: (x) => x,
        messageFor,
        globalFeedbackSlot,
      }),
    { initialProps: initial },
  )
  return { shown, rerender }
}

const textOf = (shown: ReturnType<typeof setup>['shown'], n: number) =>
  shown.mock.calls[n]![0].text

describe('usePeerFeedback', () => {
  it('bootstraps silently — an existing backlog at load fires nothing', () => {
    const { shown } = setup({ enabled: true, items: ['a', 'b'] })
    expect(shown).not.toHaveBeenCalled()
  })

  it('shows a message for each NEW event after bootstrap', () => {
    const { shown, rerender } = setup({ enabled: true, items: ['a'] })
    rerender({ enabled: true, items: ['a', 'b', 'c'] })
    expect(shown).toHaveBeenCalledTimes(2)
    expect(textOf(shown, 0)).toBe('b')
    expect(textOf(shown, 1)).toBe('c')
  })

  it('skips events messageFor maps to null (own actions)', () => {
    const { shown, rerender } = setup({ enabled: true, items: [] })
    rerender({ enabled: true, items: ['self', 'a'] })
    expect(shown).toHaveBeenCalledTimes(1)
    expect(textOf(shown, 0)).toBe('a')
  })

  // §1.1 — the confirmed wordle bug: enabled/items are the loading values on the
  // first render, then the real backlog arrives. The seed must capture it, not
  // replay it.
  it('does NOT replay a backlog that arrives after the loading render', () => {
    const { shown, rerender } = setup({ enabled: false, items: [] })
    // game loads: mode becomes coop AND the backlog arrives in the same commit
    rerender({ enabled: true, items: ['a', 'b', 'c'] })
    expect(shown).not.toHaveBeenCalled()
  })

  // §1.1 — the opposite bug (psychicnum/connections): a fresh game seeds empty,
  // so the peer's FIRST event must fire, not get adopted as "seen".
  it('shows the FIRST peer event of a fresh game', () => {
    const { shown, rerender } = setup({ enabled: true, items: [] })
    rerender({ enabled: true, items: ['a'] })
    expect(shown).toHaveBeenCalledTimes(1)
    expect(textOf(shown, 0)).toBe('a')
  })

  it('never fires while disabled, and seeds only once enabled', () => {
    const { shown, rerender } = setup({ enabled: false, items: ['a'] })
    rerender({ enabled: false, items: ['a', 'b'] })
    expect(shown).not.toHaveBeenCalled()
    // Enabling now seeds the current backlog silently…
    rerender({ enabled: true, items: ['a', 'b'] })
    expect(shown).not.toHaveBeenCalled()
    // …and only later arrivals narrate.
    rerender({ enabled: true, items: ['a', 'b', 'c'] })
    expect(shown).toHaveBeenCalledTimes(1)
    expect(textOf(shown, 0)).toBe('c')
  })

  // L4 — the TWO-FETCH race (found-words games): `enabled` derives from the
  // HEADER fetch and can flip true while the SEPARATE rows fetch is still empty.
  // Without the `ready` gate the seed captured [] and then replayed the whole
  // backlog when the rows landed. With it, the seed waits for the rows.
  it('does NOT replay when enabled flips before the rows load (ready gate)', () => {
    const { shown, rerender } = setup({ enabled: false, ready: false, items: [] })
    // header resolves first: coop is known, but the rows fetch hasn't returned
    // (this is the render that used to seed an empty set and doom the backlog).
    rerender({ enabled: true, ready: false, items: [] })
    expect(shown).not.toHaveBeenCalled()
    // rows resolve: ready flips true with the backlog in the same commit → the
    // seed captures it silently.
    rerender({ enabled: true, ready: true, items: ['a', 'b', 'c'] })
    expect(shown).not.toHaveBeenCalled()
    // only genuinely later arrivals narrate.
    rerender({ enabled: true, ready: true, items: ['a', 'b', 'c', 'd'] })
    expect(shown).toHaveBeenCalledTimes(1)
    expect(textOf(shown, 0)).toBe('d')
  })

  // A fresh two-fetch game (rows load empty) still narrates the first real peer
  // event — ready gates the SEED, it doesn't suppress genuine events.
  it('shows the first peer event of a fresh two-fetch game', () => {
    const { shown, rerender } = setup({ enabled: true, ready: false, items: [] })
    rerender({ enabled: true, ready: true, items: [] }) // rows loaded, empty → seed empty
    rerender({ enabled: true, ready: true, items: ['a'] })
    expect(shown).toHaveBeenCalledTimes(1)
    expect(textOf(shown, 0)).toBe('a')
  })

  it('a remount with a backlog re-seeds silently (no replay on reconnect)', () => {
    // First mount seeds ['a','b'] and would fire nothing…
    const first = setup({ enabled: true, items: ['a', 'b'] })
    expect(first.shown).not.toHaveBeenCalled()
    // A fresh mount (PauseBoundary remount / deep-link) with the same backlog
    // must also stay silent — a fresh hook instance re-bootstraps.
    const second = setup({ enabled: true, items: ['a', 'b'] })
    expect(second.shown).not.toHaveBeenCalled()
  })
})
