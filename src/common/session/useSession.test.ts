// cs-audited-session

/**
 * Tests for useSession — the states `App` gates on, and what the hook asks the
 * server for to reach them:
 *
 *   - `loading`      → the moment before the first answer
 *   - `needsClaim`   → signed in with no `common.profiles` row, so the claim
 *                      screen and nothing else
 *   - claimed        → session and row both there; the app proper
 *   - `probeFailed`  → the read failed, so which of the two above is true is
 *                      unknown, and `App` renders the error page
 *
 * Mocking strategy
 * ----------------
 * `vi.mock` replaces `'../supabase/supabase'` — the client itself — with
 * hand-built spies, declared via `vi.hoisted()` so they exist before the mock
 * factory runs (`vi.mock` is hoisted above imports). The hook's queries go
 * through `'../supabase/db'`, which is `supabase.schema('common')`, so mocking
 * `schema` is what puts the fake in the query's path.
 *
 * The whole builder chain collapses to one terminal spy: `eq()` is what the
 * hook awaits, since zero rows is a real answer here rather than something to
 * ask PostgREST to turn into an error. Each test then wires
 * `mockOnAuthStateChange` to capture the callback the hook registers and fires
 * the auth events by hand.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockOnAuthStateChange, mockSignOut, mockProfileRows, mockGetUser } = vi.hoisted(() => ({
  mockOnAuthStateChange: vi.fn(),
  mockSignOut: vi.fn(),
  mockProfileRows: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('../supabase/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
      getUser: mockGetUser,
    },
    // The query being stood in for: `supabase.schema('common').from('profiles')
    //   .select('username, color, can_edit_words').eq('user_id', X)`.
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: mockProfileRows,
        }),
      }),
    }),
  },
}))

import { useSession } from './useSession'
import { useProfile } from './useProfile'

const fakeSession = {
  user: { id: 'ada11111-1111-1111-1111-111111111111' },
} as unknown as Session

/** What the probe reads — the whole profile, since it seeds the store too. */
const PROFILE_ROW = { username: 'ada', color: '#c0392b', can_edit_words: false }

/** Captures the callback the hook subscribes with so tests can fire events. */
let authCb: ((event: string, session: Session | null) => void) | null = null

