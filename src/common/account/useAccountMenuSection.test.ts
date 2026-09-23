// cs-blessed-account

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/**
 * Tests for the account submenu's LOG OUT action.
 *
 * A sign-out reaches no wrapper — `/auth/v1/` is outside the envelope system —
 * so nothing above this hook would notice a failure. And a failed revoke leaves
 * the local session in place, so nothing below it would either: the screen
 * simply does not change. What these pin is that the hook itself raises the
 * fault, and that the fault carries everything a `[db]` line is supposed to.
 *
 * The auth client is mocked; every layer under it is real, because the routing
 * through `reportDbFault` is the thing being tested.
 */

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }))

vi.mock('../supabase/supabase', () => ({
  supabase: { auth: { signOut: signOutMock } },
}))

vi.mock('../session/useProfile', () => ({
  useProfile: () => ({
    user_id: 'u1',
    username: 'joel',
    color: 'red',
    can_edit_words: false,
    sounds_enabled: true,
  }),
}))

import { clearFaultsForTest, peekFaultsForTest } from '../faults/faultStore'
import { useAccountMenuSection } from './useAccountMenuSection'

/** The bound Log out action, off the submenu row the hook returns. */
function renderLogOut() {
  const { result } = renderHook(() => useAccountMenuSection())
  const row = result.current.items[0]
  const logOut = 'items' in row ? row.items.find((a) => a.id === 'act-log-out') : undefined
  if (!logOut) throw new Error('the account submenu has no act-log-out')
  return logOut
}

/** The one fault on the queue, or a failure naming how many there really are. */
function onlyFault() {
  const faults = peekFaultsForTest()
  expect(faults).toHaveLength(1)
  return faults[0]
}

beforeEach(() => {
  clearFaultsForTest()
  vi.clearAllMocks()
  // Every path writes a `[db]` line, and a test that let it through would print
  // a red line per run for a failure it asked for.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('log out', () => {
  it('says nothing when the sign-out works', async () => {
    signOutMock.mockResolvedValue({ error: null })
    const logOut = renderLogOut()
    await act(async () => {
      logOut.run()
    })
    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  // THE WHOLE POINT. `GoTrueClient._signOut` returns before it clears the local
  // session, so on a failure you are still signed in and no `SIGNED_OUT` event
  // is coming — nothing else on screen would say so.
  it('raises a fault when the sign-out fails', async () => {
    signOutMock.mockResolvedValue({
      error: { name: 'AuthApiError', message: 'Invalid token', status: 401 },
    })
    const logOut = renderLogOut()
    await act(async () => {
      logOut.run()
    })
    expect(String(onlyFault().text)).toBe(
      "We couldn't sign you out, so you're still signed in. Please check your connection and try again.",
    )
  })

  it('carries the code, the call and the status on the diagnostics line', async () => {
    signOutMock.mockResolvedValue({
      error: { name: 'AuthApiError', message: 'Invalid token', status: 401 },
    })
    const logOut = renderLogOut()
    await act(async () => {
      logOut.run()
    })
    const { diagnostics } = onlyFault()
    expect(diagnostics).toContain('FAULT')
    expect(diagnostics).toContain('POST /auth/v1/logout')
    expect(diagnostics).toContain('dbcode=PN492')
    expect(diagnostics).toContain('severity=fault')
    expect(diagnostics).toContain('status=401')
  })

  // Both halves of the detail, joined — the device's own state and the auth
  // service's string. Either one alone leaves a question the other answers:
  // "the service refused" and "this phone was on a train" are one line apart.
  it('keeps the device state AND the auth error in the detail', async () => {
    signOutMock.mockResolvedValue({
      error: { name: 'AuthApiError', message: 'Invalid token', status: 401 },
    })
    const logOut = renderLogOut()
    await act(async () => {
      logOut.run()
    })
    const { diagnostics } = onlyFault()
    expect(diagnostics).toContain('online=true')
    expect(diagnostics).toContain('AuthApiError: Invalid token')
  })

  // Nothing answered at all — the auth client reports `status: 0`. The line's
  // blank `status=` is what separates this from the case above, and it is why
  // one code covers both: either way you are still signed in.
  it('reports the same code with a blank status when nothing answered', async () => {
    signOutMock.mockResolvedValue({
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 },
    })
    const logOut = renderLogOut()
    await act(async () => {
      logOut.run()
    })
    const { diagnostics } = onlyFault()
    expect(diagnostics).toContain('dbcode=PN492')
    expect(diagnostics).toContain('status=0')
    expect(diagnostics).toContain('AuthRetryableFetchError: Failed to fetch')
  })

  // The player's sentence is ours, from the code table. GoTrue's own words are
  // written for a sign-in form, and on this screen they would explain nothing.
  it('never shows the auth service its own words', async () => {
    signOutMock.mockResolvedValue({
      error: { name: 'AuthApiError', message: 'Invalid token', status: 401 },
    })
    const logOut = renderLogOut()
    await act(async () => {
      logOut.run()
    })
    expect(String(onlyFault().text)).not.toContain('Invalid token')
  })
})
