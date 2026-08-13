/**
 * Tests for FilterSelect — the non-native dropdown the in-game info-panel
 * filters use.
 *
 * The reason this component exists is a focus property, so that's what most of
 * these pin. A native `<select>` holds the keyboard (`isEditableField` counts
 * SELECT), and nothing reliably hands it back — `change` doesn't fire when you
 * re-pick the option already selected, which left the board deaf and the entry
 * caret dark. This control answers that by never taking focus at all.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilterSelect } from './FilterSelect'

const PLAIN = [
  { value: 'all', label: 'All' },
  { value: 'found', label: 'Found' },
]
const WITH_DOTS = [
  { value: 'all', label: 'All' },
  { value: 'u1', label: 'me', dot: 'red' },
  { value: 'u2', label: 'moth', dot: 'blue' },
]

const trigger = () => screen.getByRole('button', { name: 'Whose words' })
const optionButtons = () =>
  Array.from(trigger().parentElement!.querySelectorAll('button')).filter(
    (b) => !b.hasAttribute('aria-expanded'),
  )

function setup(options = PLAIN, value = 'all') {
  const onChange = vi.fn()
  render(
    <FilterSelect label="Whose words" value={value} options={options} onChange={onChange} />,
  )
  return { onChange, user: userEvent.setup() }
}

describe('FilterSelect — picking', () => {
  it('shows the current option, and nothing is open until you click', () => {
    setup()
    expect(trigger()).toHaveTextContent('All')
    expect(optionButtons()).toHaveLength(0)
  })

  it('opens on click, lists every option, and reports the VALUE not the label', async () => {
    const { onChange, user } = setup()
    await user.click(trigger())
    expect(optionButtons().map((b) => b.textContent)).toEqual(['All', 'Found'])
    await user.click(optionButtons()[1])
    expect(onChange).toHaveBeenCalledWith('found')
  })

  it('closes after picking', async () => {
    const { user } = setup()
    await user.click(trigger())
    await user.click(optionButtons()[1])
    expect(optionButtons()).toHaveLength(0)
  })

  // The exact case that motivated the component: re-picking the CURRENT value
  // is a no-op for a native select (no `change` event), which is how it kept
  // the keyboard. Here it must still close, and still report.
  it('re-picking the option already selected still closes and reports', async () => {
    const { onChange, user } = setup()
    await user.click(trigger())
    await user.click(optionButtons()[0])
    expect(onChange).toHaveBeenCalledWith('all')
    expect(optionButtons()).toHaveLength(0)
  })
})

describe('FilterSelect — never takes focus', () => {
  /* The whole point, so it's asserted on the mechanism rather than on
   * `document.activeElement`: jsdom doesn't move focus on click at all, so an
   * activeElement check would pass even with the handler deleted — a guard
   * that can't fail. Preventing mousedown's default is what stops the browser
   * focusing the control, so that's what's pinned. */
  it('the trigger prevents its own mousedown default', async () => {
    const { user } = setup()
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    trigger().dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    // …and the click still works, which is the half that could regress if
    // someone "fixed" this by preventing the click instead.
    await user.click(trigger())
    expect(optionButtons()).toHaveLength(2)
  })

  it('each option prevents its own mousedown default', async () => {
    const { user } = setup()
    await user.click(trigger())
    for (const option of optionButtons()) {
      const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      option.dispatchEvent(e)
      expect(e.defaultPrevented).toBe(true)
    }
  })
})

describe('FilterSelect — identity discs', () => {
  // A dot-less option has to indent to the same text baseline as a dotted one,
  // so every option gets the disc's width once ANY option has one.
  it('reserves a disc slot on every option when any option has one', async () => {
    const { user } = setup(WITH_DOTS)
    await user.click(trigger())
    const slots = optionButtons().map((b) => b.querySelectorAll('[class*="dotSlot"]').length)
    expect(slots).toEqual([1, 1, 1])
    // …but only the players actually draw a disc inside it.
    const discs = optionButtons().map((b) => b.querySelectorAll('[class*="dot_"]').length)
    expect(discs).toEqual([0, 1, 1])
  })

  it('reserves nothing when no option has a disc', async () => {
    const { user } = setup(PLAIN)
    await user.click(trigger())
    for (const b of optionButtons()) {
      expect(b.querySelectorAll('[class*="dotSlot"]')).toHaveLength(0)
    }
  })

  it('the trigger shows the selected player’s disc', async () => {
    setup(WITH_DOTS, 'u2')
    expect(trigger()).toHaveTextContent('moth')
    expect(trigger().querySelectorAll('[class*="dot_"]')).toHaveLength(1)
  })

  it('the trigger shows no disc for an option without one', () => {
    setup(WITH_DOTS, 'all')
    expect(trigger().querySelectorAll('[class*="dot_"]')).toHaveLength(0)
  })
})

describe('FilterSelect — dismissal', () => {
  it('closes on Escape', async () => {
    const { user } = setup()
    await user.click(trigger())
    await user.keyboard('{Escape}')
    expect(optionButtons()).toHaveLength(0)
  })

  it('closes on a pointerdown outside, and stays open for one inside', async () => {
    const { user } = setup()
    await user.click(trigger())
    await user.pointer({ target: optionButtons()[0], keys: '[MouseLeft>]' })
    expect(optionButtons()).toHaveLength(2)
    await user.pointer({ target: document.body, keys: '[MouseLeft>]' })
    expect(optionButtons()).toHaveLength(0)
  })
})
