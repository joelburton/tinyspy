import { describe, expect, it } from 'vitest'
import { clampToViewport } from './useDraggablePanel'

/**
 * `clampToViewport` is the pure geometry helper that keeps a
 * floating panel on-screen across browser resizes and stale
 * localStorage rects. The mins, the edge padding, the rect at
 * each axis — exercised here so future changes to the math don't
 * silently drift.
 *
 * The test relies on `window.innerWidth`/`innerHeight` being
 * what jsdom defaults to (1024 × 768) inside vitest's environment
 * — see `vitest.config.ts`'s `environment: 'jsdom'` (the default).
 */

const VW = 1024
const VH = 768

describe('clampToViewport', () => {
  it('passes through a rect that already fits, with padding clearance', () => {
    const out = clampToViewport(
      { x: 200, y: 200, width: 400, height: 300 },
      240,
      200,
      8,
    )
    expect(out).toEqual({ x: 200, y: 200, width: 400, height: 300 })
  })

  it('slides a rect inward when it would overflow the right edge', () => {
    // x + width = 1000 + 400 = 1400, viewport 1024 → too far right.
    // Expected new x = 1024 - 400 - 8 = 616.
    const out = clampToViewport(
      { x: 1000, y: 100, width: 400, height: 300 },
      240,
      200,
      8,
    )
    expect(out.x).toBe(VW - 400 - 8)
    expect(out.y).toBe(100)
    expect(out.width).toBe(400)
  })

  it('slides a rect inward when it would overflow the bottom edge', () => {
    // y + height = 700 + 300 = 1000, viewport 768 → too far down.
    // Expected new y = 768 - 300 - 8 = 460.
    const out = clampToViewport(
      { x: 100, y: 700, width: 400, height: 300 },
      240,
      200,
      8,
    )
    expect(out.y).toBe(VH - 300 - 8)
  })

  it('caps width and height at viewport-minus-padding', () => {
    const out = clampToViewport(
      { x: 0, y: 0, width: 5000, height: 5000 },
      240,
      200,
      8,
    )
    expect(out.width).toBe(VW - 8 * 2)
    expect(out.height).toBe(VH - 8 * 2)
  })

  it('respects the minimum size even if the viewport is tiny', () => {
    // We can't actually shrink the jsdom window in this unit test
    // without mocking, but we can verify the floor: a smaller-than-
    // minimum rect gets clamped UP to the minimum.
    const out = clampToViewport(
      { x: 100, y: 100, width: 50, height: 40 },
      240,
      200,
      8,
    )
    expect(out.width).toBe(240)
    expect(out.height).toBe(200)
  })

  it('clamps x and y to the padding floor when they go negative', () => {
    const out = clampToViewport(
      { x: -100, y: -50, width: 400, height: 300 },
      240,
      200,
      8,
    )
    expect(out.x).toBe(8)
    expect(out.y).toBe(8)
  })
})

describe('clampToViewport (soft mode)', () => {
  // SOFT_MIN_VISIBLE = 60 in the implementation. Soft mode lets
  // the panel extend past the viewport edges as long as 60px
  // stays visible, with the additional rule that y can't be
  // negative (header stays reachable).

  it('passes through a rect already fully inside', () => {
    const out = clampToViewport(
      { x: 200, y: 200, width: 400, height: 300 },
      240,
      200,
      8,
      'soft',
    )
    expect(out).toEqual({ x: 200, y: 200, width: 400, height: 300 })
  })

  it('allows the panel to extend past the right edge', () => {
    // x = 900, width = 400, vw = 1024. Right edge at 1300,
    // 276px past the viewport — soft lets this stay because
    // 60 + (1024 - 900) = the visible chunk on the left side
    // is well over the 60px minimum.
    const out = clampToViewport(
      { x: 900, y: 100, width: 400, height: 300 },
      240,
      200,
      8,
      'soft',
    )
    expect(out.x).toBe(900)
  })

  it('caps x so at least 60px stays visible on the right', () => {
    // x = 2000 — panel mostly off the right. Soft caps x at
    // vw - 60 = 964.
    const out = clampToViewport(
      { x: 2000, y: 100, width: 400, height: 300 },
      240,
      200,
      8,
      'soft',
    )
    expect(out.x).toBe(VW - 60)
  })

  it('allows x to go negative, as long as 60px stays on the right', () => {
    // x = -200 — panel mostly off the left. minX = 60 - width =
    // 60 - 400 = -340. So -200 is allowed.
    const out = clampToViewport(
      { x: -200, y: 100, width: 400, height: 300 },
      240,
      200,
      8,
      'soft',
    )
    expect(out.x).toBe(-200)
  })

  it('caps negative x so 60px stays visible on the left', () => {
    // x = -1000 — panel WAY off the left. minX = -340.
    const out = clampToViewport(
      { x: -1000, y: 100, width: 400, height: 300 },
      240,
      200,
      8,
      'soft',
    )
    expect(out.x).toBe(60 - 400)
  })

  it("keeps y >= 0 so the header stays grabbable", () => {
    // y can't go negative regardless — header would slip out
    // of reach above the viewport.
    const out = clampToViewport(
      { x: 100, y: -50, width: 400, height: 300 },
      240,
      200,
      8,
      'soft',
    )
    expect(out.y).toBe(0)
  })

  it('caps y so at least 60px stays visible at the bottom', () => {
    // y = 800, vh = 768. Soft caps y at vh - 60 = 708.
    const out = clampToViewport(
      { x: 100, y: 800, width: 400, height: 300 },
      240,
      200,
      8,
      'soft',
    )
    expect(out.y).toBe(VH - 60)
  })
})
