// cs-audited-board-marks

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useChangeCause, type ChangeCause } from './useChangeCause'

/**
 * The answer cannot be read off `result.current`: the hook re-seeds during the
 * same render it answers in, so React renders again immediately and the second
 * render — the one whose return value the harness keeps — says null. That is the
 * hook working as intended; a real caller consumes the answer where it is
 * produced. So the harness records every render's answer instead.
 *
 * The content is the board string and its own key — the shape connections and
 * setgame use, where "changed" is the whole of it.
 */
function harness(initial: { board: string; moves: number }) {
  const answers: ChangeCause<string>[] = []
  const view = renderHook(
    function useRecordedAnswers({ board, moves }: { board: string; moves: number }) {
      const cause = useChangeCause(board, board, moves)
      if (cause) answers.push(cause)
      return cause
    },
    { initialProps: initial },
  )
  return { rerender: view.rerender, answers }
}

describe('useChangeCause', () => {
  it('says nothing on mount, however long the log is', () => {
    const { answers } = harness({ board: 'abcd', moves: 12 })
    expect(answers).toEqual([])
  })

  it('says nothing on a render that changed nothing', () => {
    const { rerender, answers } = harness({ board: 'abcd', moves: 1 })
    rerender({ board: 'abcd', moves: 1 })
    expect(answers).toEqual([])
  })

  it('reports a move, and hands back the content as it was', () => {
    const { rerender, answers } = harness({ board: 'abcd', moves: 1 })
    rerender({ board: 'abXd', moves: 2 })
    expect(answers).toEqual([{ byMove: true, before: 'abcd' }])
  })

  it('reports a change no move caused — the marker dropped with the log', () => {
    const { rerender, answers } = harness({ board: 'abcd', moves: 3 })
    rerender({ board: 'wxyz', moves: 0 })
    expect(answers).toEqual([{ byMove: false }])
  })

  it('says nothing when a move landed on identical content', () => {
    // waffle swapping two of the same letter: the marker advanced, the board
    // reads the same, and nobody looking can see a change to point at.
    const { rerender, answers } = harness({ board: 'abcd', moves: 1 })
    rerender({ board: 'abcd', moves: 2 })
    expect(answers).toEqual([])
  })

  it('re-seeds on an absorbed change, so the next move diffs against the screen', () => {
    const { rerender, answers } = harness({ board: 'abcd', moves: 3 })
    rerender({ board: 'wxyz', moves: 0 }) // a re-deal
    rerender({ board: 'wxYz', moves: 1 }) // a move on the new board
    expect(answers).toEqual([{ byMove: false }, { byMove: true, before: 'wxyz' }])
  })
})
