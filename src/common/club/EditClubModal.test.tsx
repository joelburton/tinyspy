// cs-unmet

/**
 * WHICH GAMES THIS CLUB PLAYS — and where a refusal from
 * `common.set_club_gametypes` lands.
 *
 * The RPC has no validation about one input: what it can refuse is the
 * membership gate and an unregistered gametype, neither of which is any single
 * box's fault. So this is the surface that proves the OTHER arm of the routing
 * — an envelope with no `field` belongs on the form's own line, not attached to
 * whichever control happens to be first.
 *
 * The field it does have is a GROUP, which is the interesting part for the
 * lookup: the boxes are named `gametypes.<id>` and the error sits on the
 * `<fieldset>` around them.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../supabase/db', () => ({ db: { rpc: mockRpc } }))

import { EditClubModal } from './EditClubModal'
import { errorUnder } from '../fields/errorUnder'
import { FORM_ERROR_KEYNAME } from '../forms/formState'

const MESSAGE = 'The server said this exact thing.'

function draw(onSaved: () => void = () => {}) {
  return render(
    <EditClubModal
      clubHandle="moths"
      clubName="The Moths"
      allowedGametypes={new Set(["psychicnum_coop"])}
      onSaved={onSaved}
      onCancel={() => {}}
    />,
  )
}

async function save() {
  await userEvent.setup().click(screen.getByRole('button', { name: /save/i }))
}

beforeEach(() => {
  mockRpc.mockReset()
})

describe('EditClubModal — where a refusal lands', () => {
  it("puts a fieldless message on the form's line, not under a box", async () => {
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'form-validation', message: MESSAGE, dbcode: 'PN900' },
      error: null,
    })
    draw()
    await save()

    await waitFor(() => expect(screen.getByText(MESSAGE)).toBeInTheDocument())
    // The message is NOT hanging off the one field this form has.
    expect(errorUnder('gametypes')).not.toBe(MESSAGE)
  })

  it('puts a message that names the field under THAT field', async () => {
    // Nothing raises this today. It is asserted anyway because the routing is
    // what the form promises, and the day an RPC does name a column the form
    // must already be able to carry it.
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'form-validation', field: 'gametypes', message: MESSAGE, dbcode: 'PN900' },
      error: null,
    })
    draw()
    await save()

    await waitFor(() => expect(errorUnder('gametypes')).toBe(MESSAGE))
  })

  it('hands the chosen gametypes back on success, and asks the server for them', async () => {
    // The envelope names its answer: a branch that matched merely by being `ok`
    // is what the sweep is removing, so the stub has to say which `ok` this is.
    mockRpc.mockResolvedValue({ data: { type: 'ok', data: { result: 'saved' } }, error: null })
    const onSaved = vi.fn()
    const { container } = draw(onSaved)

    // By NAME, not by caption: a gametype's brand can appear on two rows (a
    // coop/compete pair), and the name is the thing that is unique.
    const user = userEvent.setup()
    await user.click(container.querySelector('[name="gametypes.psychicnum_compete"]')!)
    await save()

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const sent = mockRpc.mock.calls[0]![1] as { gametypes: string[] }
    expect(sent.gametypes).toContain('psychicnum_coop')
    expect(sent.gametypes.length).toBe(2)
  })
})

describe('EditClubModal — the form-level key', () => {
  it('is the key the form reads for its own line', () => {
    // Pinned because the routing above is a two-sided agreement: the handler
    // writes this key when the envelope names no field, and the render reads
    // it. A rename on one side alone is silent.
    expect(FORM_ERROR_KEYNAME).toBe('_')
  })
})
