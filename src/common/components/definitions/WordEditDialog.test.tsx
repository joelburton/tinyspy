// cs-unmet

/**
 * Tests for the word-edit dialog's client half. The permission gate and the
 * journal live server-side (words_edit_test.sql); what's pinned here is the
 * PATCH discipline — Save sends only the fields that actually changed (the
 * journal's `new` must not claim untouched columns were edited) — plus the
 * add-mode payload and the note riding along.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc, mockWordRows, mockSetWordEdit } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockWordRows: vi.fn(),
  mockSetWordEdit: vi.fn(),
}))
// Closing is a call to the store, so that is what "it closed" asserts.
vi.mock('../../lib/definitions/wordEditStore', () => ({ setWordEdit: mockSetWordEdit }))
vi.mock('../../db', () => ({
  db: {
    rpc: mockRpc,
    // `eq()` IS the terminal: the load awaits the query directly now, since
    // zero rows is a real answer (another editor deleted the word) rather
    // than something to ask PostgREST to turn into an error.
    from: () => ({ select: () => ({ eq: mockWordRows }) }),
  },
}))

import { WordEditDialog } from './WordEditDialog'
import { errorUnder } from '../fields/errorUnder'

const ROW = {
  definition: 'a gloss',
  hint: null,
  difficulty: 2,
  crude: 0,
  slur: 0,
  slang: false,
  american: true,
  british: true,
  canadian: false,
  australian: false,
}

beforeEach(() => {
  mockRpc.mockReset()
  // Reset too, or a close from an earlier test satisfies the next one's
  // assertion that THIS one closed.
  mockSetWordEdit.mockReset()
  // The RPCs answer with the result envelope, so a refusal arrives HTTP 200.
  mockRpc.mockResolvedValue({ data: { type: 'ok' }, error: null })
  mockWordRows.mockReset()
  mockWordRows.mockResolvedValue({ data: [ROW], error: null })
})

/**
 * Fields are found by their VISIBLE CAPTION — "Band (1–6)", "Word", "Note" —
 * because the shared field components make the caption the accessible name.
 * What a test looks for and what a reader sees are the same string, so a
 * caption edit that a person would notice fails here too.
 */
describe('WordEditDialog', () => {
  it('edit mode: Save sends ONLY the changed fields, with the note', async () => {
    const user = userEvent.setup()
    render(<WordEditDialog request={{ mode: 'edit', word: 'acre' }} />)
    const band = await screen.findByLabelText('Band (1–6)')
    await waitFor(() => expect(band).toHaveValue(2))

    await user.clear(band)
    await user.type(band, '5')
    await user.type(screen.getByLabelText('Note'), 'too easy at 2')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('update_word', {
        target_word: 'acre',
        patch: { difficulty: 5 },
        note: 'too easy at 2',
      }),
    )
  })

  it('add mode: sends the word plus the full field set', async () => {
    const user = userEvent.setup()
    render(<WordEditDialog request={{ mode: 'add' }} />)
    await user.type(screen.getByLabelText('Word'), 'zqnew')
    const band = screen.getByLabelText('Band (1–6)')
    await user.clear(band)
    await user.type(band, '3')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockRpc).toHaveBeenCalled())
    const [fn, args] = mockRpc.mock.calls[0]
    expect(fn).toBe('add_word')
    expect(args.new_word).toBe('zqnew')
    expect(args.fields).toMatchObject({ difficulty: 3, american: true, slang: false })
  })

  // The way OUT that wasn't there. Delete and Save were the only two buttons,
  // so leaving without saving meant the titlebar's X or Escape — neither of
  // which reads as a choice the way a button beside Save does.
  it('closes on Cancel without calling any RPC', async () => {
    const user = userEvent.setup()
    render(<WordEditDialog request={{ mode: 'edit', word: 'acre' }} />)
    await waitFor(() => expect(screen.getByLabelText('Band (1–6)')).toHaveValue(2))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockSetWordEdit).toHaveBeenCalledWith(null)
  })

  it('an RPC rejection surfaces inline and keeps the dialog open', async () => {
    // (An out-of-range number never even submits — the native min/max
    // constraint blocks the form — so the server rejection is exercised
    // with an in-range value and a mocked refusal.)
    mockRpc.mockResolvedValue({
      data: {
        type: 'not-ok',
        severity: 'fault',
        dbcode: 'PN019',
        message: "You can't edit the dictionary",
      },
      error: null,
    })
    const user = userEvent.setup()
    render(<WordEditDialog request={{ mode: 'edit', word: 'acre' }} />)
    const band = await screen.findByLabelText('Band (1–6)')
    await waitFor(() => expect(band).toHaveValue(2))
    await user.clear(band)
    await user.type(band, '5')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(screen.getByText("You can't edit the dictionary")).toBeInTheDocument(),
    )
  })
})

/**
 * The routing, and the one place it cannot be honored.
 *
 * `add_word` takes the ten flags as ONE jsonb argument, so a validation about
 * what is inside it can only name that argument — `column = 'fields'`, and
 * there is no box called `fields`. Left alone the message would be written into
 * an errors key nothing renders, and vanish. It goes on the form's line.
 */
const MESSAGE = 'The server said this exact thing.'

async function addAndSave() {
  const user = userEvent.setup()
  render(<WordEditDialog request={{ mode: 'add' }} />)
  await user.type(screen.getByLabelText('Word'), 'zqnew')
  const band = screen.getByLabelText('Band (1–6)')
  await user.clear(band)
  await user.type(band, '3')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(mockRpc).toHaveBeenCalled())
}

describe('WordEditDialog — where a validation lands', () => {
  it('puts a message naming a real box under THAT box', async () => {
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'validation', field: 'definition', message: MESSAGE },
      error: null,
    })
    await addAndSave()

    await waitFor(() => expect(errorUnder('definition')).toBe(MESSAGE))
  })

  it("puts a message naming the jsonb argument on the form's line instead", async () => {
    // There is no field called `fields`, and the raise cannot say which of the
    // ten it meant. Routing it to the form is the honest answer; routing it to
    // `errors.fields` would lose it silently.
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'validation', field: 'fields', message: MESSAGE },
      error: null,
    })
    await addAndSave()

    await waitFor(() => expect(screen.getByText(MESSAGE)).toBeInTheDocument())
    expect(errorUnder('definition')).not.toBe(MESSAGE)
  })

  it("puts a fieldless message on the form's line", async () => {
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'validation', message: MESSAGE },
      error: null,
    })
    await addAndSave()

    await waitFor(() => expect(screen.getByText(MESSAGE)).toBeInTheDocument())
    expect(errorUnder('definition')).not.toBe(MESSAGE)
  })
})
