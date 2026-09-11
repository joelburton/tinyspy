// cs-unmet

/**
 * Tests for the tab ring — the thing that keeps Tab inside the stops a surface
 * declared and out of the browser's URL bar.
 *
 * jsdom gives us focus and `document.activeElement` for free, but it does no
 * layout, so the hook's on-screen test would call every stop hidden. The stub
 * below makes `getClientRects()` report one rect for every element except the
 * ones a case deliberately hides.
 */
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTabRing, type TabStop } from './useTabRing'

/** The elements the running case wants treated as off screen. */
let hidden = new WeakSet<Element>()

beforeEach(() => {
  hidden = new WeakSet()
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    const rects = hidden.has(this) ? [] : [new DOMRect(0, 0, 10, 10)]
    return rects as unknown as DOMRectList
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** `n` buttons on the page, as the refs a surface would declare. */
function stops(n: number): TabStop[] {
  return Array.from({ length: n }, () => {
    const el = document.createElement('button')
    document.body.append(el)
    return { current: el as HTMLElement | null }
  })
}

/** Press Tab at `target` — the page itself unless a case aims it somewhere —
 *  and hand the event back so the case can read `defaultPrevented`. */
function pressTab(over: KeyboardEventInit = {}, target: EventTarget = window): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
    ...over,
  })
  target.dispatchEvent(e)
  return e
}

describe('useTabRing — an empty ring is still a ring', () => {
  it('consumes Tab and Shift+Tab instead of letting them reach the browser', () => {
    renderHook(() => useTabRing([]))
    expect(document.activeElement).toBe(document.body)

    expect(pressTab().defaultPrevented).toBe(true)
    expect(pressTab({ shiftKey: true }).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(document.body)
  })
})

describe('useTabRing — walking the stops', () => {
  it('Tab visits them in the declared order and wraps', () => {
    const ring = stops(3)
    renderHook(() => useTabRing(ring))

    ring[0]!.current!.focus()
    pressTab()
    expect(document.activeElement).toBe(ring[1]!.current)
    pressTab()
    expect(document.activeElement).toBe(ring[2]!.current)
    pressTab()
    expect(document.activeElement).toBe(ring[0]!.current)
  })

  it('Shift+Tab walks backward and wraps', () => {
    const ring = stops(3)
    renderHook(() => useTabRing(ring))

    ring[0]!.current!.focus()
    pressTab({ shiftKey: true })
    expect(document.activeElement).toBe(ring[2]!.current)
    pressTab({ shiftKey: true })
    expect(document.activeElement).toBe(ring[1]!.current)
  })

  // A stray click on blank page leaves focus on <body>, and one press should
  // undo it — so the ring is entered at the end Tab would have reached.
  it('enters at the first stop from nowhere, and at the last on Shift+Tab', () => {
    const ring = stops(3)
    renderHook(() => useTabRing(ring))

    expect(document.activeElement).toBe(document.body)
    pressTab()
    expect(document.activeElement).toBe(ring[0]!.current)

    ring[0]!.current!.blur()
    pressTab({ shiftKey: true })
    expect(document.activeElement).toBe(ring[2]!.current)
  })
})

describe('useTabRing — which stops count', () => {
  it('skips a stop that has not rendered', () => {
    const [first, last] = stops(2)
    renderHook(() => useTabRing([first!, { current: null }, last!]))

    first!.current!.focus()
    pressTab()
    expect(document.activeElement).toBe(last!.current)
  })

  it('skips a stop that is off screen', () => {
    const ring = stops(3)
    hidden.add(ring[1]!.current!)
    renderHook(() => useTabRing(ring))

    ring[0]!.current!.focus()
    pressTab()
    expect(document.activeElement).toBe(ring[2]!.current)
  })
})

describe('useTabRing — innermost wins', () => {
  it('the ring mounted last answers Tab, and the outer one has it back when that unmounts', () => {
    const page = stops(2)
    const dialog = stops(2)
    renderHook(() => useTabRing(page))
    const inner = renderHook(() => useTabRing(dialog))

    // Focus sits on a page stop, which the dialog's ring does not know — so it
    // enters its own, and the page's ring stays quiet.
    page[0]!.current!.focus()
    pressTab()
    expect(document.activeElement).toBe(dialog[0]!.current)
    pressTab()
    expect(document.activeElement).toBe(dialog[1]!.current)

    inner.unmount()
    page[0]!.current!.focus()
    pressTab()
    expect(document.activeElement).toBe(page[1]!.current)
  })
})

describe('useTabRing — keys it does not claim', () => {
  it('leaves a modified Tab to the browser and the OS', () => {
    const ring = stops(2)
    renderHook(() => useTabRing(ring))

    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      ring[0]!.current!.focus()
      expect(pressTab({ [mod]: true }).defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(ring[0]!.current)
    }
  })

  // Paired with the TRANSITIONAL guard in the hook: an overlay that declares no
  // ring of its own still needs native Tab inside itself. Goes when they declare.
  it('leaves Tab alone inside a floating panel', () => {
    const ring = stops(2)
    renderHook(() => useTabRing(ring))

    const panel = document.createElement('div')
    panel.dataset.floatingPanel = ''
    const field = document.createElement('input')
    panel.append(field)
    document.body.append(panel)

    field.focus()
    expect(pressTab({}, field).defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(field)
  })
})
