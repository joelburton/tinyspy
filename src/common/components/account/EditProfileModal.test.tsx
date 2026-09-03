// cs-unmet

/**
 * YOUR COLOR — and where a refusal from `common.update_profile_color` lands.
 *
 * The field this form routes to is a GROUP of swatches with no single control,
 * so it carries its name as `data-field`. That is the third shape `errorUnder`
 * has to cope with, and the one most likely to be quietly missed: a lookup that
 * only understood `[name=...]` would find nothing here and report no error,
 * which reads exactly like a form that is working.
 *
 * The other field is `<ReadOnlyField name="username">`, which exists to prove a
 * value you cannot edit is still a field: it has a name, and the server is
 * entitled to complain about it.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../../db', () => ({ db: { rpc: mockRpc } }))
vi.mock('../../hooks/session/useProfile', () => ({
  useProfile: () => ({ user_id: 'u1', username: 'joel', color: '#c0392b' }),
  setProfileColor: vi.fn(),
}))

import { EditProfileModal } from './EditProfileModal'
import { errorUnder } from '../fields/errorUnder'

const MESSAGE = 'The server said this exact thing.'
const SESSION = { user: { id: 'u1' } } as Session

function draw(onSaved = vi.fn()) {
  const view = render(<EditProfileModal session={SESSION} onSaved={onSaved} onCancel={() => {}} />)
  return { ...view, onSaved }
}

async function save() {
  await userEvent.setup().click(screen.getByRole('button', { name: /save/i }))
}

beforeEach(() => {
  mockRpc.mockReset()
})

describe('EditProfileModal — where a refusal lands', () => {
  it('puts a message naming the color under the swatches, which have no control to name', async () => {
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'form-validation', field: 'new_color', message: MESSAGE, dbcode: 'PN900' },
      error: null,
    })
    draw()
    await save()

    await waitFor(() => expect(errorUnder('new_color')).toBe(MESSAGE))
  })

  it('can put one under the username, which you cannot even edit', async () => {
    // A read-only field is a field: it carries a name, so the server can name
    // it, and the message has somewhere to go.
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'form-validation', field: 'username', message: MESSAGE, dbcode: 'PN900' },
      error: null,
    })
    draw()
    await save()

    await waitFor(() => expect(errorUnder('username')).toBe(MESSAGE))
  })

  it("puts a fieldless message on the form's line", async () => {
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'form-validation', message: MESSAGE, dbcode: 'PN900' },
      error: null,
    })
    draw()
    await save()

    await waitFor(() => expect(screen.getByText(MESSAGE)).toBeInTheDocument())
    expect(errorUnder('new_color')).not.toBe(MESSAGE)
  })
})

describe('EditProfileModal — saving', () => {
  it('sends the color you picked under the name the RPC takes', async () => {
    // The envelope names its answer: an `ok` a call site could match merely by
    // being `ok` is the shape the sweep removes, so the stub says which it is.
    mockRpc.mockResolvedValue({ data: { type: 'ok', data: { result: 'saved' } }, error: null })
    const { container, onSaved } = draw()

    const user = userEvent.setup()
    const swatches = container.querySelectorAll('[data-field="new_color"] button')
    await user.click(swatches[1]!)
    await save()

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mockRpc).toHaveBeenCalledWith(
      'update_profile_color',
      expect.objectContaining({ new_color: expect.any(String) }),
    )
  })
})
