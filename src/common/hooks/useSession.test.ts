/**
 * Tests for useSession. The critical branch is the profile-verify
 * signOut: if the JWT decodes to a user whose profiles row is gone
 * (after a local `supabase db reset` or an admin-deleted user in
 * prod), the hook should silently sign out so the next interaction
 * starts a clean magic-link flow.
 *
 * Mocking strategy
 * ----------------
 * vi.mock replaces `../lib/supabase` with hand-built spies. The spies
 * are declared via vi.hoisted() so they're constructed BEFORE the
 * mock factory runs (vi.mock is hoisted above imports). Inside each
 * test we wire mockOnAuthStateChange to capture the callback the hook
 * registers, then invoke it manually to simulate the auth events
 * Supabase would emit on the real client.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockOnAuthStateChange, mockSignOut, mockMaybeSingle } = vi.hoisted(() => ({
  mockOnAuthStateChange: vi.fn(),
  mockSignOut: vi.fn(),
  mockMaybeSingle: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
    },
    // The hook's query is `supabase.schema('common').from('profiles')
    //   .select('user_id').eq('user_id', X).maybeSingle()` — we collapse
    // the whole chain (including schema()) to its terminal mock so we
    // don't have to model each intermediate method's return value.
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      }),
    }),
  },
}))

import { useSession } from './useSession'

const fakeSession = {
  user: { id: '11111111-1111-1111-1111-111111111111' },
} as unknown as Session

/** Captures the callback the hook subscribes with so tests can fire events. */
let authCb: ((event: string, session: Session | null) => void) | null = null

beforeEach(() => {
  authCb = null
  mockOnAuthStateChange.mockImplementation((cb) => {
    authCb = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  mockSignOut.mockResolvedValue({ error: null })
  mockMaybeSingle.mockResolvedValue({ data: { user_id: fakeSession.user.id }, error: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useSession', () => {
  it('starts in loading state with no session', () => {
    const { result } = renderHook(() => useSession())
    expect(result.current.loading).toBe(true)
    expect(result.current.session).toBeNull()
  })

  it('resolves to the session when the profile row exists', async () => {
    const { result } = renderHook(() => useSession())

    // Simulate the INITIAL_SESSION event that supabase-js fires on subscribe
    // with whatever's in localStorage.
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBe(fakeSession)
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('signs out when no profile exists for the session (stale JWT)', async () => {
    // The stale-session scenario: profile is gone but the JWT is still
    // valid. This is exactly what happens after `supabase db reset`
    // wiped auth.users while the browser still has localStorage.
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledOnce())
  })

  it('does not sign out on a transient profile-query error', async () => {
    // If the verify query errors transiently we shouldn't punish the
    // user — assume the session is valid and proceed. The console
    // warning is fine in tests; silence it so the run is clean.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'network blip' } })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBe(fakeSession)
    expect(mockSignOut).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('clears state on a SIGNED_OUT event without re-querying the profile', async () => {
    const { result } = renderHook(() => useSession())

    await act(async () => {
      authCb?.('SIGNED_OUT', null)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBeNull()
    // The SIGNED_OUT branch short-circuits before the verify query.
    expect(mockMaybeSingle).not.toHaveBeenCalled()
  })
})
