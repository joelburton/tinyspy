// cs-blessed-feedback

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FeedbackPill } from './FeedbackPill'
import { createFeedbackSlot, type FeedbackSlot } from './feedbackSlotStore'
import { FeedbackMessage } from './FeedbackMessage'

/**
 * The pill draws the slot's top message and offers exactly the exits its kind
 * allows: a tap ends a gesture-cleared message and nothing else, the × exists
 * only on a ×-cleared one, the fill follows the kind, and an actor is drawn
 * as the leading mention. It renders nothing while the slot is empty and is
 * never a tab stop.
 */

const moth = { username: 'moth', color: 'green' }
const over = { pillText: 'Won: covered in 4', infoColText: 'You won!', outcome: 'won' as const }

function mount(slot: FeedbackSlot) {
  return render(<FeedbackPill slot={slot} />)
}

describe('FeedbackPill — what it draws', () => {
  it('renders nothing for an empty slot, and the top message once there is one', () => {
    const slot = createFeedbackSlot('local')
    const { container } = mount(slot)
    expect(container).toBeEmptyDOMElement()
    act(() => void slot.show(FeedbackMessage.result('lost', 'Not a word')))
    expect(screen.getByText('Not a word')).toBeInTheDocument()
  })

  it('draws the actor as the leading mention', () => {
    const slot = createFeedbackSlot('global')
    mount(slot)
    act(() => void slot.show(FeedbackMessage.peer(moth, 'won', 'found APPLE')))
    expect(screen.getByText('moth')).toBeInTheDocument()
    expect(screen.getByText('found APPLE')).toBeInTheDocument()
  })

  it('the fill follows the kind: a verdict wears it, a result is outlined', () => {
    const slot = createFeedbackSlot('local')
    const { container } = mount(slot)
    const cls = () => container.querySelector('[class*="pill"]')!.className
    act(() => void slot.show(FeedbackMessage.result('won', 'Correct')))
    expect(cls()).toMatch(/outline/)
    expect(cls()).toMatch(/won/)
    act(() => void slot.show(FeedbackMessage.terminalVerdict(over)))
    expect(cls()).not.toMatch(/outline/)
  })

  it('is not a tab stop — a game can show a hundred of these', () => {
    const slot = createFeedbackSlot('local')
    mount(slot)
    act(() => void slot.show(FeedbackMessage.result('lost', 'Not a word')))
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('FeedbackPill — the ways out', () => {
  it('a tap ends a gesture-cleared message', async () => {
    const slot = createFeedbackSlot('local')
    const { container } = mount(slot)
    act(() => void slot.show(FeedbackMessage.result('lost', 'Not a word')))
    await userEvent.click(screen.getByText('Not a word'))
    expect(container).toBeEmptyDOMElement()
  })

  it('a tap does nothing to a verdict, a standing note, or a hint', async () => {
    const slot = createFeedbackSlot('local')
    mount(slot)
    for (const msg of [
      FeedbackMessage.terminalVerdict(over),
      FeedbackMessage.waiting(moth),
      FeedbackMessage.hint('noted', 'Hint: a fruit'),
    ]) {
      const fresh = createFeedbackSlot('local')
      const { container, unmount } = render(<FeedbackPill slot={fresh} />)
      act(() => void fresh.show(msg))
      await userEvent.click(container.firstElementChild!)
      expect(fresh.getTop()).toBe(msg)
      unmount()
    }
  })

  it('a ×-cleared message has the × and only the × works', async () => {
    const slot = createFeedbackSlot('local')
    const { container } = mount(slot)
    act(() => void slot.show(FeedbackMessage.hint('noted', 'Hint: a fruit')))
    await userEvent.click(screen.getByText('Hint: a fruit'))
    expect(slot.getTop()).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(container).toBeEmptyDOMElement()
  })

  it('a gesture-cleared message has no ×', () => {
    const slot = createFeedbackSlot('local')
    mount(slot)
    act(() => void slot.show(FeedbackMessage.result('lost', 'Not a word')))
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('closing a not-ok reveals the verdict under it', async () => {
    const slot = createFeedbackSlot('local')
    mount(slot)
    act(() => void slot.show(FeedbackMessage.terminalVerdict(over)))
    act(() =>
      void slot.show(
        FeedbackMessage.notOk({
          type: 'not-ok', data: null, outcome: null, severity: 'race',
          message: 'Someone got there first', field: null, meta: null, dbcode: 'PN269', detail: null,
        }),
      ),
    )
    expect(screen.getByText('Someone got there first')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.getByText('Won: covered in 4')).toBeInTheDocument()
  })
})
