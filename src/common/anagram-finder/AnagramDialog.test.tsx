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
vi.mock('../supabase/db', () => ({ db: { rpc: mockRpc } }))

import { AnagramDialog } from './AnagramDialog'
import { errorUnder } from '../fields/errorUnder'

beforeEach(() => {
  mockRpc.mockReset()
  // The words travel under a key so the answer can name itself; an empty list
  // is a real result, which is what this default stands for.
  mockRpc.mockResolvedValue({
    data: { type: 'ok', data: { result: 'searched', words: [] } },
    error: null,
  })
})

describe('AnagramDialog', () => {
  it('sends the letters case-intact (pins mean case matters) on Enter', async () => {
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    await user.type(screen.getByRole('textbox'), 'Acer{Enter}')
    expect(mockRpc).toHaveBeenCalledWith('anagrams', { letters: 'Acer' })
  })

  it('drops non-letter junk on entry; too-short input never submits', async () => {
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    const input = screen.getByRole<HTMLInputElement>('textbox')
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
        data: {
          result: 'searched',
          words: [
            { word: 'acer', difficulty: 4 },
            { word: 'acre', difficulty: 1 },
          ],
        },
      },
      error: null,
    })
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    await user.type(screen.getByRole('textbox'), 'Acer{Enter}')

    await waitFor(() => expect(screen.getByText('2 words')).toBeInTheDocument())
    const acer = screen.getByText('ACER').closest('li')!
    expect(acer).toHaveTextContent('4')
    expect(screen.getByText('ACRE').closest('li')!).toHaveTextContent('1')
  })

  it('shows the honest empty state and surfaces an RPC error', async () => {
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    const input = screen.getByRole('textbox')
    await user.type(input, 'zzzz{Enter}')
    await waitFor(() => expect(screen.getByText('No words.')).toBeInTheDocument())

    // Malformed letters come back as a RESULT, not a thrown error — the RPC
    // reached a decision and the player can act on it. `severity: validation`
    // is why the sentence appears in the dialog rather than as a modal, and the
    // sentence is the server's own words.
    //
    // `field` is what the real raise sends (PN001 raises `column = 'letters'`),
    // and it is the half that decides WHERE: under the box it is about, ringing
    // it. Omitting it here — as this fixture used to — made the test pass
    // whether or not the routing worked.
    mockRpc.mockResolvedValue({
      data: {
        type: 'not-ok',
        severity: 'form-validation',
        message: '2–15 letters, or ?',
        dbcode: 'PN001',
        field: 'letters',
      },
      error: null,
    })
    await user.type(input, '{Enter}')
    await waitFor(() =>
      expect(screen.getByText('2–15 letters, or ?')).toBeInTheDocument(),
    )
    // Under the BOX, not on the dialog's line: found through the control, so a
    // message that landed anywhere else fails here.
    const field = input.closest('div')
    expect(field?.textContent).toContain('2–15 letters, or ?')
    expect(input).toHaveAttribute('aria-invalid', 'true')
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
        severity: 'service-error',
        dbcode: 'PN900',
        message: "Dictionary service couldn't be reached — try again later",
      },
      error: null,
    })
    await user.type(screen.getByRole('textbox'), 'acer{Enter}')
    await waitFor(() =>
      expect(
        screen.getByText("Dictionary service couldn't be reached — try again later"),
      ).toBeInTheDocument(),
    )
  })

  // A fault shows on the line TOO — the modal interrupts, the line persists.
  // Without it, dismissing the modal leaves the dialog blank: no results, no
  // explanation, no sign anything went wrong.
  it('shows a fault on the line as well, so the state stays legible', async () => {
    const user = userEvent.setup()
    render(<AnagramDialog onClose={vi.fn()} />)
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'fault', message: 'That table is gone', dbcode: 'PN900' },
      error: null,
    })
    await user.type(screen.getByRole('textbox'), 'acer{Enter}')
    await waitFor(() =>
      expect(screen.getByText('That table is gone')).toBeInTheDocument(),
    )
  })
})

describe('AnagramDialog — the other arm of the routing', () => {
  it("puts a fieldless message on the form's line, not under the box", async () => {
    // `common.anagrams` names `letters` when it can. When it cannot — anything
    // that is not about what you typed — the message belongs to the surface.
    const message = 'The server said this exact thing.'
    mockRpc.mockResolvedValue({
      data: { type: 'not-ok', severity: 'form-validation', message, dbcode: 'PN900' },
      error: null,
    })
    const user = userEvent.setup()
    render(<AnagramDialog onClose={() => {}} />)
    await user.type(screen.getByRole('textbox'), 'acer{Enter}')

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument())
    expect(errorUnder('letters')).not.toBe(message)
  })
})
