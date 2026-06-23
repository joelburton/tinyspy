import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { mockSignOut, mockRpc } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: mockSignOut } },
}))
// Mock the schema handle so importing the component doesn't pull in the
// real supabase client. The sign-out path under test never calls it.
vi.mock('../db', () => ({ db: { rpc: mockRpc } }))

import { ClaimHandleScreen } from './ClaimHandleScreen'

describe('ClaimHandleScreen', () => {
  it('offers a sign-out escape so a stranded user is never stuck', async () => {
    // The regression: a user landing here on a stale session (e.g. the DB
    // was reset under them) had no way off this screen — the app chrome
    // (UserMenu) isn't mounted behind the needsClaim gate. There must
    // always be a path back to LoginScreen.
    mockSignOut.mockResolvedValue({ error: null })
    render(<ClaimHandleScreen onClaimed={() => {}} email={null} />)

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    // The escape doesn't run the claim RPC.
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
