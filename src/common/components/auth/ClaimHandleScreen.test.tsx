import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockSignOut, mockRpc } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('../../lib/supabase/supabase', () => ({
  supabase: { auth: { signOut: mockSignOut } },
}))
// Mock the schema handle so importing the component doesn't pull in the
// real supabase client. The sign-out path under test never calls it.
vi.mock('../../db', () => ({ db: { rpc: mockRpc } }))

import { ClaimHandleScreen } from './ClaimHandleScreen'

// jsdom can't navigate, and `location.assign` is non-configurable (so it can't
// be spied directly) — but the `location` property itself can be swapped for a
// stub. Returns the mock so a test can assert where the escape redirected.
const realLocation = window.location
function stubLocation() {
  const assign = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign, href: realLocation.href },
  })
  return assign
}

describe('ClaimHandleScreen', () => {
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: realLocation,
    })
    vi.restoreAllMocks()
  })

  it('offers a sign-out escape so a stranded user is never stuck', async () => {
    // The regression: a user landing here on a stale session (e.g. the DB
    // was reset under them) had no way off this screen — the app chrome
    // (UserMenu) isn't mounted behind the needsClaim gate. There must
    // always be a path back to LoginScreen.
    mockSignOut.mockResolvedValue({ error: null })
    // The escape ends in a HARD redirect to "/". This is the actual fix:
    // signing out alone left users with a stale session stuck here, because
    // the auth listener didn't re-render.
    const assign = stubLocation()

    render(<ClaimHandleScreen onClaimed={() => {}} email={null} />)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    // The escape doesn't run the claim RPC.
    expect(mockRpc).not.toHaveBeenCalled()
    // …and it always lands them back at the root (→ LoginScreen).
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
  })

  it('redirects even when sign-out throws (a stale/invalid session)', async () => {
    // The whole point: a failed revoke must NOT block the escape.
    mockSignOut.mockRejectedValue(new Error('session not found'))
    const assign = stubLocation()

    render(<ClaimHandleScreen onClaimed={() => {}} email={null} />)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
  })
})
