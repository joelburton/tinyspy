// cs-unmet

/**
 * LOOK UP A WORD — the one converted form with no server of its own.
 *
 * Two surfaces say things here, and the split is the point. The LOOKUP's
 * failures belong to `<DefinitionView>`, which fetches and reports them where
 * the definition would have been. This form's own refusal — an empty box —
 * belongs to the form, and lands on the field it is about.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// The definition view fetches; this test is about the form in front of it, so
// it stands in as something that reports the word it was given. It is ALWAYS
// mounted and takes `null` until a word is chosen — the stand-in has to say
// nothing then, exactly as the real one does.
vi.mock('./DefinitionView', () => ({
  DefinitionView: ({ word }: { word: string | null }) =>
    word === null ? null : <p>looking up: {word}</p>,
}))

import { WordLookupDialog } from './WordLookupDialog'
import { errorUnder } from '../fields/errorUnder'

async function lookUp(typed: string) {
  const user = userEvent.setup()
  render(<WordLookupDialog onClose={() => {}} />)
  await user.type(document.querySelector('[name="query"]')!, typed)
  await user.click(screen.getByRole('button', { name: /define/i }))
}

describe('WordLookupDialog', () => {
  it('looks up what you typed', async () => {
    await lookUp('moth')
    expect(screen.getByText(/looking up: moth/)).toBeInTheDocument()
  })

  it('trims and lowercases on the way, so a pasted word still works', async () => {
    await lookUp('  MOTH  ')
    expect(screen.getByText(/looking up: moth/)).toBeInTheDocument()
  })

  it('does nothing at all on an empty submit', async () => {
    const user = userEvent.setup()
    render(<WordLookupDialog onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /define/i }))

    expect(screen.queryByText(/looking up/)).not.toBeInTheDocument()
  })
})

describe('WordLookupDialog — an empty submit', () => {
  it('says so, under the box, instead of doing nothing at all', async () => {
    const user = userEvent.setup()
    render(<WordLookupDialog onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /define/i }))

    expect(errorUnder('query')).toBe('Type a word to look up.')
  })

  it('takes the message back once you type a word', async () => {
    const user = userEvent.setup()
    render(<WordLookupDialog onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /define/i }))
    expect(errorUnder('query')).toBe('Type a word to look up.')

    await user.type(document.querySelector('[name="query"]')!, 'moth')
    await user.click(screen.getByRole('button', { name: /define/i }))

    expect(errorUnder('query')).toBeNull()
    expect(screen.getByText(/looking up: moth/)).toBeInTheDocument()
  })
})
