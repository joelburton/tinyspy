// cs-unmet

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
import { errorUnder } from '../fields/errorUnder'

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

describe('ClaimHandleScreen — a taken username lands on the username box', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // `restoreAllMocks` restores SPIES; it does not reset a `vi.fn()`, so
    // without this the call below is still in the history when the next
    // describe asserts the RPC was never reached.
    mockRpc.mockReset()
  })

  // PN017 is the one thing this RPC refuses that a player can act on, and it
  // says which input it is about. Before the form held its values by name there
  // was nowhere for that to go, and the message sat on a line at the bottom
  // beside a color picker it had nothing to do with.
  it('shows the server message under the field the server named', async () => {
    mockRpc.mockResolvedValue({
      data: {
        type: 'not-ok',
        severity: 'validation',
        dbcode: 'PN017',
        field: 'desired',
        message: 'That username is taken',
      },
      error: null,
    })
    const user = userEvent.setup()
    render(<ClaimHandleScreen onClaimed={vi.fn()} email="zoe@test.local" />)

    const box = screen.getByRole('textbox', { name: /Username/ })
    await user.clear(box)
    await user.type(box, 'zoe')
    await user.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => expect(errorUnder('desired')).toBe('That username is taken'))
    // …and rings it. `aria-invalid` is what draws the ring, so this is the
    // assertion that the field LOOKS wrong rather than merely says so.
    expect(box).toHaveAttribute('aria-invalid', 'true')
  })
})

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
    // isn't mounted behind the needsClaim gate — and that's even truer now
    // that Log out lives in a page menu, since no page renders here at all.
    // There must always be a path back to LoginScreen.
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
