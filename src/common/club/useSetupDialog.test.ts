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
 * PAW PROTECTION asks before either opening, and is mocked: what matters here
 * is that a no opens nothing, for a press and for a link alike, and that the
 * link is dropped without a toast — the card said it all.
 *
 * `navigate` is mocked because closing drops `?new=` from the URL, and jsdom
 * would otherwise be asked to perform a real navigation.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RefObject } from 'react'

const { mockNavigate, mockShowFault, mockShowToast, mockEnsureCanStart, REGISTRY, WORDLE, SYRUP } = vi.hoisted(() => {
  const manifest = (gametype: string, name: string) => ({ gametype, name })
  const WORDLE = manifest('wordle_coop', 'WordNerd')
  const SYRUP = manifest('syrup_coop', 'SyrupSwap')
  return {
    mockNavigate: vi.fn(),
    mockShowFault: vi.fn(),
    mockShowToast: vi.fn(),
    mockEnsureCanStart: vi.fn(),
    REGISTRY: [WORDLE, SYRUP],
    WORDLE,
    SYRUP,
  }
})

vi.mock('../routing/router', () => ({ navigate: mockNavigate }))
vi.mock('../faults/faultStore', () => ({ showFaultModal: mockShowFault }))
vi.mock('../toasts/toastStore', () => ({ showToast: mockShowToast }))
vi.mock('../paw-protection/pawProtectionService', () => ({ ensureCanStart: mockEnsureCanStart }))
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
  return { startListRef: ref, clubHandle: 'trio', clubName: 'Trio', clubGametypes: new Set(['wordle_coop']) }
}

function at(url: string) {
  window.history.replaceState(null, '', url)
}

/** Press a start row and let paw protection answer. */
async function press(result: { current: ReturnType<typeof useSetupDialog> }, gametype: string) {
  await act(async () => { await result.current.open(gametype) })
}

beforeEach(() => {
  mockNavigate.mockReset()
  mockShowFault.mockReset()
  mockShowToast.mockReset()
  mockEnsureCanStart.mockReset()
  mockEnsureCanStart.mockResolvedValue(true)
  at('/c/trio')
})

describe('useSetupDialog', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useSetupDialog(options()))
    expect(result.current.manifest).toBeNull()
  })

  it('opens on a pressed gametype, once paw protection says yes', async () => {
    const { result } = renderHook(() => useSetupDialog(options()))
    await press(result, 'syrup_coop')
    expect(result.current.manifest).toBe(SYRUP)
    expect(mockEnsureCanStart).toHaveBeenCalledWith({ clubHandle: 'trio', gametype: 'syrup_coop' })
  })

  it('opens nothing on a press paw protection refuses', async () => {
    mockEnsureCanStart.mockResolvedValue(false)
    const { result } = renderHook(() => useSetupDialog(options()))
    await press(result, 'syrup_coop')
    expect(result.current.manifest).toBeNull()
    expect(mockShowFault).not.toHaveBeenCalled()
  })

  it('faults on a press for a gametype this bundle does not have', async () => {
    // Unreachable in the app — the start list presses with a manifest's own
    // gametype. Pinned because the alternative to a fault is a press that does
    // nothing and explains nothing.
    const { result } = renderHook(() => useSetupDialog(options()))
    await press(result, 'gametype_from_the_future')
    expect(result.current.manifest).toBeNull()
    expect(mockShowFault).toHaveBeenCalledTimes(1)
    expect(mockShowFault.mock.calls[0]![0]!.diagnostics).toContain('gametype_from_the_future')
    expect(mockEnsureCanStart).not.toHaveBeenCalled()
  })

  it('opens from ?new= with no press at all, once paw protection says yes', async () => {
    at('/c/trio?new=wordle_coop')
    const { result } = renderHook(() => useSetupDialog(options()))
    await waitFor(() => expect(result.current.manifest).toBe(WORDLE))
    expect(mockEnsureCanStart).toHaveBeenCalledWith({ clubHandle: 'trio', gametype: 'wordle_coop' })
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('opens nothing from a ?new= paw protection refuses, drops it, and says nothing more', async () => {
    // The card is the whole answer; a toast beside it would say it twice.
    mockEnsureCanStart.mockResolvedValue(false)
    at('/c/trio?new=wordle_coop')
    const { result } = renderHook(() => useSetupDialog(options()))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/c/trio', true))
    expect(result.current.manifest).toBeNull()
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
    expect(mockEnsureCanStart).not.toHaveBeenCalled()
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

  it('a press wins over a pending intent', async () => {
    at('/c/trio?new=wordle_coop')
    const { result } = renderHook(() => useSetupDialog(options()))
    await press(result, 'syrup_coop')
    expect(result.current.manifest).toBe(SYRUP)
  })

  it('closing consumes the intent, so nothing re-opens it', async () => {
    at('/c/trio?new=wordle_coop')
    const { result, rerender } = renderHook(() => useSetupDialog(options()))
    await waitFor(() => expect(result.current.manifest).toBe(WORDLE))
    act(() => result.current.close())

    expect(result.current.manifest).toBeNull()
    // The value is read once at mount, so only `hasBeenClosed` stands between
    // a re-render and the dialog opening again.
    rerender()
    expect(result.current.manifest).toBeNull()
  })

  it('closing drops ?new= from the URL so a refresh does not re-open it', async () => {
    at('/c/trio?new=wordle_coop')
    const { result } = renderHook(() => useSetupDialog(options()))
    await waitFor(() => expect(result.current.manifest).toBe(WORDLE))
    act(() => result.current.close())
    expect(mockNavigate).toHaveBeenCalledWith('/c/trio', true)
  })

  it('leaves the URL alone when there was no query to drop', async () => {
    const { result } = renderHook(() => useSetupDialog(options()))
    await press(result, 'syrup_coop')
    act(() => result.current.close())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('hands focus back to the start list', async () => {
    // The dialog autofocuses a field inside itself, so on unmount that focus
    // dies and lands on <body> — which blanks the list's Up/Down cursor.
    const { ref, focus } = listRef()
    const { result } = renderHook(() => useSetupDialog(options(ref)))
    await press(result, 'syrup_coop')
    act(() => result.current.close())
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })
})
