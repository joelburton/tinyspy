// cs-blessed-mobile

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackLayoutWidth } from './layoutWidth'

/**
 * jsdom reports `clientWidth` as 0 and has no `ResizeObserver`, so both are
 * faked here — the width because there is nothing to measure, the observer
 * because the interesting claim is about what happens when it fires.
 *
 * That claim is the redundant-write guard: writing `--client-width` re-runs the
 * board math, which can nudge layout and re-fire the observer, so a write on
 * every observation is a loop waiting for a resize. It is the one thing in the
 * file a reader would not assume.
 */

let width = 0
let observerCallback: (() => void) | null = null

beforeEach(() => {
  width = 1000
  observerCallback = null
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockImplementation(() => width)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        observerCallback = callback
      }
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--client-width')
})

const published = () => document.documentElement.style.getPropertyValue('--client-width')

describe('trackLayoutWidth', () => {
  it('publishes the width at startup, before any resize', () => {
    trackLayoutWidth()
    expect(published()).toBe('1000px')
  })

  it('republishes when the width actually changes', () => {
    trackLayoutWidth()
    width = 640
    observerCallback?.()
    expect(published()).toBe('640px')
  })

  it('writes nothing when an observation reports the same width', () => {
    trackLayoutWidth()
    document.documentElement.style.removeProperty('--client-width')

    // The observer fires for reasons other than a width change — a scrollbar
    // appearing, layout settling after the last write. Re-writing the property
    // would re-run the board math and can re-fire the observer, so the guard is
    // what keeps that from feeding itself. An absent property here means the
    // write never happened.
    observerCallback?.()
    expect(published()).toBe('')
  })
})
