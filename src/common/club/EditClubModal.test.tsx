// cs-blessed-club-page

/**
 * WHICH GAMES THIS CLUB LISTS, AND EACH ONE'S DAILY CAP — and where a refusal
 * from `common.set_club_gametypes` lands.
 *
 * The RPC names one input when it refuses: a cap that is not a whole number,
 * under `max_daily_games.<gametype>`, the box that wrote it. Everything else it
 * can refuse — the membership gate, locked settings, an unregistered gametype
 * — is no single box's fault. So this is the surface that proves BOTH arms of
 * the routing: an envelope with no `field` belongs on the form's own line, and
 * one naming a row's box lands under that box and no other.
 *
 * The listing is a GROUP, which is the interesting part for the lookup: the
 * boxes are named `gametypes.<id>` and a message naming `gametypes` sits on
 * the `<fieldset>` around them.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../supabase/db', () => ({ db: { rpc: mockRpc } }))

import { EditClubModal } from './EditClubModal'
import { errorUnder } from '../fields/errorUnder'
import { FORM_ERROR_KEYNAME } from '../forms/formState'
import type { GametypeSettings } from './useClubGametypes'

const MESSAGE = 'The server said this exact thing.'

/** The settings sent on Save, one entry per registered gametype. */
type Sent = { p_settings: { gametype: string; is_enabled: boolean; max_daily_games: number | null }[] }

function draw(onSaved: (next: Map<string, GametypeSettings>) => void = () => {}) {
  return render(
    <EditClubModal
      clubHandle="moths"
      clubName="The Moths"
      settings={new Map([
        ['psychicnum_coop', { isEnabled: true, maxDailyGames: 2 }],
        ['psychicnum_compete', { isEnabled: false, maxDailyGames: null }],
      ])}
      onSaved={onSaved}
      onCancel={() => {}}
    />,
  )
}

async function save() {
  await userEvent.setup().click(screen.getByRole('button', { name: /save/i }))
}

function sent(): Sent['p_settings'] {
  return (mockRpc.mock.calls[0]![1] as Sent).p_settings
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
    // The message is NOT hanging off the listing group.
    expect(errorUnder('gametypes')).not.toBe(MESSAGE)
  })

  it('puts a message that names the listing under the group', async () => {
    // Nothing raises this today. It is asserted anyway because the routing is
    // what the form promises, and the day an RPC does name the group the form
    // must already be able to carry it.
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'form-validation', field: 'gametypes', message: MESSAGE, dbcode: 'PN900' },
      error: null,
    })
    draw()
    await save()

    await waitFor(() => expect(errorUnder('gametypes')).toBe(MESSAGE))
  })

  it("puts a refused cap under THAT row's box", async () => {
    // What `set_club_gametypes` names (PN517): the box that wrote the value.
    mockRpc.mockResolvedValue({
      data: {
        type: 'not-ok', severity: 'form-validation', dbcode: 'PN517',
        field: 'max_daily_games.psychicnum_coop', message: MESSAGE,
      },
      error: null,
    })
    draw()
    await save()

    await waitFor(() => expect(errorUnder('max_daily_games.psychicnum_coop')).toBe(MESSAGE))
    expect(errorUnder('max_daily_games.psychicnum_compete')).not.toBe(MESSAGE)
  })
})

describe('EditClubModal — what it sends and hands back', () => {
  it('sends every registered gametype, with the listing and the cap as edited', async () => {
    // The envelope names its answer: a branch that matched merely by being `ok`
    // is what the sweep is removing, so the stub has to say which `ok` this is.
    mockRpc.mockResolvedValue({ data: { type: 'ok', data: { result: 'saved' } }, error: null })
    const onSaved = vi.fn()
    const { container } = draw(onSaved)

    // By NAME, not by caption: a gametype's brand can appear on two rows (a
    // coop/compete pair), and the name is the thing that is unique.
    const user = userEvent.setup()
    await user.click(container.querySelector('[name="gametypes.psychicnum_compete"]')!)
    const cap = container.querySelector('[name="max_daily_games.psychicnum_compete"]')!
    await user.type(cap, '3')
    await save()

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const byGametype = new Map(sent().map((s) => [s.gametype, s]))
    expect(byGametype.get('psychicnum_coop')).toEqual({ gametype: 'psychicnum_coop', is_enabled: true, max_daily_games: 2 })
    expect(byGametype.get('psychicnum_compete')).toEqual({ gametype: 'psychicnum_compete', is_enabled: true, max_daily_games: 3 })
    // A gametype the club had no settings for goes as its row would read.
    expect(byGametype.get('wordle_coop')).toEqual({ gametype: 'wordle_coop', is_enabled: false, max_daily_games: null })

    const handed = onSaved.mock.calls[0]![0] as Map<string, GametypeSettings>
    expect(handed.get('psychicnum_compete')).toEqual({ isEnabled: true, maxDailyGames: 3 })
  })

  it('sends a cleared cap as null — no limit', async () => {
    mockRpc.mockResolvedValue({ data: { type: 'ok', data: { result: 'saved' } }, error: null })
    const { container } = draw()

    const cap = container.querySelector('[name="max_daily_games.psychicnum_coop"]')!
    await userEvent.setup().clear(cap)
    await save()

    await waitFor(() => expect(mockRpc).toHaveBeenCalled())
    expect(sent().find((s) => s.gametype === 'psychicnum_coop')!.max_daily_games).toBeNull()
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
