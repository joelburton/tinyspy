// cs-audited-club-page

/**
 * TWO WAYS INTO ONE DIALOG, AND ONE WAY OUT.
 *
 * A start row's press and a `?new=<gametype>` arrival open the same dialog, and
 * the hook's whole job is that everything downstream sees one answer rather
 * than asking which way it was opened. So the tests are about the collapse: a
 * press beats a pending intent, closing consumes the intent so a re-render
 * cannot re-open it, and an intent naming a gametype this bundle does not have
 * is simply not an opening.
 *
 * `navigate` is mocked because closing drops `?new=` from the URL, and jsdom
 * would otherwise be asked to perform a real navigation.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RefObject } from 'react'

const { mockNavigate, WORDLE, SYRUP } = vi.hoisted(() => {
  const manifest = (gametype: string) => ({ gametype, name: gametype })
  return {
    mockNavigate: vi.fn(),
    WORDLE: manifest('wordle_coop'),
    SYRUP: manifest('syrup_coop'),
  }
})

vi.mock('../routing/router', () => ({ navigate: mockNavigate }))
vi.mock('@/gametypes', () => ({ gametypes: [WORDLE, SYRUP] }))

import { useSetupDialog } from './useSetupDialog'

/** A ref whose `focus` can be asserted — the real one is the start list's. */
function listRef() {
  const focus = vi.fn()
  const ref = { current: { focus } as unknown as HTMLDivElement }
  return { ref: ref as RefObject<HTMLDivElement | null>, focus }
}

function at(url: string) {
  window.history.replaceState(null, '', url)
}

beforeEach(() => {
  mockNavigate.mockReset()
  at('/c/trio')
})

describe('useSetupDialog', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useSetupDialog(listRef().ref))
    expect(result.current.manifest).toBeNull()
  })

  it('opens on a pressed gametype', () => {
    const { result } = renderHook(() => useSetupDialog(listRef().ref))
    act(() => result.current.open('syrup_coop'))
    expect(result.current.manifest).toBe(SYRUP)
  })

  it('ignores a press on a gametype this bundle does not have', () => {
    const { result } = renderHook(() => useSetupDialog(listRef().ref))
    act(() => result.current.open('gametype_from_the_future'))
    expect(result.current.manifest).toBeNull()
  })

  it('opens from ?new= with no press at all', () => {
    at('/c/trio?new=wordle_coop')
    const { result } = renderHook(() => useSetupDialog(listRef().ref))
    expect(result.current.manifest).toBe(WORDLE)
  })

  it('stays closed for a ?new= naming a gametype this bundle does not have', () => {
    at('/c/trio?new=gametype_from_the_future')
    const { result } = renderHook(() => useSetupDialog(listRef().ref))
    expect(result.current.manifest).toBeNull()
  })

  it('a press wins over a pending intent', () => {
    at('/c/trio?new=wordle_coop')
    const { result } = renderHook(() => useSetupDialog(listRef().ref))
    act(() => result.current.open('syrup_coop'))
    expect(result.current.manifest).toBe(SYRUP)
  })

  it('closing consumes the intent, so nothing re-opens it', () => {
    at('/c/trio?new=wordle_coop')
    const { result, rerender } = renderHook(() => useSetupDialog(listRef().ref))
    act(() => result.current.close())

    expect(result.current.manifest).toBeNull()
    // The value is read once at mount, so only `requestConsumed` stands between
    // a re-render and the dialog opening again.
    rerender()
    expect(result.current.manifest).toBeNull()
  })

  it('closing drops ?new= from the URL so a refresh does not re-open it', () => {
    at('/c/trio?new=wordle_coop')
    const { result } = renderHook(() => useSetupDialog(listRef().ref))
    act(() => result.current.close())
    expect(mockNavigate).toHaveBeenCalledWith('/c/trio', true)
  })

  it('leaves the URL alone when there was no query to drop', () => {
    const { result } = renderHook(() => useSetupDialog(listRef().ref))
    act(() => result.current.open('syrup_coop'))
    act(() => result.current.close())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('hands focus back to the start list', () => {
    // The dialog autofocuses a field inside itself, so on unmount that focus
    // dies and lands on <body> — which blanks the list's Up/Down cursor.
    const { ref, focus } = listRef()
    const { result } = renderHook(() => useSetupDialog(ref))
    act(() => result.current.open('syrup_coop'))
    act(() => result.current.close())
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })
})
