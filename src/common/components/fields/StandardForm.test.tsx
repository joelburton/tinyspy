// cs-unmet

/**
 * The form that OWNS ITS VALUES (see StandardForm.tsx) — and specifically the
 * four things only it can get wrong, each of which fails silently.
 *
 * Everything else about it is exercised by the eight forms that use it. These
 * are the properties a caller depends on without being able to see: that a
 * re-render can't reset what you are typing, that two writes in one tick both
 * survive, and that the setter is the same function each time.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StandardForm } from './StandardForm'

type Values = { name: string; color: string }
const INITIAL: Values = { name: 'moths', color: 'red' }

describe('StandardForm — the values', () => {
  it('reads initialValues once, so a re-render cannot reset what you typed', () => {
    // The prop is a fresh object literal on every render of the parent. If it
    // were read each time, every keystroke in a parent that re-renders would
    // throw away what is in the form.
    const { rerender } = render(
      <StandardForm<Values> initialValues={INITIAL} onSubmit={() => {}}>
        {({ values }) => <output>{values.name}</output>}
      </StandardForm>,
    )
    rerender(
      <StandardForm<Values> initialValues={{ name: 'CHANGED', color: 'red' }} onSubmit={() => {}}>
        {({ values }) => <output>{values.name}</output>}
      </StandardForm>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('moths')
  })

  it('writes one field and leaves the rest alone', async () => {
    const user = userEvent.setup()
    render(
      <StandardForm<Values> initialValues={INITIAL} onSubmit={() => {}}>
        {({ values, set }) => (
          <>
            <button type="button" onClick={() => set('name', 'bees')}>
              rename
            </button>
            <output>
              {values.name}/{values.color}
            </output>
          </>
        )}
      </StandardForm>,
    )
    await user.click(screen.getByRole('button', { name: 'rename' }))
    expect(screen.getByRole('status')).toHaveTextContent('bees/red')
  })

  it('keeps BOTH writes when a handler sets two fields in one tick', async () => {
    // SetupCoopStyleSection's handler writes `coop_style` and
    // `first_turn_user_id` back to back. Read the previous values from a
    // captured variable rather than the updater and the second write wins
    // alone — which looks like the first field simply not saving.
    const user = userEvent.setup()
    render(
      <StandardForm<Values> initialValues={INITIAL} onSubmit={() => {}}>
        {({ values, set }) => (
          <>
            <button
              type="button"
              onClick={() => {
                set('name', 'bees')
                set('color', 'blue')
              }}
            >
              both
            </button>
            <output>
              {values.name}/{values.color}
            </output>
          </>
        )}
      </StandardForm>,
    )
    await user.click(screen.getByRole('button', { name: 'both' }))
    expect(screen.getByRole('status')).toHaveTextContent('bees/blue')
  })

  it('hands back the same setter every render', async () => {
    // codenamesduet's setup body lists `set` in an effect's deps. A new
    // identity each render re-runs that effect every render.
    const user = userEvent.setup()
    const seen = new Set<unknown>()
    render(
      <StandardForm<Values> initialValues={INITIAL} onSubmit={() => {}}>
        {({ values, set }) => {
          seen.add(set)
          return (
            <>
              <button type="button" onClick={() => set('name', values.name + '!')}>
                touch
              </button>
              <output>{values.name}</output>
            </>
          )
        }}
      </StandardForm>,
    )
    await user.click(screen.getByRole('button', { name: 'touch' }))
    await user.click(screen.getByRole('button', { name: 'touch' }))

    expect(screen.getByRole('status')).toHaveTextContent('moths!!')
    expect(seen.size).toBe(1)
  })
})

describe('StandardForm — submitting', () => {
  it('hands over the values, not an event', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <StandardForm<Values> initialValues={INITIAL} onSubmit={onSubmit}>
        {({ set }) => (
          <>
            <button type="button" onClick={() => set('name', 'bees')}>
              rename
            </button>
            <button type="submit">go</button>
          </>
        )}
      </StandardForm>,
    )
    await user.click(screen.getByRole('button', { name: 'rename' }))
    await user.click(screen.getByRole('button', { name: 'go' }))

    expect(onSubmit).toHaveBeenCalledWith({ name: 'bees', color: 'red' })
  })

  it('prevents the default action, so submitting does not reload the page', async () => {
    const user = userEvent.setup()
    let prevented: boolean | null = null
    // A listener on the document sees the event AFTER React's handler, so it
    // reports what the handler left behind.
    document.addEventListener('submit', (e) => {
      prevented = e.defaultPrevented
    })
    render(
      <StandardForm<Values> initialValues={INITIAL} onSubmit={() => {}}>
        {() => <button type="submit">go</button>}
      </StandardForm>,
    )
    await user.click(screen.getByRole('button', { name: 'go' }))

    expect(prevented).toBe(true)
  })
})
