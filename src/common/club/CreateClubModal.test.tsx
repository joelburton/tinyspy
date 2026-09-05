// cs-unmet

/**
 * WHERE A SERVER VALIDATION LANDS.
 *
 * This form is the worked example for the whole shape, so what is pinned here
 * is the round trip rather than the rendering: `common.create_club` raises
 * `column = 'member_usernames'`, the envelope carries it as `field`, and the
 * message has to appear under THAT box and ring it — not on a line at the
 * bottom where the reader has to work out which of the two inputs it meant.
 *
 * The chain only holds because one string is used the whole way: the raise's
 * COLUMN, the input's `name`, and the RPC parameter it is sent as. A test that
 * asserted the message merely appeared somewhere would pass with all three of
 * them disagreeing.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../supabase/db', () => ({ db: { rpc: mockRpc } }))

import { CreateClubModal } from './CreateClubModal'
import { errorUnder } from '../fields/errorUnder'

beforeEach(() => {
  mockRpc.mockReset()
})

describe('CreateClubModal — a validation lands on its own field', () => {
  it("puts an unknown-username message under the usernames box, not the form's line", async () => {
    mockRpc.mockResolvedValue({
      data: {
        type: 'not-ok',
        severity: 'form-validation',
        dbcode: 'PN007',
        field: 'member_usernames',
        message: 'No such user: zoe',
      },
      error: null,
    })
    const user = userEvent.setup()
    render(<CreateClubModal onCreated={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: /Club name/ }), 'Friday Night')
    await user.type(screen.getByRole('textbox', { name: /usernames/ }), 'zoe')
    await user.click(screen.getByRole('button', { name: 'Create club' }))

    await waitFor(() => expect(errorUnder('member_usernames')).toBe('No such user: zoe'))
    // And NOT under the other field, which is the half that would still pass if
    // the message were simply dumped somewhere.
    expect(errorUnder('club_name')).not.toBe('No such user: zoe')
  })

  it('rings the control it names', async () => {
    mockRpc.mockResolvedValue({
      data: {
        type: 'not-ok',
        severity: 'form-validation',
        dbcode: 'PN009',
        field: 'club_name',
        message: 'Club name taken (handle “friday-night”)',
      },
      error: null,
    })
    const user = userEvent.setup()
    render(<CreateClubModal onCreated={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: /Club name/ }), 'Friday Night')
    await user.click(screen.getByRole('button', { name: 'Create club' }))

    // `aria-invalid` is what draws the fault ring, so it is the assertion that
    // the field looks wrong rather than merely says so.
    await waitFor(() =>
      expect(document.querySelector('[name="club_name"]')).toHaveAttribute('aria-invalid', 'true'),
    )
  })

  // A client-side check writes into the SAME object as the server's answer —
  // that is what makes one renderer able to show either.
  it('routes its own local check to the same place', async () => {
    const user = userEvent.setup()
    render(<CreateClubModal onCreated={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: /Club name/ }), '!!!')
    await user.click(screen.getByRole('button', { name: 'Create club' }))

    await waitFor(() => expect(errorUnder('club_name')).toMatch(/at least one letter or number/))
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
