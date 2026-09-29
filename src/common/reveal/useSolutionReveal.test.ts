// cs-blessed-reveal

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { solvedByMe, useSolutionReveal } from './useSolutionReveal'

/**
 * `solvedByMe` — "did I produce the solution?", the input to `impliedBy`.
 *
 * The coop half is not a convenience. The per-player solved bit is unreliable
 * in coop, differently in each game: stackdown sets `players.solved` only in
 * compete, strands' coop branch ends the game without touching it, and
 * psychicnum counts per CALLER, so two teammates finding 2 and 1 leaves
 * neither at three.
 */
describe('solvedByMe', () => {
  it('coop asks the GAME — one board, one outcome', () => {
    expect(solvedByMe({ isCompete: false, gameOutcome: 'won', mine: false })).toBe(true)
    // …and only a WIN counts: a Stop, a loss or a game still played solved nothing.
    expect(solvedByMe({ isCompete: false, gameOutcome: 'neutral', mine: false })).toBe(false)
    expect(solvedByMe({ isCompete: false, gameOutcome: 'lost', mine: false })).toBe(false)
    expect(solvedByMe({ isCompete: false, gameOutcome: null, mine: false })).toBe(false)
  })

  it('compete asks ME — the verdict is not a proxy for my own board', () => {
    // The whole reason this doesn't read the game's outcome: a race is `won`
    // when SOMEONE won, and handing the loser the answer is what we're avoiding.
    expect(solvedByMe({ isCompete: true, gameOutcome: 'won', mine: false })).toBe(false)
    expect(solvedByMe({ isCompete: true, gameOutcome: 'won', mine: true })).toBe(true)
    // A player who solved but lost the race on its ranking still consumed
    // their board.
    expect(solvedByMe({ isCompete: true, gameOutcome: 'lost', mine: true })).toBe(true)
  })
})

/**
 * The reveal's two halves: the player's own choice, and the default implied
 * when their board-solution IS the puzzle-solution (`doc.md`). Everything here
 * is about how those two interact, because that's where the bugs live — a
 * frozen initializer above all.
 *
 * A restart is not one of them: `GamePage` keys the play surface on
 * `common.games.restarts`, so the replayed run mounts a fresh hook with no
 * choice in it (`GamePage.test.tsx` pins that remount).
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

  it('impliedBySolve is false when nothing was solved', () => {
    const { result } = renderHook(() => useSolutionReveal())
    act(() => result.current.toggle())
    // Revealed by choice, not by a win — the button stays live so it can hide.
    expect(result.current.revealed).toBe(true)
    expect(result.current.impliedBySolve).toBe(false)
  })
})
