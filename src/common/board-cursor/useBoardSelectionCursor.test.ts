// cs-unmet

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import type { BoardShape } from './stepCell'
import { useBoardSelectionCursor, type BoardSelectionCursorOptions } from './useBoardSelectionCursor'

// A board's selection cursor: hidden until an arrow, the first arrow only
// showing it, Space inert while hidden, a click moving it and hiding it, and a
// board you cannot play drawing none. Enter is the game's own Submit, so it is
// tested with the game.

/** A real window keydown. Awaited: an action's run settles a microtask later. */
async function press(key: string) {
  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

const shape: BoardShape = { cols: 3, rows: 2, exists: () => true }

function setup(over: Partial<BoardSelectionCursorOptions> = {}) {
  const cb = { onToggle: vi.fn() }
  const view = renderHook(
    (props: Partial<BoardSelectionCursorOptions>) => {
      useActionDispatcher()
      return useBoardSelectionCursor({ shape, enabled: true, ...cb, ...props })
    },
    { initialProps: over },
  )
  return { ...cb, view, cursor: () => view.result.current.cursor }
}

describe('useBoardSelectionCursor', () => {
  it('is hidden until an arrow; the first arrow shows it, the next moves it', async () => {
    const s = setup()
    expect(s.cursor()).toBeNull()
    await press('ArrowRight')
    expect(s.cursor()).toEqual({ x: 0, y: 0 })
    await press('ArrowRight')
    expect(s.cursor()).toEqual({ x: 1, y: 0 })
    s.view.unmount()
  })

  it('Space does nothing while the cursor is hidden, and picks the cell under it once shown', async () => {
    const s = setup()
    await press(' ')
    expect(s.onToggle).not.toHaveBeenCalled()
    expect(s.cursor()).toBeNull()
    await press('ArrowDown')
    await press('ArrowDown')
    await press(' ')
    expect(s.onToggle).toHaveBeenCalledWith({ x: 0, y: 1 })
    s.view.unmount()
  })

  it('a click moves the cursor and hides it; the next arrow shows it there', async () => {
    const s = setup()
    await press('ArrowRight')
    act(() => s.view.result.current.point({ x: 2, y: 1 }))
    expect(s.cursor()).toBeNull()
    await press('ArrowLeft')
    expect(s.cursor()).toEqual({ x: 2, y: 1 })
    s.view.unmount()
  })

  it('a board you cannot play draws no cursor and takes no keys, and keeps its cell', async () => {
    const s = setup()
    await press('ArrowRight')
    await press('ArrowRight')
    s.view.rerender({ enabled: false })
    expect(s.cursor()).toBeNull()
    await press('ArrowRight')
    await press(' ')
    expect(s.onToggle).not.toHaveBeenCalled()
    s.view.rerender({ enabled: true })
    expect(s.cursor()).toEqual({ x: 1, y: 0 })
    s.view.unmount()
  })
})
