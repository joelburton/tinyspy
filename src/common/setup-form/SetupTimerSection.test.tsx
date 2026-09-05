// cs-unmet

/**
 * `<SetupTimerSection>`'s behavior, pinned because nothing pinned it.
 *
 * `tsc` has nothing to say about whether clicking "Down" still enables the box
 * beside it, which is the whole behavior of this field — so it is asserted here.
 *
 * **The MM:SS box lives INSIDE the Down option's label**, the one structural
 * thing worth pinning: `<RadioRow>` takes a ReactNode `label` and renders it
 * inside the `<label>` after the radio, so clicking the box picks Down. Nest it
 * anywhere else and that stops being true.
 *
 * What is deliberately NOT asserted: any class name. `vite.config.ts` sets
 * `css: false` for vitest, so a CSS module fabricates whatever name it is asked
 * for and a class assertion here would pass against a deleted rule.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { errorUnder } from '../fields/errorUnder'
import { SetupTimerSection } from './SetupTimerSection'

// Found by NAME, not by caption: the box has no visible label, and its name
// is the setup key it writes into — the same string a server validation would
// use to reach it.
const box = () => document.querySelector('[name=\'timer.seconds\']') as HTMLInputElement

/**
 * Render the field with its disclosure OPEN.
 *
 * `<SetupSection>` is closed by default — every setup field is, since F35 — and
 * a closed `<details>` hides its contents from the accessible tree, so every
 * query below would miss. Opening it is a fact about the surrounding component,
 * not about the timer.
 */
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/^Timer:/))
}

describe('SetupTimerSection', () => {
  it('offers the three modes as one radio group', async () => {
    const user = userEvent.setup()
    render(<SetupTimerSection errors={{}} value={{ kind: 'none' }} onChange={() => {}} />)
    await open(user)
    expect(screen.getByRole('radio', { name: 'None' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Up' })).toBeInTheDocument()
    // Matched loosely: the Down option's label CONTAINS the MM:SS box, and an
    // embedded control contributes its value to the label's text alternative —
    // so the accessible name is "Down:" plus whatever the box currently holds.
    // That is the nesting working, and pinning the exact string would pin the
    // default duration instead.
    expect(screen.getByRole('radio', { name: /^Down:/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'None' })).toBeChecked()
  })

  it('keeps the MM:SS box inert until Down is the choice', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<SetupTimerSection errors={{}} value={{ kind: 'none' }} onChange={onChange} />)
    await open(user)
    expect(box()).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: /^Down:/ }))
    // Controlled: the parent owns the value, so the field reports and the test
    // plays the parent. The default is 10:00 when nothing valid has been typed.
    expect(onChange).toHaveBeenCalledWith({ kind: 'countdown', seconds: 600 })

    rerender(<SetupTimerSection errors={{}} value={{ kind: 'countdown', seconds: 600 }} onChange={onChange} />)
    expect(box()).toBeEnabled()
  })

  it('reports the other two modes without a duration', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SetupTimerSection errors={{}} value={{ kind: 'countdown', seconds: 600 }} onChange={onChange} />)
    await open(user)

    await user.click(screen.getByRole('radio', { name: 'Up' }))
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'countup' })

    await user.click(screen.getByRole('radio', { name: 'None' }))
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'none' })
  })

  it('parses a typed MM:SS into seconds', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SetupTimerSection errors={{}} value={{ kind: 'countdown', seconds: 600 }} onChange={onChange} />)
    await open(user)

    await user.clear(box())
    await user.type(box(), '2:30')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'countdown', seconds: 150 })
  })

  it('holds the last VALID duration while the text is malformed, and says so', async () => {
    // The setup must never carry something Start would be rejected for, so a
    // half-typed "2:" leaves the value alone and complains in place instead.
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SetupTimerSection errors={{}} value={{ kind: 'countdown', seconds: 600 }} onChange={onChange} />)
    await open(user)

    await user.clear(box())
    await user.type(box(), '2:')
    expect(onChange).not.toHaveBeenCalled()
    expect(box()).toHaveAttribute('aria-invalid', 'true')
    // UNDER THE TIMER FIELD, not merely on the page. This used to be a loose
    // `<p className="error">` outside the errors object entirely — the words
    // were right and no test could tell it was the one setting whose complaint
    // arrived somewhere different from every other setting's.
    expect(errorUnder('timer')).toMatch(/Enter MM:SS/)
  })

  it('shows the form\'s own message about the timer when the text is fine', async () => {
    // The other writer into the same slot: a server `validation` naming
    // `column = 'timer'`, or a game's own check. With nothing wrong in the box
    // there is nothing to displace it.
    const user = userEvent.setup()
    render(
      <SetupTimerSection
        errors={{ timer: 'This game has no timer.' }}
        value={{ kind: 'countdown', seconds: 600 }}
        onChange={vi.fn()}
      />,
    )
    await open(user)

    expect(errorUnder('timer')).toBe('This game has no timer.')
  })

  it('lets the typed value win, because it is what is on screen now', async () => {
    // The form's copy is about whatever was last submitted; the box holds what
    // you are typing. Showing the stale one over a value you can see is wrong
    // would send you to fix the wrong thing.
    const user = userEvent.setup()
    render(
      <SetupTimerSection
        errors={{ timer: 'This game has no timer.' }}
        value={{ kind: 'countdown', seconds: 600 }}
        onChange={vi.fn()}
      />,
    )
    await open(user)

    await user.clear(box())
    await user.type(box(), '2:')

    expect(errorUnder('timer')).toMatch(/Enter MM:SS/)
  })
})
