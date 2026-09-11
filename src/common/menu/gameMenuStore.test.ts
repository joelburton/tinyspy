// cs-audited-menu

/**
 * The store's whole job is that a PUSH reaches the menu, and that is exactly
 * the part an end-to-end test cannot see: a game page re-renders constantly
 * (realtime, the clock, presence), so the menu would pick up new sections on
 * the next render whether or not anything told it to. A broken notify looks
 * fine on screen and then strands a menu the one time the page is still.
 *
 * So the subscription is asserted here, with nothing else moving.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { setGameMenuSections, useGameMenuSections } from './gameMenuStore'
import { boundActionFixture } from '../actions/boundAction.fixture'
import type { MenuSection } from './menuModel'

const section = (...ids: Parameters<typeof boundActionFixture>[0][]): MenuSection => ({
  items: ids.map((id) => boundActionFixture(id)),
})

// A module slot outlives a test, the way it outlives a render.
beforeEach(() => setGameMenuSections([]))

describe('gameMenuStore', () => {
  it('hands back what was pushed', () => {
    const { result } = renderHook(() => useGameMenuSections())
    expect(result.current).toEqual([])

    act(() => setGameMenuSections([section('act-help', 'act-restart')]))
    expect(result.current[0]?.items.map((i) => 'id' in i && i.id)).toEqual([
      'act-help',
      'act-restart',
    ])
  })

  it('re-renders a subscriber, with nothing else changing', () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useGameMenuSections()
    })
    const before = renders

    act(() => setGameMenuSections([section('act-new-game')]))

    // The push alone did it — no state, no props, no parent.
    expect(renders).toBeGreaterThan(before)
    expect(result.current).toHaveLength(1)
  })

  it('clears, which is what a PlayArea unmounting does', () => {
    const { result } = renderHook(() => useGameMenuSections())
    act(() => setGameMenuSections([section('act-help')]))
    act(() => setGameMenuSections([]))
    expect(result.current).toEqual([])
  })

  it('stops notifying a subscriber that has gone', () => {
    let renders = 0
    const { unmount } = renderHook(() => {
      renders += 1
      return useGameMenuSections()
    })
    unmount()
    const after = renders
    act(() => setGameMenuSections([section('act-help')]))
    expect(renders).toBe(after)
  })
})
