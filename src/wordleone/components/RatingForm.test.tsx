// cs-unmet

/**
 * The puzzle-feedback form: what it sends, what a save leaves behind, and
 * where a refusal lands.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorUnder } from '@/common/fields/errorUnder'
import { db } from '../db'
import { RatingForm } from './RatingForm'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** An envelope in the shape `runRpc` unwraps. */
const envelope = (over: Record<string, unknown>) => ({
  data: {
    type: 'ok', data: null, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
    ...over,
  },
  error: null,
})

beforeEach(() => {
  rpc.mockReset()
})

describe('wordleone RatingForm', () => {
  it('names the answer and its band while the board shows the answer', () => {
    render(<RatingForm gameId="g1" shownAnswer="betel" targetBand={2} />)
    expect(screen.getByText('BETEL is band 2 (Common).')).toBeInTheDocument()
  })

  it('keeps a hidden answer hidden, saying only its band', () => {
    render(<RatingForm gameId="g1" shownAnswer={null} targetBand={2} />)
    expect(screen.getByText('The answer is band 2 (Common).')).toBeInTheDocument()
    expect(screen.queryByText(/BETEL/)).not.toBeInTheDocument()
  })

  it('sends what was filled in, leaves a blank field out, and gives way to a thank-you', async () => {
    rpc.mockResolvedValue(envelope({ data: { result: 'rated' } }))
    const user = userEvent.setup()
    render(<RatingForm gameId="g1" shownAnswer="betel" targetBand={2} />)

    await user.selectOptions(document.querySelector('[name="rated_difficulty"]')!, '4')
    await user.selectOptions(document.querySelector('[name="suggested_band"]')!, '5 (Obscure)')
    await user.type(document.querySelector('[name="comment"]')!, 'tricky')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(rpc).toHaveBeenCalledWith('rate_puzzle', {
      p_game_id: 'g1',
      p_rated_difficulty: 4,
      p_suggested_band: 5,
      p_seconds_reported: undefined,
      p_comment: 'tricky',
    })
    expect(await screen.findByText('Saved — thanks!')).toBeInTheDocument()
    // The form is gone: nothing left to save twice.
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('shows a refusal under the field it names, and keeps the form', async () => {
    rpc.mockResolvedValue(envelope({
      type: 'not-ok', severity: 'form-validation', field: 'seconds_reported',
      message: "Seconds can't be negative", dbcode: 'PN535',
    }))
    const user = userEvent.setup()
    render(<RatingForm gameId="g1" shownAnswer="betel" targetBand={2} />)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(errorUnder('seconds_reported')).toBe("Seconds can't be negative"))
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})
