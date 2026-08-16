import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSolutionReveal } from './useSolutionReveal'

/**
 * The reveal's two halves: the player's own choice, and the default a CLEAR WIN
 * implies. Everything here is about how those two interact, because that's where
 * the bugs live — a frozen initializer, or a Restart that quietly records "no".
 */
describe('useSolutionReveal', () => {
  it('starts hidden and toggles both ways', () => {
    const { result } = renderHook(() => useSolutionReveal())
    expect(result.current.revealed).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.revealed).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.revealed).toBe(false)
  })

  /**
   * The trap this exists for. `impliedBy` is FALSE at mount whatever the game
   * state — it comes from per-player rows that arrive a render or two later —
   * and a game can be won mid-session besides. A `useState(impliedBy)`
   * initializer would capture that first `false` and never notice the win.
   */
  it('picks up impliedBy when it arrives AFTER mount', () => {
    const { result, rerender } = renderHook(({ solved }) => useSolutionReveal({ impliedBy: solved }), {
      initialProps: { solved: false },
    })
    expect(result.current.revealed).toBe(false)
    rerender({ solved: true })
    expect(result.current.revealed).toBe(true)
    expect(result.current.impliedBySolve).toBe(true)
  })

  it('lets an explicit choice outrank the implied default, either way', () => {
    const { result } = renderHook(() => useSolutionReveal({ impliedBy: true }))
    expect(result.current.revealed).toBe(true)
    // A player who solved it can still put the answer away…
    act(() => result.current.toggle())
    expect(result.current.revealed).toBe(false)
    // …and `impliedBySolve` goes false with it: the control has work to do
    // again, so it must not sit there disabled saying "already shown".
    expect(result.current.impliedBySolve).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.revealed).toBe(true)
  })

  /**
   * Restart's case, and the reason `reset` exists apart from `hide`. Using
   * `hide()` here would record an explicit "no", which outranks the implied
   * default forever — so solving the REPLAYED board wouldn't show the answer,
   * and the player would be left pressing a Reveal button to see something they
   * just earned.
   */
  it('reset hands control back to impliedBy; hide would not', () => {
    const { result, rerender } = renderHook(({ solved }) => useSolutionReveal({ impliedBy: solved }), {
      initialProps: { solved: true },
    })
    act(() => result.current.hide()) // an explicit "no"
    rerender({ solved: false }) // …the replay starts
    expect(result.current.revealed).toBe(false)
    rerender({ solved: true }) // …and is solved again
    expect(result.current.revealed).toBe(false) // the stale "no" still wins

    act(() => result.current.reset())
    expect(result.current.revealed).toBe(true) // now the win speaks for itself
  })

  it('impliedBySolve is false when nothing was solved', () => {
    const { result } = renderHook(() => useSolutionReveal())
    act(() => result.current.toggle())
    // Revealed by choice, not by a win — the button stays live so it can hide.
    expect(result.current.revealed).toBe(true)
    expect(result.current.impliedBySolve).toBe(false)
  })
})
