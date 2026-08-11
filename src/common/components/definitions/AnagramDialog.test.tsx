/**
 * Tests for the ⌥` anagram finder dialog. The matching itself is the
 * server's (pinned in supabase/tests/common/anagrams_test.sql); what's
 * pinned here is the dialog's half of the contract: case is MEANINGFUL and
 * survives to the RPC untouched (pins), junk characters never reach it,
 * and the result rows carry the muted band beside each word.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../../db', () => ({ db: { rpc: mockRpc } }))

import { AnagramDialog } from './AnagramDialog'

beforeEach(() => {
  mockRpc.mockReset()
  mockRpc.mockResolvedValue({ data: [], error: null })
})

describe('AnagramDialog', () => {
  it('sends the letters case-intact (pins mean case matters) on Enter', async () => {
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    await user.type(screen.getByLabelText('Letters to anagram'), 'Acer{Enter}')
    expect(mockRpc).toHaveBeenCalledWith('anagrams', { letters: 'Acer' })
  })

  it('drops non-letter junk on entry; too-short input never submits', async () => {
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    const input = screen.getByLabelText<HTMLInputElement>('Letters to anagram')
    await user.type(input, 'a1 c-e?')
    expect(input.value).toBe('ace?')
    await user.clear(input)
    await user.type(input, 'a{Enter}')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('renders each word with its band muted beside it, and the count', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { word: 'acer', difficulty: 4 },
        { word: 'acre', difficulty: 1 },
      ],
      error: null,
    })
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    await user.type(screen.getByLabelText('Letters to anagram'), 'Acer{Enter}')

    await waitFor(() => expect(screen.getByText('2 words')).toBeInTheDocument())
    const acer = screen.getByText('ACER').closest('li')!
    expect(acer).toHaveTextContent('4')
    expect(screen.getByText('ACRE').closest('li')!).toHaveTextContent('1')
  })

  it('shows the honest empty state and surfaces an RPC error', async () => {
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    const input = screen.getByLabelText('Letters to anagram')
    await user.type(input, 'zzzz{Enter}')
    await waitFor(() => expect(screen.getByText('No words.')).toBeInTheDocument())

    // The server raises a KEY now; the sentence below is TypeScript's
    // (lib/game/errorCopy.ts), which is the point of the redesign.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'bad-anagram-input|', code: 'P0001' } })
    await user.type(input, '{Enter}')
    await waitFor(() =>
      expect(screen.getByText('2–15 letters, or ?')).toBeInTheDocument(),
    )
  })
})
