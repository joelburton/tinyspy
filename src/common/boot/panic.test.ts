// cs-blessed-deep

import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onUncaughtRender, showPanic } from './panic'

/**
 * The last-resort screen, held to its one promise: never a blank page. Both
 * ways in are exercised — the boot path by calling the painter, the render
 * path by handing the handler to a REAL `createRoot` and throwing inside it,
 * because the whole point of that path is that React calls us after it has
 * unmounted the tree, and only React can prove it does.
 *
 * `location.reload` is non-configurable in jsdom, so `location` is swapped
 * for a stub while a test needs the button to be pressable.
 */
describe('panic', () => {
  const realLocation = window.location
  let reload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...realLocation, reload },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'location', {
      value: realLocation,
      writable: true,
      configurable: true,
    })
  })

  it('paints the boot sentence, the diagnostics line, and a Reload button', () => {
    showPanic('boot', new TypeError('Failed to fetch dynamically imported module'))
    expect(document.body.textContent).toContain('The app could not start')
    // The standard FAULT line, named by the phase, carrying the thrown error.
    expect(document.body.textContent).toMatch(/FAULT \| boot \|/)
    expect(document.body.textContent).toContain('TypeError: Failed to fetch')
    // And the same line went to the console for anyone with devtools open.
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/FAULT \| boot \|/))
  })

  it('the Reload button reloads', () => {
    showPanic('boot', new Error('x'))
    document.querySelector('button')!.click()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('renders a non-Error throw without crashing on it', () => {
    showPanic('boot', 'a bare string')
    expect(document.body.textContent).toContain('a bare string')
  })

  it('paints the render sentence when React reports an uncaught render throw', () => {
    // A real root with the handler installed, and a component that throws
    // during render with no boundary above it — the case F-deep-49 is about.
    // Without the handler React unmounts to a blank page; with it, the same
    // painter runs.
    //
    // NOT wrapped in `act()`, deliberately: inside an act scope React pushes an
    // uncaught error onto its own `thrownErrors` list for act to rethrow and
    // never calls `onUncaughtError` at all (react-dom-client, the branch on
    // `actQueue`). `flushSync` renders and commits synchronously without that
    // scope, which is also how a real page fails.
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host, { onUncaughtError: onUncaughtRender })
    const Thrower = () => {
      throw new Error('boom in render')
    }
    flushSync(() => {
      root.render(createElement(Thrower))
    })
    expect(document.body.textContent).toContain('The app hit a bug and stopped')
    expect(document.body.textContent).toMatch(/FAULT \| render \|/)
    expect(document.body.textContent).toContain('Error: boom in render')
    // The tree is gone — React unmounted it — which is why the painter had to
    // write into the body rather than let React show anything.
    expect(host.textContent).toBe('')
    // The component stack is the one fact this path has that boot does not.
    expect(console.error).toHaveBeenCalledWith(
      '[render] component stack:',
      expect.stringContaining('Thrower'),
    )
  })
})
