// cs-unmet

import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EntryRow } from './EntryRow'
import { createFeedbackSlot } from '../feedback/feedbackSlotStore'
import { FeedbackMessage } from '../feedback/FeedbackMessage'

/**
 * The pill swap: which messages take the controls' place, and when typing
 * gets them back. A ×-only message never yields to a letter — that is the
 * whole reason it is ×-only — while a gesture-cleared result does, because
 * the keystroke is what dismisses it.
 */

function mount(slot: ReturnType<typeof createFeedbackSlot>, value = '') {
  return render(
    <EntryRow value={value} onChange={vi.fn()} onSubmit={vi.fn()} localFeedbackSlot={slot} />,
  )
}

describe('EntryRow — the pill swap', () => {
  it('shows the controls while the slot is empty', () => {
    const slot = createFeedbackSlot('local')
    mount(slot)
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
  })

  it('a result replaces the controls, even over a box that still holds text', () => {
    // letterboxed keeps a rejected draft in the box for fixing; the result
    // must show over it all the same. Typing gets the controls back only
    // because the keystroke dismisses the result (the host's `onAnyKey`).
    const slot = createFeedbackSlot('local')
    mount(slot, 'adgj')
    act(() => void slot.show(FeedbackMessage.result('lost', 'Not a word')))
    expect(screen.getByText('Not a word')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
    act(() => slot.dismiss())
    expect(screen.queryByText('Not a word')).toBeNull()
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
  })

  it('a ×-only message stays over the controls whatever is typed', () => {
    const slot = createFeedbackSlot('local')
    mount(slot, 'apple')
    act(() => void slot.show(FeedbackMessage.hint('noted', 'Hint: a fruit')))
    expect(screen.getByText('Hint: a fruit')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('an owner-cleared message stays too — the verdict, whose turn', () => {
    const slot = createFeedbackSlot('local')
    mount(slot, 'ap')
    act(() => void slot.show(FeedbackMessage.waiting({ username: 'moth', color: 'green' })))
    expect(screen.getByText(/Waiting for/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
  })
})
