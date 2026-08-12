import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GenericFeedbackPill } from './GenericFeedbackPill'
import type { GenericFeedbackMsg } from '../../lib/games'

/**
 * The four feedback modes, and which of them a TAP dismisses (docs/ui.md →
 * Feedback pill).
 *
 * Tapping works for `sticky` and `timed` because the app already clears
 * feedback on your next action — a keystroke, a tile click — and a tap is an
 * action. On touch there is no keystroke, so the pill was the most conspicuous
 * thing on screen and the only one that ignored you.
 *
 * The two exclusions carry the weight, and neither is visible at a call site:
 * `manual` keeps its × as the sole target, and `permanent` isn't a message at
 * all — it's a standing condition (a terminal verdict, "Conceded — race
 * continues") that only a later pill replaces.
 */

const msg = (over: Partial<GenericFeedbackMsg> = {}): GenericFeedbackMsg => ({
  tone: 'error',
  text: 'Not a word',
  mode: { kind: 'sticky' },
  ...over,
})

describe('GenericFeedbackPill — tap to dismiss', () => {
  it('dismisses a sticky own-move pill when the body is tapped', async () => {
    const onClose = vi.fn()
    render(<GenericFeedbackPill msg={msg()} onClose={onClose} />)
    await userEvent.click(screen.getByText('Not a word'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('dismisses a timed pill too — you can kill it early', async () => {
    const onClose = vi.fn()
    render(<GenericFeedbackPill msg={msg({ mode: { kind: 'timed' } })} onClose={onClose} />)
    await userEvent.click(screen.getByText('Not a word'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT dismiss a permanent pill — a condition, not a message', async () => {
    const onClose = vi.fn()
    render(
      <GenericFeedbackPill
        msg={msg({ mode: { kind: 'permanent' }, text: 'Won: covered in 4' })}
        onClose={onClose}
      />,
    )
    await userEvent.click(screen.getByText('Won: covered in 4'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves a manual pill to its ×, which still works', async () => {
    const onClose = vi.fn()
    render(
      <GenericFeedbackPill msg={msg({ mode: { kind: 'manual' } })} onClose={onClose} />,
    )
    // The body is inert: its whole point is see-and-acknowledge, and a body
    // that swallowed the gesture would make the × look decorative.
    await userEvent.click(screen.getByText('Not a word'))
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('is not a tab stop — a game can show a hundred of these', () => {
    render(<GenericFeedbackPill msg={msg()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('appearance follows the mode: only permanent drops the outline', () => {
    // The look is no longer an independent knob — this is what makes the old
    // "transient message wearing the permanent background" bug unsayable.
    const { container, rerender } = render(
      <GenericFeedbackPill msg={msg({ tone: 'success' })} onClose={vi.fn()} />,
    )
    const cls = () => container.querySelector('[class*="pill"]')!.className
    expect(cls(), 'sticky is a message → outlined').toMatch(/outline/)

    rerender(<GenericFeedbackPill msg={msg({ tone: 'success', mode: { kind: 'timed' } })} onClose={vi.fn()} />)
    expect(cls(), 'timed is a message → outlined').toMatch(/outline/)

    rerender(<GenericFeedbackPill msg={msg({ tone: 'success', mode: { kind: 'manual' } })} onClose={vi.fn()} />)
    expect(cls(), 'manual is a message → outlined').toMatch(/outline/)

    rerender(<GenericFeedbackPill msg={msg({ tone: 'success', mode: { kind: 'permanent' } })} onClose={vi.fn()} />)
    expect(cls(), 'permanent is a condition → keeps its tone fill').not.toMatch(/outline/)
  })
})

/* The fault describe block retired 2026-08-13: faults never reach this
 * component any more — the sinks route them to the fault MODAL (FaultDialog;
 * docs/ui.md → Faults), guarded by faultStore.test.ts's routing tests. */
