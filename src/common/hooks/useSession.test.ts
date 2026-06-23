/**
 * Tests for useSession.
 *
 * The hook resolves to one of three states for any signed-in user:
 *   - `loading` → true while the initial profile probe is in flight
 *   - `needsClaim` → session exists but the user hasn't claimed a
 *                    handle yet (no common.profiles row)
 *   - claimed     → session AND profile both exist; the app routes
 *                   to HomePage and friends
 *
 * The "no profile" state used to force a signOut; it now surfaces
 * as `needsClaim: true` so App.tsx can route to ClaimHandleScreen.
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

const { mockOnAuthStateChange, mockSignOut, mockMaybeSingle, mockGetUser } = vi.hoisted(() => ({
  mockOnAuthStateChange: vi.fn(),
  mockSignOut: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
      getUser: mockGetUser,
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
  user: { id: 'ada11111-1111-1111-1111-111111111111' },
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
  // Default: getUser confirms the stored session is valid. The
  // tests that exercise the "JWT outlived the user" path override
  // this with mockGetUser.mockResolvedValueOnce({...}).
  mockGetUser.mockResolvedValue({
    data: { user: { id: fakeSession.user.id } },
    error: null,
  })
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

  it('resolves to claimed state when the profile row exists', async () => {
    const { result } = renderHook(() => useSession())

    // Simulate the INITIAL_SESSION event that supabase-js fires on subscribe
    // with whatever's in localStorage.
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBe(fakeSession)
    expect(result.current.needsClaim).toBe(false)
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('reports needsClaim=true when no profile exists yet', async () => {
    // The "fresh sign-in" path: user just authenticated via magic
    // link, no profiles row materialized yet. The hook should NOT
    // sign them out — App.tsx routes to ClaimHandleScreen.
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBe(fakeSession)
    expect(result.current.needsClaim).toBe(true)
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('treats a transient profile-query error as needsClaim (not signOut)', async () => {
    // Over-permissive on probe errors — same friends-alpha tradeoff as
    // the old "don't punish on transient blips" behavior. Worst case
    // the user lands on ClaimHandleScreen and the claim attempt fails
    // with an explicit "profile already claimed" if they already have
    // one. Silence the warn so the run is clean.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'network blip' } })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBe(fakeSession)
    expect(result.current.needsClaim).toBe(true)
    expect(mockSignOut).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('signs out when the stored JWT refers to a deleted user (4xx from getUser)', async () => {
    // The "db:reset wiped auth.users while a JWT is still in
    // localStorage" case: getUser returns a 401-ish AuthError.
    // The hook must call signOut so the next render falls back
    // to LoginScreen — without this, the user lands on
    // ClaimHandleScreen and the claim attempt fails with 23503,
    // which surfaces as a confusing inline error rather than a
    // clean restart.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: Object.assign(new Error('User from sub claim in JWT does not exist'), {
        status: 403,
      }),
    })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(result.current.session).toBeNull()
    expect(result.current.needsClaim).toBe(false)
    // We never reached the profile probe — the auth check
    // short-circuited.
    expect(mockMaybeSingle).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('treats a transient getUser error as trust-the-session (no signOut)', async () => {
    // 5xx / network-down case: Supabase is reachable enough to
    // attempt the request but the response is unusable. Friends-
    // alpha posture is "trust the stored session, proceed to the
    // profile probe" — better than booting the user out every
    // time Supabase has a hiccup.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: Object.assign(new Error('upstream timeout'), { status: 503 }),
    })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(result.current.session).toBe(fakeSession)
    expect(result.current.needsClaim).toBe(false)  // profile probe defaulted to claimed
    warnSpy.mockRestore()
  })

  it('signs out when getUser fails WITHOUT a clean 4xx status (the strand regression)', async () => {
    // The real stale-session errors don't always carry a 4xx `status`:
    // an expired token whose refresh fails surfaces as a session-missing
    // / auth error, sometimes with `status` undefined. The previous
    // 4xx-status-only check let those slip through to the permissive
    // branch, stranding the user on ClaimHandleScreen with no recovery.
    // Any non-transient getUser failure must now sign out.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: Object.assign(new Error('Auth session missing!'), {
        name: 'AuthSessionMissingError',
        // no `status` — the exact shape the old check mis-read as transient
      }),
    })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(result.current.session).toBeNull()
    expect(result.current.needsClaim).toBe(false)
    expect(mockMaybeSingle).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('still trusts the stored session on a retryable network error (no signOut)', async () => {
    // A genuine connectivity blip — keep them signed in, don't boot on a
    // hiccup. This is the one error class that stays permissive.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: Object.assign(new Error('Failed to fetch'), {
        name: 'AuthRetryableFetchError',
      }),
    })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(result.current.session).toBe(fakeSession)
    warnSpy.mockRestore()
  })

  it('clears state on a SIGNED_OUT event without re-querying the profile', async () => {
    const { result } = renderHook(() => useSession())

    await act(async () => {
      authCb?.('SIGNED_OUT', null)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBeNull()
    expect(result.current.needsClaim).toBe(false)
    // The SIGNED_OUT branch short-circuits before the verify query.
    expect(mockMaybeSingle).not.toHaveBeenCalled()
  })
})
