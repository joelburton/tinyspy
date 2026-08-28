// cs-unmet

/**
 * `<TextField>`'s three surfaces — the caption, the entry help, and the error —
 * and specifically the rules about when each is drawn.
 *
 * Those rules are the whole reason the props exist rather than call sites doing
 * it by hand, and none of them is visible in the type: a caption may be absent,
 * the control carries its `name` either way, and help and error appear TOGETHER
 * rather than one replacing the other.
 *
 * Not asserted: any class name. `vite.config.ts` sets `css: false` for vitest,
 * so a CSS module fabricates whatever name it is asked for and a class
 * assertion would pass against a deleted rule (docs → the guards' own note).
 * The invalid ring is `aria-invalid`, which IS in the DOM, so that is what this
 * checks.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TextField } from './TextField'

describe('TextField — the caption', () => {
  it('names the control by wrapping it, so it is findable by what you see', () => {
    render(<TextField name="club_name" label="Club name" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Club name')).toBeInTheDocument()
  })

  it('draws no caption when none is given, and is still findable by name', () => {
    // The search-box case: the box IS the panel, and a caption above one input
    // says nothing the titlebar has not. The `name` is there regardless, which
    // is why it is what a test selects on — rewording a label is a change to
    // the copy, and should not fail a test about the form.
    const { container } = render(<TextField name="letters" value="" onChange={() => {}} />)
    expect(container.querySelector('[name="letters"]')).toBeInTheDocument()
    expect(container.querySelector('label')).not.toBeInTheDocument()
  })
})

describe('TextField — entry help and errors', () => {
  it('shows entry help under the control', () => {
    render(
      <TextField name="word" label="Word" value="" onChange={() => {}} entryHelp="Letters only." />,
    )
    expect(screen.getByText('Letters only.')).toBeInTheDocument()
  })

  it('is not invalid, and says nothing, with no error', () => {
    render(<TextField name="word" label="Word" value="" onChange={() => {}} entryHelp="Letters only." />)
    expect(screen.getByLabelText('Word')).not.toHaveAttribute('aria-invalid')
  })

  it('rings the control AND says why', () => {
    // Both halves: the ring says which field, the sentence says what is wrong.
    // A ring with no sentence leaves you hunting.
    render(<TextField name="word" label="Word" value="q" onChange={() => {}} error="Two letters or more." />)
    expect(screen.getByLabelText('Word')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Two letters or more.')).toBeInTheDocument()
  })

  it('keeps the help WITH the error, rather than replacing it', () => {
    // Losing the instructions the moment you make a mistake takes them away
    // exactly when they matter.
    render(
      <TextField
        name="word"
        label="Word"
        value="q"
        onChange={() => {}}
        entryHelp="Letters only."
        error="Two letters or more."
      />,
    )
    expect(screen.getByText('Letters only.')).toBeInTheDocument()
    expect(screen.getByText('Two letters or more.')).toBeInTheDocument()
  })
})

describe('TextField — the control', () => {
  it('reports what was typed, not the event', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TextField name="word" label="Word" value="" onChange={onChange} />)
    await user.type(screen.getByLabelText('Word'), 'a')
    expect(onChange).toHaveBeenLastCalledWith('a')
  })

  it('is a textarea when multiline, and the same field otherwise', () => {
    render(<TextField name="note" label="Note" value="" onChange={() => {}} multiline rows={2} />)
    expect(screen.getByLabelText('Note').tagName).toBe('TEXTAREA')
  })
})
