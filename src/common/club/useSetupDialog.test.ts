// cs-blessed-club-page

/**
 * TWO WAYS INTO ONE DIALOG, AND ONE WAY OUT.
 *
 * A start row's press and a `?new=<gametype>` arrival open the same dialog, and
 * the hook's whole job is that everything downstream sees one answer rather
 * than asking which way it was opened. So the tests are about the collapse: a
 * press beats a pending intent, and closing consumes the intent so a re-render
 * cannot re-open it.
 *
 * The MISSES are the other half, and they are not the same miss. A `?new=`
 * this club cannot honor — no such game, or a game it does not play — is a
 * wrong link: the dialog stays shut and a toast says which. A PRESS naming no
 * game cannot happen at all — the start list presses with a manifest's own
 * gametype — so it faults.
 *
 * `navigate` is mocked because closing drops `?new=` from the URL, and jsdom
 * would otherwise be asked to perform a real navigation.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RefObject } from 'react'

const { mockNavigate, mockShowFault, mockShowToast, REGISTRY, WORDLE, SYRUP } = vi.hoisted(() => {
  const manifest = (gametype: string, name: string) => ({ gametype, name })
  const WORDLE = manifest('wordle_coop', 'WordNerd')
  const SYRUP = manifest('syrup_coop', 'SyrupSwap')
  return {
    mockNavigate: vi.fn(),
    mockShowFault: vi.fn(),
    mockShowToast: vi.fn(),
    REGISTRY: [WORDLE, SYRUP],
    WORDLE,
    SYRUP,
  }
})

vi.mock('../routing/router', () => ({ navigate: mockNavigate }))
vi.mock('../faults/faultStore', () => ({ showFaultModal: mockShowFault }))
vi.mock('../toasts/toastStore', () => ({ showToast: mockShowToast }))
// The registry AND its lookup, from one list: `manifestFor` reads the registry,
// so a mock supplying only the list would let the two disagree.
vi.mock('@/gametypes', () => ({
  gametypes: REGISTRY,
  manifestFor: (gametype: string) => REGISTRY.find((g) => g.gametype === gametype),
}))

import { useSetupDialog } from './useSetupDialog'

/** A ref whose `focus` can be asserted — the real one is the start list's. */
function listRef() {
  const focus = vi.fn()
  const ref = { current: { focus } as unknown as HTMLDivElement }
  return { ref: ref as RefObject<HTMLDivElement | null>, focus }
}

/** The hook's options, for a club — Trio — that plays WordNerd and not
 *  SyrupSwap. */
function options(ref = listRef().ref) {
  return { startListRef: ref, clubName: 'Trio', clubGametypes: new Set(['wordle_coop']) }
}

function at(url: string) {
  window.history.replaceState(null, '', url)
}

beforeEach(() => {
  mockNavigate.mockReset()
  mockShowFault.mockReset()
  mockShowToast.mockReset()
  at('/c/trio')
})

describe('useSetupDialog', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useSetupDialog(options()))
    expect(result.current.manifest).toBeNull()
  })

  it('opens on a pressed gametype', () => {
    const { result } = renderHook(() => useSetupDialog(options()))
    act(() => result.current.open('syrup_coop'))
    expect(result.current.manifest).toBe(SYRUP)
  })

  it('faults on a press for a gametype this bundle does not have', () => {
    // Unreachable in the app — the start list presses with a manifest's own
    // gametype. Pinned because the alternative to a fault is a press that does
    // nothing and explains nothing.
    const { result } = renderHook(() => useSetupDialog(options()))
    act(() => result.current.open('gametype_from_the_future'))
    expect(result.current.manifest).toBeNull()
    expect(mockShowFault).toHaveBeenCalledTimes(1)
    expect(mockShowFault.mock.calls[0]![0]!.diagnostics).toContain('gametype_from_the_future')
  })

  it('opens from ?new= with no press at all', () => {
    at('/c/trio?new=wordle_coop')
    const { result } = renderHook(() => useSetupDialog(options()))
    expect(result.current.manifest).toBe(WORDLE)
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('opens nothing for a ?new= naming no game, and says so until dismissed', () => {
    // A wrong link is not a bug, so nothing faults the way a bad press does.
    at('/c/trio?new=gametype_from_the_future')
    const { result } = renderHook(() => useSetupDialog(options()))
    expect(result.current.manifest).toBeNull()
    expect(mockShowFault).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledTimes(1)
    const toast = mockShowToast.mock.calls[0]![0]!
    expect(toast.message).toContain('no game type called "gametype_from_the_future"')
    expect(toast.ms).toBeUndefined()
  })

  it('says something DIFFERENT for a real game this club does not play', () => {
    // The start list is what otherwise keeps a club to its own games, and a
    // link skips it.
    at('/c/trio?new=syrup_coop')
    const { result } = renderHook(() => useSetupDialog(options()))
    expect(result.current.manifest).toBeNull()
    expect(mockShowToast.mock.calls[0]![0]!.message).toContain("Trio doesn't play SyrupSwap")
  })

  it('drops a ?new= it could not honor from the URL', () => {
    at('/c/trio?new=syrup_coop')
    renderHook(() => useSetupDialog(options()))
    expect(mockNavigate).toHaveBeenCalledWith('/c/trio', true)
  })

  it('a press wins over a pending intent', () => {
    at('/c/trio?new=wordle_coop')
    const { result } = renderHook(() => useSetupDialog(options()))
    act(() => result.current.open('syrup_coop'))
    expect(result.current.manifest).toBe(SYRUP)
  })

  it('closing consumes the intent, so nothing re-opens it', () => {
    at('/c/trio?new=wordle_coop')
    const { result, rerender } = renderHook(() => useSetupDialog(options()))
    act(() => result.current.close())

    expect(result.current.manifest).toBeNull()
    // The value is read once at mount, so only `hasBeenClosed` stands between
    // a re-render and the dialog opening again.
    rerender()
    expect(result.current.manifest).toBeNull()
  })

  it('closing drops ?new= from the URL so a refresh does not re-open it', () => {
    at('/c/trio?new=wordle_coop')
    const { result } = renderHook(() => useSetupDialog(options()))
    act(() => result.current.close())
    expect(mockNavigate).toHaveBeenCalledWith('/c/trio', true)
  })

  it('leaves the URL alone when there was no query to drop', () => {
    const { result } = renderHook(() => useSetupDialog(options()))
    act(() => result.current.open('syrup_coop'))
    act(() => result.current.close())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('hands focus back to the start list', () => {
    // The dialog autofocuses a field inside itself, so on unmount that focus
    // dies and lands on <body> — which blanks the list's Up/Down cursor.
    const { ref, focus } = listRef()
    const { result } = renderHook(() => useSetupDialog(options(ref)))
    act(() => result.current.open('syrup_coop'))
    act(() => result.current.close())
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })
})
