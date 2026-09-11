// cs-unmet

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDismissOnEscape } from './useDismissOnEscape'

/**
 * The whole job is "dismiss me, and let nobody else hear it", so the assertion
 * that matters is the second half: a `window` listener standing in for
 * `usePanelEscape` must not fire.
 *
 * The stand-in is registered BEFORE the hook mounts, which is not incidental —
 * it is the real order (the panel registry binds when the panel opens, the
 * overlay opens later), and it is the order in which a `window`-bound
 * `stopPropagation` would be useless.
 */
describe('useDismissOnEscape', () => {
  /** `usePanelEscape`'s shape: a window keydown bound before the overlay. */
  function panelRegistryStandIn() {
    const heard = vi.fn()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') heard()
    }
    window.addEventListener('keydown', onKey)
    return { heard, remove: () => window.removeEventListener('keydown', onKey) }
  }

  const press = (key: string) =>
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

  afterEach(cleanup)

  it('dismisses on Escape', () => {
    const onDismiss = vi.fn()
    renderHook(() => useDismissOnEscape(true, onDismiss))
    press('Escape')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('keeps the press from reaching a window listener bound earlier', () => {
    const registry = panelRegistryStandIn()
    const onDismiss = vi.fn()
    renderHook(() => useDismissOnEscape(true, onDismiss))
    press('Escape')
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(registry.heard).not.toHaveBeenCalled()
    registry.remove()
  })

  it('leaves the press alone when inactive', () => {
    const registry = panelRegistryStandIn()
    const onDismiss = vi.fn()
    renderHook(() => useDismissOnEscape(false, onDismiss))
    press('Escape')
    expect(onDismiss).not.toHaveBeenCalled()
    expect(registry.heard).toHaveBeenCalledTimes(1)
    registry.remove()
  })

  it('ignores every other key', () => {
    const registry = panelRegistryStandIn()
    const onDismiss = vi.fn()
    renderHook(() => useDismissOnEscape(true, onDismiss))
    press('Enter')
    expect(onDismiss).not.toHaveBeenCalled()
    expect(registry.heard).not.toHaveBeenCalled()
    registry.remove()
  })

  it('unbinds on unmount', () => {
    const onDismiss = vi.fn()
    const { unmount } = renderHook(() => useDismissOnEscape(true, onDismiss))
    unmount()
    press('Escape')
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
