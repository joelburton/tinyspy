import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDragGesture, type DragGesture } from './useDragGesture'

/**
 * The shared press → tap-or-drag state machine. We drive it the way the real
 * games do: arm a gesture via `start` (a synthetic pointer-down), then dispatch
 * window pointermove/pointerup events. jsdom has no `PointerEvent`, but the hook
 * only reads `clientX/clientY` off the event, so a `MouseEvent` with the
 * `pointer*` type name stands in fine.
 */

type Src = { kind: 'tile'; id: number }
type Cell = { x: number; y: number }

/** A synthetic React pointer-down at (x, y); `button` defaults to primary. */
function down(x: number, y: number, button = 0): React.PointerEvent {
  return { button, clientX: x, clientY: y, preventDefault: vi.fn() } as unknown as React.PointerEvent
}
function pointer(type: 'pointermove' | 'pointerup', x: number, y: number) {
  window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))
}

function setup(extra: Partial<Parameters<typeof useDragGesture<Src, Cell>>[0]> = {}) {
  const onDrop = vi.fn()
  const onTap = vi.fn()
  const onDragMove = vi.fn()
  const onDragEnd = vi.fn()
  const cellAtPoint = vi.fn((x: number, y: number): Cell => ({ x, y }))
  const view = renderHook(() =>
    useDragGesture<Src, Cell>({
      dragClass: 'x-dragging',
      cellAtPoint,
      onDrop,
      onTap,
      onDragMove,
      onDragEnd,
      ...extra,
    }),
  )
  return { view, onDrop, onTap, onDragMove, onDragEnd, cellAtPoint }
}

const SOURCE: Src = { kind: 'tile', id: 1 }

describe('useDragGesture', () => {
  afterEach(() => {
    cleanup()
    document.body.className = ''
  })

  it('a press + tiny move + release is a TAP, not a drag', () => {
    const { view, onDrop, onTap } = setup()
    act(() => view.result.current.start(SOURCE, 'A', { x: 7, y: 7 }, down(100, 100)))
    act(() => pointer('pointermove', 102, 101)) // < 4px threshold
    act(() => pointer('pointerup', 102, 101))
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onTap.mock.calls[0][0]).toMatchObject({ source: SOURCE, cell: { x: 7, y: 7 } })
    expect(onDrop).not.toHaveBeenCalled()
    expect(view.result.current.drag).toBeNull()
    expect(document.body.classList.contains('x-dragging')).toBe(false)
  })

  it('a press dragged past the threshold sets drag/hover + the body class, then drops', () => {
    const { view, onDrop, onTap, onDragMove, onDragEnd } = setup()
    act(() => view.result.current.start(SOURCE, 'A', { x: 7, y: 7 }, down(100, 100)))

    act(() => pointer('pointermove', 130, 100)) // 30px → a real drag
    expect(document.body.classList.contains('x-dragging')).toBe(true)
    expect(view.result.current.drag).toMatchObject({ letter: 'A', source: SOURCE, x: 130, y: 100 })
    expect(view.result.current.hover).toEqual({ x: 130, y: 100 })
    expect(onDragMove).toHaveBeenLastCalledWith(130, 100)

    act(() => pointer('pointerup', 140, 160))
    expect(onDrop).toHaveBeenCalledTimes(1)
    const [g, dropX, dropY] = onDrop.mock.calls[0] as [DragGesture<Src, Cell>, number, number]
    expect(g.started).toBe(true)
    expect([dropX, dropY]).toEqual([140, 160])
    expect(onTap).not.toHaveBeenCalled()
    expect(onDragEnd).toHaveBeenCalledTimes(1)
    expect(view.result.current.drag).toBeNull()
    expect(view.result.current.hover).toBeNull()
    expect(document.body.classList.contains('x-dragging')).toBe(false)
  })

  it('a non-draggable press (letter null) never drags, even past the threshold', () => {
    const { view, onDrop, onTap } = setup()
    act(() => view.result.current.start(SOURCE, null, { x: 3, y: 4 }, down(100, 100)))
    act(() => pointer('pointermove', 300, 300)) // way past threshold, but letter is null
    expect(view.result.current.drag).toBeNull()
    expect(document.body.classList.contains('x-dragging')).toBe(false)
    act(() => pointer('pointerup', 300, 300))
    expect(onDrop).not.toHaveBeenCalled()
    expect(onTap).toHaveBeenCalledTimes(1) // it settles as a tap
  })

  it('ignores a non-primary button (right-click)', () => {
    const { view, onDrop, onTap } = setup()
    act(() => view.result.current.start(SOURCE, 'A', null, down(50, 50, 2)))
    act(() => pointer('pointermove', 200, 200))
    act(() => pointer('pointerup', 200, 200))
    expect(onDrop).not.toHaveBeenCalled()
    expect(onTap).not.toHaveBeenCalled()
    expect(view.result.current.drag).toBeNull()
  })
})
