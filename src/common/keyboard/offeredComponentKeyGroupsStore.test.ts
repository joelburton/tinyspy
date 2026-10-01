// cs-unmet

/**
 * A component key group is offered for exactly as long as a component says
 * so.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  useOfferComponentKeyGroups,
  useOfferedComponentKeyGroups,
} from './offeredComponentKeyGroupsStore'

describe('useOfferComponentKeyGroups', () => {
  it('offers its groups while mounted and withdraws them on unmount', () => {
    const offered = renderHook(() => useOfferedComponentKeyGroups())
    const list = renderHook(() => useOfferComponentKeyGroups(['keys-list-move']))
    offered.rerender()
    expect(offered.result.current).toContain('keys-list-move')
    list.unmount()
    offered.rerender()
    expect(offered.result.current).not.toContain('keys-list-move')
  })

  it('keeps a group while any one offer of it stands', () => {
    const offered = renderHook(() => useOfferedComponentKeyGroups())
    const a = renderHook(() => useOfferComponentKeyGroups(['keys-list-open']))
    const b = renderHook(() => useOfferComponentKeyGroups(['keys-list-open']))
    a.unmount()
    offered.rerender()
    expect(offered.result.current).toContain('keys-list-open')
    b.unmount()
    offered.rerender()
    expect(offered.result.current).not.toContain('keys-list-open')
  })

  it('offers nothing while not live', () => {
    const offered = renderHook(() => useOfferedComponentKeyGroups())
    renderHook(() => useOfferComponentKeyGroups(['keys-close-panel'], false))
    offered.rerender()
    expect(offered.result.current).not.toContain('keys-close-panel')
  })
})
