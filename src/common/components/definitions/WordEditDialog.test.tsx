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

const { mockRpc, mockMaybeSingle } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockMaybeSingle: vi.fn(),
}))
vi.mock('../../db', () => ({
  db: {
    rpc: mockRpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  },
}))

import { WordEditDialog } from './WordEditDialog'

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
  mockRpc.mockResolvedValue({ error: null })
  mockMaybeSingle.mockReset()
  mockMaybeSingle.mockResolvedValue({ data: ROW, error: null })
})

describe('WordEditDialog', () => {
  it('edit mode: Save sends ONLY the changed fields, with the note', async () => {
    const user = userEvent.setup()
    render(<WordEditDialog request={{ mode: 'edit', word: 'acre' }} />)
    const band = await screen.findByLabelText('Band')
    await waitFor(() => expect(band).toHaveValue(2))

    await user.clear(band)
    await user.type(band, '5')
    await user.type(screen.getByLabelText('Curation note'), 'too easy at 2')
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
    await user.type(screen.getByLabelText('New word'), 'zqnew')
    const band = screen.getByLabelText('Band')
    await user.clear(band)
    await user.type(band, '3')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockRpc).toHaveBeenCalled())
    const [fn, args] = mockRpc.mock.calls[0]
    expect(fn).toBe('add_word')
    expect(args.new_word).toBe('zqnew')
    expect(args.fields).toMatchObject({ difficulty: 3, american: true, slang: false })
  })

  it('an RPC rejection surfaces inline and keeps the dialog open', async () => {
    // (An out-of-range number never even submits — the native min/max
    // constraint blocks the form — so the server rejection is exercised
    // with an in-range value and a mocked refusal.)
    mockRpc.mockResolvedValue({ error: { message: 'word editing requires the can_edit_words permission' } })
    const user = userEvent.setup()
    render(<WordEditDialog request={{ mode: 'edit', word: 'acre' }} />)
    const band = await screen.findByLabelText('Band')
    await waitFor(() => expect(band).toHaveValue(2))
    await user.clear(band)
    await user.type(band, '5')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(screen.getByText(/can_edit_words permission/)).toBeInTheDocument(),
    )
  })
})
