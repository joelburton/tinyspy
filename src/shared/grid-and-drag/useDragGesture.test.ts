// cs-audited-grid-and-drag

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cellAtPoint, DRAGGING_CLASS, useDragGesture, type DragGesture } from './useDragGesture'

// The shared press → tap-or-drag state machine. We drive it the way the real
// games do: arm a gesture via `start` (a synthetic React pointer-down), then
// dispatch window pointermove / pointerup / pointercancel events.
//
// jsdom does no layout, so it has no `elementFromPoint`; each test says what
// is under the pointer by setting `underPointer`.

type Src = { kind: 'tile'; id: number }

/** A grid cell, marked the way a game marks one. */
function square(x: number, y: number): HTMLElement {
  const el = document.createElement('div')
  el.dataset.cell = ''
  el.dataset.x = String(x)
  el.dataset.y = String(y)
  return el
}
let underPointer: Element | null = null

/** A synthetic React pointer-down at (x, y); `button` defaults to primary. */
function down(x: number, y: number, button = 0, pointerType = 'mouse'): React.PointerEvent {
  return { button, pointerType, clientX: x, clientY: y, preventDefault: vi.fn() } as unknown as React.PointerEvent
}
function pointer(type: 'pointermove' | 'pointerup' | 'pointercancel', x = 0, y = 0) {
  window.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
}

function setup() {
  const onDrop = vi.fn()
  const onTap = vi.fn()
  const onDragMove = vi.fn()
  const onDragEnd = vi.fn()
  const view = renderHook(() =>
    useDragGesture<Src>({ onDrop, onTap, onDragMove, onDragEnd }),
  )
  return { view, onDrop, onTap, onDragMove, onDragEnd }
}

const SOURCE: Src = { kind: 'tile', id: 1 }

beforeEach(() => {
  underPointer = null
  document.elementFromPoint = () => underPointer
})
afterEach(() => {
  cleanup()
  document.body.className = ''
})

describe('cellAtPoint', () => {
  it('reads the cell under the point from its data-x and data-y', () => {
    underPointer = square(7, 3)
    expect(cellAtPoint(0, 0)).toEqual({ x: 7, y: 3 })
  })

  it('finds the cell from an element inside it', () => {
    const cell = square(2, 9)
    const letter = document.createElement('span')
    cell.appendChild(letter)
    underPointer = letter
    expect(cellAtPoint(0, 0)).toEqual({ x: 2, y: 9 })
  })

  it('is null off the grid', () => {
    underPointer = document.body
    expect(cellAtPoint(0, 0)).toBeNull()
  })
})

describe('useDragGesture', () => {
  it('a press + tiny move + release is a TAP, not a drag', () => {
    const { view, onDrop, onTap } = setup()
    act(() => view.result.current.start(SOURCE, 'A', { x: 7, y: 7 }, down(100, 100)))
    act(() => pointer('pointermove', 102, 101)) // < 4px threshold
    act(() => pointer('pointerup', 102, 101))
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onTap.mock.calls[0][0]).toMatchObject({ source: SOURCE, cell: { x: 7, y: 7 } })
    expect(onDrop).not.toHaveBeenCalled()
    expect(view.result.current.drag).toBeNull()
    expect(document.body.classList.contains(DRAGGING_CLASS)).toBe(false)
  })

  it('a press dragged past the threshold sets drag/hover + the body class, then drops', () => {
    const { view, onDrop, onTap, onDragMove, onDragEnd } = setup()
    act(() => view.result.current.start(SOURCE, 'A', { x: 7, y: 7 }, down(100, 100)))

    underPointer = square(8, 7)
    act(() => pointer('pointermove', 130, 100)) // 30px → a real drag
    expect(document.body.classList.contains(DRAGGING_CLASS)).toBe(true)
    expect(view.result.current.drag).toMatchObject({ letter: 'A', source: SOURCE, x: 130, y: 100 })
    expect(view.result.current.hover).toEqual({ x: 8, y: 7 })
    expect(onDragMove).toHaveBeenLastCalledWith(130, 100)

    act(() => pointer('pointerup', 140, 160))
    expect(onDrop).toHaveBeenCalledTimes(1)
    const [g, dropX, dropY] = onDrop.mock.calls[0] as [DragGesture<Src>, number, number]
    expect(g.started).toBe(true)
    expect([dropX, dropY]).toEqual([140, 160])
    expect(onTap).not.toHaveBeenCalled()
    expect(onDragEnd).toHaveBeenCalledTimes(1)
    expect(view.result.current.drag).toBeNull()
    expect(view.result.current.hover).toBeNull()
    expect(document.body.classList.contains(DRAGGING_CLASS)).toBe(false)
  })

  it('a pointercancel mid-drag tears down the gesture — no drop, no tap, state cleared', () => {
    const { view, onDrop, onTap, onDragEnd } = setup()
    act(() => view.result.current.start(SOURCE, 'A', { x: 7, y: 7 }, down(100, 100)))
    act(() => pointer('pointermove', 130, 100)) // a real drag
    expect(document.body.classList.contains(DRAGGING_CLASS)).toBe(true)
    expect(view.result.current.drag).not.toBeNull()

    // The browser takes the pointer for a pan, or an OS gesture does — no pointerup.
    act(() => pointer('pointercancel'))
    expect(onDrop).not.toHaveBeenCalled()
    expect(onTap).not.toHaveBeenCalled()
    expect(onDragEnd).toHaveBeenCalledTimes(1)
    expect(view.result.current.drag).toBeNull()
    expect(view.result.current.hover).toBeNull()
    expect(document.body.classList.contains(DRAGGING_CLASS)).toBe(false)

    // The gesture is disarmed: a later stray pointerup does nothing.
    act(() => pointer('pointerup', 200, 200))
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('a non-draggable press (letter null) never drags, even past the threshold', () => {
    const { view, onDrop, onTap } = setup()
    act(() => view.result.current.start(SOURCE, null, { x: 3, y: 4 }, down(100, 100)))
    act(() => pointer('pointermove', 300, 300)) // way past threshold, but letter is null
    expect(view.result.current.drag).toBeNull()
    expect(document.body.classList.contains(DRAGGING_CLASS)).toBe(false)
    act(() => pointer('pointerup', 300, 300))
    expect(onDrop).not.toHaveBeenCalled()
    expect(onTap).toHaveBeenCalledTimes(1) // it settles as a tap
  })

  it('a touch press never drags, even past the threshold — it settles as a tap', () => {
    const { view, onDrop, onTap } = setup()
    act(() => view.result.current.start(SOURCE, 'A', { x: 3, y: 4 }, down(100, 100, 0, 'touch')))
    act(() => pointer('pointermove', 300, 300))
    expect(view.result.current.drag).toBeNull()
    expect(document.body.classList.contains(DRAGGING_CLASS)).toBe(false)
    act(() => pointer('pointerup', 300, 300))
    expect(onDrop).not.toHaveBeenCalled()
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('a drop calls the onDrop of the latest render, not the one bound first', () => {
    const first = vi.fn()
    const latest = vi.fn()
    const view = renderHook(
      ({ onDrop }) => useDragGesture<Src>({ onDrop, onTap: vi.fn() }),
      { initialProps: { onDrop: first } },
    )
    act(() => view.result.current.start(SOURCE, 'A', null, down(100, 100)))
    act(() => pointer('pointermove', 130, 100))
    view.rerender({ onDrop: latest })
    act(() => pointer('pointerup', 130, 100))
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
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