beforeEach(() => {
  authCb = null
  mockOnAuthStateChange.mockImplementation((cb) => {
    authCb = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  mockSignOut.mockResolvedValue({ error: null })
  mockProfileRows.mockResolvedValue({ data: [PROFILE_ROW], error: null })
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
    mockProfileRows.mockResolvedValueOnce({ data: [], error: null })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBe(fakeSession)
    expect(result.current.needsClaim).toBe(true)
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('reports a failed profile read as its own state, not as needsClaim', async () => {
    // A read that fails says nothing about whether this person has claimed a
    // username, so the hook stops guessing and hands the envelope up; App
    // gives it the error page. The session survives — the JWT was verified
    // before the read — and nobody is signed out over a blip.
    //
    // The noise this silences is the `[db] … FAULT` line, which is written
    // even though the probe opts out of the modal (`presentFaults: false`),
    // and `console.error` is the method a FAULT maps to.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockProfileRows.mockResolvedValueOnce({ data: null, error: { message: 'network blip' } })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBe(fakeSession)
    expect(result.current.probeFailed?.type).toBe('not-ok')
    expect(result.current.needsClaim).toBe(false)
    expect(mockSignOut).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('clears the failed state when the retry succeeds', async () => {
    // What the error page's "Try again" does: `refresh()` re-runs the same
    // probe, and a second answer replaces the first.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockProfileRows.mockResolvedValueOnce({ data: null, error: { message: 'network blip' } })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })
    await waitFor(() => expect(result.current.probeFailed).not.toBeNull())

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.probeFailed).toBeNull()
    expect(result.current.needsClaim).toBe(false)
    expect(result.current.session).toBe(fakeSession)
    errorSpy.mockRestore()
  })

  it('signs out when the stored JWT refers to a deleted user (4xx from getUser)', async () => {
    // The "db:reset wiped auth.users while a JWT is still in localStorage"
    // case: getUser returns a 401-ish AuthError. Signing out is what makes the
    // next render LoginScreen; the alternative is the claim screen, where the
    // RPC raises PN018 and signs them out anyway — a confusing detour to the
    // same place.
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
    expect(mockProfileRows).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('treats a transient getUser error as trust-the-session (no signOut)', async () => {
    // 5xx / network-down case: Supabase is reachable enough to attempt the
    // request but the response is unusable, which says nothing about the user.
    // So the stored session is trusted and the probe goes ahead — better than
    // booting everyone out whenever Supabase has a hiccup.
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
    expect(result.current.needsClaim).toBe(false)  // the probe ran and found the row
    warnSpy.mockRestore()
  })

  it('signs out on an auth error carrying no status at all', async () => {
    // The shape that makes the rule "sign out unless provably transient"
    // rather than "sign out on a 4xx": an expired token whose refresh fails
    // arrives as AuthSessionMissingError with no `status`, so a status-only
    // test reads it as a blip and leaves the person stranded.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: Object.assign(new Error('Auth session missing!'), {
        name: 'AuthSessionMissingError',
        // no `status` — deliberately, that is the case under test
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
    expect(mockProfileRows).not.toHaveBeenCalled()
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
    expect(mockProfileRows).not.toHaveBeenCalled()
  })
})

describe('useSession probes per user, not per event', () => {
  // auth-js fires TOKEN_REFRESHED hourly and SIGNED_IN again on tab focus, and
  // says as much in its own docs. What the hook asks the server is therefore
  // keyed on WHO the event carries.
  const sameUserAgain = { user: { id: fakeSession.user.id } } as unknown as Session

  it('takes the fresher session without re-reading anything', async () => {
    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetUser).toHaveBeenCalledTimes(1)
    expect(mockProfileRows).toHaveBeenCalledTimes(1)

    await act(async () => {
      await authCb?.('TOKEN_REFRESHED', sameUserAgain)
    })

    expect(mockGetUser).toHaveBeenCalledTimes(1)
    expect(mockProfileRows).toHaveBeenCalledTimes(1)
    // The new token still lands: it is the session object every page holds.
    expect(result.current.session).toBe(sameUserAgain)
  })

  it('probes again when the event carries a different user', async () => {
    const otherUser = { user: { id: 'bee22222-2222-2222-2222-222222222222' } } as unknown as Session

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await authCb?.('SIGNED_IN', otherUser)
    })

    await waitFor(() => expect(result.current.session).toBe(otherUser))
    expect(mockProfileRows).toHaveBeenCalledTimes(2)
  })

  it('retries after a failed probe, rather than treating the user as answered', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockProfileRows.mockResolvedValueOnce({ data: null, error: { message: 'network blip' } })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })
    await waitFor(() => expect(result.current.probeFailed).not.toBeNull())

    await act(async () => {
      await authCb?.('TOKEN_REFRESHED', sameUserAgain)
    })

    await waitFor(() => expect(result.current.probeFailed).toBeNull())
    expect(mockProfileRows).toHaveBeenCalledTimes(2)
    errorSpy.mockRestore()
  })
})

describe('useSession seeds the profile store', () => {
  // The probe is the app's ONE read of the profiles row: what it finds is what
  // `useProfile` hands every page, so these two cases are the whole contract
  // between the hook and the store.
  it('fills the store from the probed row, before loading clears', async () => {
    const { result } = renderHook(() => ({ session: useSession(), profile: useProfile() }))

    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })

    await waitFor(() => expect(result.current.session.loading).toBe(false))
    expect(result.current.profile).toEqual(PROFILE_ROW)
  })

  it('empties the store on SIGNED_OUT, so the next user sees nobody', async () => {
    const { result } = renderHook(() => ({ session: useSession(), profile: useProfile() }))

    await act(async () => {
      await authCb?.('INITIAL_SESSION', fakeSession)
    })
    await waitFor(() => expect(result.current.profile).toEqual(PROFILE_ROW))

    await act(async () => {
      authCb?.('SIGNED_OUT', null)
    })
    expect(result.current.profile).toBeNull()
  })
})
