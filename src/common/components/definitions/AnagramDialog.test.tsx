// cs-unmet

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
  mockRpc.mockResolvedValue({ data: { type: 'ok', data: [] }, error: null })
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
      data: {
        type: 'ok',
        data: [
          { word: 'acer', difficulty: 4 },
          { word: 'acre', difficulty: 1 },
        ],
      },
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

    // Malformed letters come back as a RESULT, not a thrown error — the RPC
    // reached a decision and the player can act on it. `severity: validation`
    // is why the sentence lands on the dialog's own line instead of a modal,
    // and the sentence is the server's own words.
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'validation', message: '2–15 letters, or ?', dbcode: 'PN001' },
      error: null,
    })
    await user.type(input, '{Enter}')
    await waitFor(() =>
      expect(screen.getByText('2–15 letters, or ?')).toBeInTheDocument(),
    )
  })

  // `error` — a service we depend on didn't answer — is the server's words for
  // the player just as much as a validation is, and this dialog has one place
  // to put words. Testing a severity the RPC cannot raise TODAY on purpose: the
  // next dialog copied from this one will raise it, and a version that named
  // only `validation` would drop it silently.
  it('shows an error-severity message too, not only a validation', async () => {
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    mockRpc.mockResolvedValue({
      data: {
        type: 'not-ok',
        severity: 'error',
        message: "Dictionary service couldn't be reached — try again later",
      },
      error: null,
    })
    await user.type(screen.getByLabelText('Letters to anagram'), 'acer{Enter}')
    await waitFor(() =>
      expect(
        screen.getByText("Dictionary service couldn't be reached — try again later"),
      ).toBeInTheDocument(),
    )
  })

  // A fault is already a modal; repeating it on the line would say it twice.
  it('stays silent for a fault, which is already on screen', async () => {
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'fault', message: 'That table is gone', dbcode: 'PN900' },
      error: null,
    })
    await user.type(screen.getByLabelText('Letters to anagram'), 'acer{Enter}')
    await waitFor(() => expect(screen.queryByText('No words.')).not.toBeInTheDocument())
    expect(screen.queryByText('That table is gone')).not.toBeInTheDocument()
  })
})
