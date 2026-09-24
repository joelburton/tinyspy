// cs-unmet

/**
 * The component-keys table: a row's keys are what `pressed` matches, and a row
 * is offered for exactly as long as a component says so.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { pressed, useComponentKeys, useOfferedComponentKeys } from './componentKeys'

const press = (key: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ key, code: '', metaKey: false, altKey: false, ctrlKey: false, shiftKey: false, ...mods }) as KeyboardEvent

describe('pressed', () => {
  it('matches every key of the row, and nothing else', () => {
    expect(pressed('keys-list-move', press('ArrowUp'))).toBe(true)
    expect(pressed('keys-list-move', press('ArrowDown'))).toBe(true)
    expect(pressed('keys-list-move', press('ArrowLeft'))).toBe(false)
  })

  it('reads ⇧ where the row says so: Tab and ⇧Tab both go round a ring', () => {
    expect(pressed('keys-tab-ring', press('Tab'))).toBe(true)
    expect(pressed('keys-tab-ring', press('Tab', { shiftKey: true }))).toBe(true)
    // …while stepping out of a panel's field is Tab alone.
    expect(pressed('keys-leave-field', press('Tab', { shiftKey: true }))).toBe(false)
  })

  it('never matches a Cmd or Ctrl chord — Ctrl-Tab is the browser’s', () => {
    expect(pressed('keys-tab-ring', press('Tab', { ctrlKey: true }))).toBe(false)
    expect(pressed('keys-list-open', press('Enter', { metaKey: true }))).toBe(false)
  })
})

describe('useComponentKeys', () => {
  it('offers its rows while mounted and withdraws them on unmount', () => {
    const offered = renderHook(() => useOfferedComponentKeys())
    const list = renderHook(() => useComponentKeys(['keys-list-move']))
    offered.rerender()
    expect(offered.result.current).toContain('keys-list-move')
    list.unmount()
    offered.rerender()
    expect(offered.result.current).not.toContain('keys-list-move')
  })

  it('keeps a row while any one offer of it stands', () => {
    const offered = renderHook(() => useOfferedComponentKeys())
    const a = renderHook(() => useComponentKeys(['keys-list-open']))
    const b = renderHook(() => useComponentKeys(['keys-list-open']))
    a.unmount()
    offered.rerender()
    expect(offered.result.current).toContain('keys-list-open')
    b.unmount()
    offered.rerender()
    expect(offered.result.current).not.toContain('keys-list-open')
  })

  it('offers nothing while not live', () => {
    const offered = renderHook(() => useOfferedComponentKeys())
    renderHook(() => useComponentKeys(['keys-close-panel'], false))
    offered.rerender()
    expect(offered.result.current).not.toContain('keys-close-panel')
  })
})
