/**
 * Tests for the shared Menu component. Menu owns the trigger ↔
 * popover keyboard contract for every "icon opens a list of
 * actions" affordance in the app — GamePage's game menu today,
 * ClubPage's club menu next. The contract is intricate enough
 * (arrow nav, disabled-skip, Esc-returns-focus, Tab-closes,
 * click-outside, ARIA wiring) that manual smoke-testing leaves
 * blind spots; these tests pin the behavior so the keyboard
 * contract doesn't quietly drift.
 *
 * What's covered:
 *   - Open/close: click toggle, ArrowDown on trigger, Esc closes,
 *     Tab closes, click-outside closes.
 *   - Focus: first enabled item on open, Esc returns focus to
 *     trigger, arrow nav moves focus.
 *   - Disabled items: arrow nav skips them, click on a disabled
 *     item does nothing.
 *   - Wrapping: ArrowDown past the last item wraps to first;
 *     ArrowUp past first wraps to last.
 *   - Activation order: closeMenu fires BEFORE the item's onClick
 *     so a modal opened by the item picks up focus cleanly.
 *   - ARIA: trigger gets aria-haspopup, aria-expanded, and
 *     aria-controls; aria-controls matches the popover's id;
 *     items have role=menuitem and a disabled item carries
 *     aria-disabled.
 *   - Section dividers: appear between non-empty sections;
 *     empty sections drop out; no leading/trailing dividers.
 *
 * Out of scope: visual focus-ring rendering (CSS only), z-index
 * stacking (a visual-layout contract), the per-context icon
 * styling (caller's CSS via triggerClassName).
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Menu } from './Menu'
import type { MenuSection } from '../../lib/games'

function renderMenu(
  sections: MenuSection[],
  opts: { triggerLabel?: string; returnFocusOnClose?: boolean } = {},
) {
  return render(
    <>
      <Menu
        trigger="☰"
        sections={sections}
        triggerLabel={opts.triggerLabel ?? 'Test menu'}
        returnFocusOnClose={opts.returnFocusOnClose}
      />
      {/* A focusable element after the menu so we can test
       *  Tab-closes-and-advances-focus. */}
      <button type="button">after</button>
    </>,
  )
}

function singleSection(
  items: Array<{
    id: string
    label: string
    disabled?: boolean
    onClick?: () => void
    shortcut?: string
  }>,
): MenuSection[] {
  return [
    {
      items: items.map((it) => ({
        id: it.id,
        label: it.label,
        disabled: it.disabled,
        onClick: it.onClick ?? (() => {}),
        shortcut: it.shortcut,
      })),
    },
  ]
}

describe('Menu — open/close', () => {
  it('renders the trigger with the right ARIA shape', () => {
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
    const trigger = screen.getByRole('button', { name: 'Test menu' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // aria-controls is set even when collapsed — AT walks the
    // attribute to know there's an associated popup.
    expect(trigger).toHaveAttribute('aria-controls')
  })

  it('opens on trigger click and renders the popover', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Test menu' }),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('aria-controls on the trigger matches the popover id when open', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
    const trigger = screen.getByRole('button', { name: 'Test menu' })
    await user.click(trigger)
    const popover = screen.getByRole('menu')
    expect(trigger.getAttribute('aria-controls')).toBe(popover.id)
    expect(popover.id).toBeTruthy()
  })

  it('toggles closed on a second trigger click', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
    const trigger = screen.getByRole('button', { name: 'Test menu' })
    await user.click(trigger)
    await user.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens on ArrowDown from the focused trigger', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
    const trigger = screen.getByRole('button', { name: 'Test menu' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('closes on Esc and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
    const trigger = screen.getByRole('button', { name: 'Test menu' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on Tab so focus advances to the next page element', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes when the user mousedowns outside the popover', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    // The "after" button sits outside the popover.
    await user.click(screen.getByRole('button', { name: 'after' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('stays open when the user clicks inside the popover (but not on an item)', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    const popover = screen.getByRole('menu')
    await user.click(popover) // click the bare popover surface, not an item
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})

describe('Menu — focus + arrow nav', () => {
  it('focuses the first enabled item on open', async () => {
    const user = userEvent.setup()
    renderMenu(
      singleSection([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ]),
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus()
  })

  it('skips a disabled first item and focuses the first enabled one', async () => {
    const user = userEvent.setup()
    renderMenu(
      singleSection([
        { id: 'a', label: 'Alpha', disabled: true },
        { id: 'b', label: 'Beta' },
      ]),
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    expect(screen.getByRole('menuitem', { name: 'Beta' })).toHaveFocus()
  })

  it('ArrowDown moves focus to the next enabled item', async () => {
    const user = userEvent.setup()
    renderMenu(
      singleSection([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ]),
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Beta' })).toHaveFocus()
  })

  it('ArrowDown skips disabled items', async () => {
    const user = userEvent.setup()
    renderMenu(
      singleSection([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta', disabled: true },
        { id: 'c', label: 'Gamma' },
      ]),
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Gamma' })).toHaveFocus()
  })

  it('ArrowDown wraps from last enabled item back to first', async () => {
    const user = userEvent.setup()
    renderMenu(
      singleSection([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ]),
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus()
  })

  it('ArrowUp wraps from first to last enabled item', async () => {
    const user = userEvent.setup()
    renderMenu(
      singleSection([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
        { id: 'c', label: 'Gamma' },
      ]),
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Gamma' })).toHaveFocus()
  })

  it('ArrowUp skips disabled items', async () => {
    const user = userEvent.setup()
    renderMenu(
      singleSection([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta', disabled: true },
        { id: 'c', label: 'Gamma' },
      ]),
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    // Open focuses 'Alpha' (index 0). ArrowUp from there should
    // wrap past the disabled 'Beta' to 'Gamma'.
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Gamma' })).toHaveFocus()
  })
})

describe('Menu — activation', () => {
  it('clicking an item fires its onClick and closes the menu', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha', onClick }]))
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Alpha' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('clicking a disabled item is a no-op', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderMenu(
      singleSection([{ id: 'a', label: 'Alpha', disabled: true, onClick }]),
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    // Querying as menuitem may or may not match a disabled
    // <button>; the role attribute is present so it does. The
    // click should still no-op because the activate() guard runs.
    const item = screen.getByText('Alpha')
    await user.click(item)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('restores focus to the trigger BEFORE the item onClick runs (so a modal opened by the click picks up focus cleanly)', async () => {
    const user = userEvent.setup()
    // The contract: closeMenu() — which calls trigger.focus() —
    // runs first; then onClick runs. So by the time the item's
    // onClick body executes, document.activeElement is already
    // the trigger button. Any modal opened inside onClick can
    // then steal focus on its own initiative without fighting
    // the menu's later focus-restore.
    //
    // (The popover element itself may still be in the DOM during
    // onClick — React batches the open-state re-render — but the
    // focus move is synchronous, which is what the contract is
    // really about.)
    let activeWhenClicked: Element | null = null
    const onClick = vi.fn(() => {
      activeWhenClicked = document.activeElement
    })
    renderMenu(singleSection([{ id: 'a', label: 'Alpha', onClick }]))
    const trigger = screen.getByRole('button', { name: 'Test menu' })
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Alpha' }))
    expect(onClick).toHaveBeenCalled()
    expect(activeWhenClicked).toBe(trigger)
  })

  it('disabled item carries aria-disabled', async () => {
    const user = userEvent.setup()
    renderMenu(
      singleSection([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta', disabled: true },
      ]),
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    // The label lives in a <span> inside the menuitem button; assert on the
    // button (which carries aria-disabled / disabled).
    const beta = screen.getByRole('menuitem', { name: 'Beta' })
    expect(beta).toHaveAttribute('aria-disabled', 'true')
    expect(beta).toBeDisabled()
  })

  it('renders a shortcut hint on an item that carries one', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Check word', shortcut: '⌥C' }]))
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    const item = screen.getByRole('menuitem', { name: /Check word/ })
    expect(within(item).getByText('⌥C')).toBeInTheDocument()
  })
})

describe('Menu — key isolation (no leak to a page-level window handler)', () => {
  it('swallows keys while the popover is open (arrow nav does not reach window)', async () => {
    const user = userEvent.setup()
    const windowSpy = vi.fn()
    window.addEventListener('keydown', windowSpy)
    try {
      renderMenu(singleSection([{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]))
      await user.click(screen.getByRole('button', { name: 'Test menu' }))
      windowSpy.mockClear()
      await user.keyboard('{ArrowDown}')
      // The crosswords board reads window keydowns for cursor movement — an open
      // menu must not let its own arrow nav double as a board move.
      expect(windowSpy).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', windowSpy)
    }
  })

  it('swallows keys on the focused trigger (opening via ⌄ does not reach window)', async () => {
    const user = userEvent.setup()
    const windowSpy = vi.fn()
    window.addEventListener('keydown', windowSpy)
    try {
      renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
      screen.getByRole('button', { name: 'Test menu' }).focus()
      windowSpy.mockClear()
      await user.keyboard('{ArrowDown}')
      expect(windowSpy).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', windowSpy)
    }
  })
})

describe('Menu — returnFocusOnClose', () => {
  it('returns focus to the trigger on Esc by default', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]))
    const trigger = screen.getByRole('button', { name: 'Test menu' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('does NOT keep focus on the trigger when returnFocusOnClose is false', async () => {
    const user = userEvent.setup()
    renderMenu(singleSection([{ id: 'a', label: 'Alpha' }]), { returnFocusOnClose: false })
    const trigger = screen.getByRole('button', { name: 'Test menu' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    // Focus falls to <body> so a page-level board keyboard resumes; the
    // trigger must not swallow subsequent arrow keys.
    expect(trigger).not.toHaveFocus()
  })
})

describe('Menu — sections + dividers', () => {
  it('renders a divider between two non-empty sections', async () => {
    const user = userEvent.setup()
    render(
      <Menu
        trigger="☰"
        triggerLabel="Test menu"
        sections={[
          { items: [{ id: 'a', label: 'Alpha', onClick: () => {} }] },
          { items: [{ id: 'b', label: 'Beta', onClick: () => {} }] },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    const popover = screen.getByRole('menu')
    expect(within(popover).getAllByRole('separator')).toHaveLength(1)
  })

  it('skips an empty section without leaving a leading divider', async () => {
    const user = userEvent.setup()
    render(
      <Menu
        trigger="☰"
        triggerLabel="Test menu"
        sections={[
          { items: [] },
          { items: [{ id: 'a', label: 'Alpha', onClick: () => {} }] },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    const popover = screen.getByRole('menu')
    expect(within(popover).queryAllByRole('separator')).toHaveLength(0)
  })

  it('does not leave a trailing divider when a later section is empty', async () => {
    const user = userEvent.setup()
    render(
      <Menu
        trigger="☰"
        triggerLabel="Test menu"
        sections={[
          { items: [{ id: 'a', label: 'Alpha', onClick: () => {} }] },
          { items: [] },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    const popover = screen.getByRole('menu')
    expect(within(popover).queryAllByRole('separator')).toHaveLength(0)
  })

  it('renders a section header (title + credit lines) as non-clickable info', async () => {
    const user = userEvent.setup()
    render(
      <Menu
        trigger="☰"
        triggerLabel="Test menu"
        sections={[
          // A header-only section (no items) — the crosswords puzzle-info block.
          { header: { title: 'Sunday Special', lines: ['by A. Constructor', '© 2026'] }, items: [] },
          { items: [{ id: 'help', label: 'Help', onClick: () => {} }] },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    const popover = screen.getByRole('menu')
    // The header text shows…
    expect(within(popover).getByText('Sunday Special')).toBeInTheDocument()
    expect(within(popover).getByText('by A. Constructor')).toBeInTheDocument()
    expect(within(popover).getByText('© 2026')).toBeInTheDocument()
    // …but it is NOT a menuitem (the title isn't a clickable button)…
    expect(within(popover).queryByRole('menuitem', { name: 'Sunday Special' })).toBeNull()
    // …and a header-only section still counts for divider placement (one divider
    // between the header block and the Help item below it).
    expect(within(popover).getAllByRole('separator')).toHaveLength(1)
  })
})

/**
 * Submenus — the HYBRID presentation.
 *
 * One piece of state, two shapes: a FLYOUT beside the parent row on desktop, a
 * DRILL-DOWN that replaces the list on mobile. Both are tested here because the
 * whole point of the split is that they behave differently, and the failure mode
 * is silent — a phone rendering a flyout just looks like a panel landed on top
 * of another one.
 *
 * jsdom has no `matchMedia`, and `useMediaQuery` reads that as "unmatched", so
 * the default render IS the desktop branch. The mobile block stubs it in.
 */

/** A menu whose last row opens a two-item submenu. */
function withSubmenu(onProfile = () => {}): MenuSection[] {
  return [
    {
      items: [
        { id: 'help', label: 'Help', onClick: () => {} },
        { id: 'back', label: 'Back to club', onClick: () => {} },
        {
          id: 'account',
          label: 'Account',
          items: [
            { id: 'profile', label: 'Profile', onClick: onProfile },
            { id: 'logout', label: 'Log out', onClick: () => {} },
          ],
        },
      ],
    },
  ]
}

/** Point `matchMedia` at a fixed answer for the duration of a test. */
function stubMatchMedia(matches: boolean) {
  const mql = {
    matches,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => mql,
  })
}

describe('Menu — submenus (desktop flyout)', () => {
  it('advertises a submenu parent as a disclosure, not a command', async () => {
    const user = userEvent.setup()
    renderMenu(withSubmenu())
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    const parent = screen.getByRole('menuitem', { name: /Account/ })
    expect(parent).toHaveAttribute('aria-haspopup', 'menu')
    expect(parent).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens a SECOND panel and keeps the parent list on screen', async () => {
    const user = userEvent.setup()
    renderMenu(withSubmenu())
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.click(screen.getByRole('menuitem', { name: /Account/ }))

    // Two menus now: the parent list and the flyout.
    expect(screen.getAllByRole('menu')).toHaveLength(2)
    // The defining property of a flyout — the parent list did NOT go away.
    expect(screen.getByRole('menuitem', { name: 'Help' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeInTheDocument()
    // …and there is no Back row: the list you'd go back to is right there.
    expect(screen.queryByRole('menuitem', { name: /‹/ })).not.toBeInTheDocument()
  })

  it('Escape unwinds ONE level — out of the submenu, not out of the menu', async () => {
    const user = userEvent.setup()
    renderMenu(withSubmenu())
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.click(screen.getByRole('menuitem', { name: /Account/ }))

    await user.keyboard('{Escape}')
    // Submenu gone, menu still open — throwing away the whole menu would
    // discard the step the user just took.
    expect(screen.queryByRole('menuitem', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Help' })).toBeInTheDocument()

    // A second Escape closes the menu itself.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('ArrowRight opens a submenu and ArrowLeft steps back out', async () => {
    const user = userEvent.setup()
    renderMenu(withSubmenu())
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    // Focus starts on Help; walk down to the submenu parent.
    await user.keyboard('{ArrowDown}{ArrowDown}')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(screen.queryByRole('menuitem', { name: 'Profile' })).not.toBeInTheDocument()
    // Focus returns to the row it came from, not to the top of the list.
    expect(screen.getByRole('menuitem', { name: /Account/ })).toHaveFocus()
  })

  it('activating a submenu item closes the WHOLE menu', async () => {
    const user = userEvent.setup()
    const onProfile = vi.fn()
    renderMenu(withSubmenu(onProfile))
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.click(screen.getByRole('menuitem', { name: /Account/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Profile' }))

    expect(onProfile).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('reopening the menu starts at the top level, never still drilled in', async () => {
    const user = userEvent.setup()
    renderMenu(withSubmenu())
    const trigger = screen.getByRole('button', { name: 'Test menu' })
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: /Account/ }))
    await user.click(trigger) // close
    await user.click(trigger) // reopen

    expect(screen.getByRole('menuitem', { name: 'Help' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Profile' })).not.toBeInTheDocument()
  })
})

describe('Menu — submenus (mobile drill-down)', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('REPLACES the list instead of opening a second panel', async () => {
    stubMatchMedia(true)
    const user = userEvent.setup()
    renderMenu(withSubmenu())
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.click(screen.getByRole('menuitem', { name: /Account/ }))

    // The whole point of the mobile shape: one panel, and the top level is gone
    // (a flyout here would have nowhere to go — the popover already runs to the
    // width cap on a phone).
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.queryByRole('menuitem', { name: 'Help' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeInTheDocument()
  })

  it('offers a Back row naming where it goes, which restores the top level', async () => {
    stubMatchMedia(true)
    const user = userEvent.setup()
    renderMenu(withSubmenu())
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.click(screen.getByRole('menuitem', { name: /Account/ }))

    // Named, not a bare arrow — with the parent list gone it's the only thing
    // saying where you are.
    const back = screen.getByRole('menuitem', { name: '‹ Account' })
    await user.click(back)

    expect(screen.getByRole('menuitem', { name: 'Help' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Profile' })).not.toBeInTheDocument()
  })

  it('keyboard: focus lands past the Back row, and ArrowUp reaches it', async () => {
    stubMatchMedia(true)
    const user = userEvent.setup()
    renderMenu(withSubmenu())
    await user.click(screen.getByRole('button', { name: 'Test menu' }))
    await user.click(screen.getByRole('menuitem', { name: /Account/ }))

    // Opening a submenu focuses its first real ITEM, not the Back row — you
    // drilled in to do something, not to leave again.
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: '‹ Account' })).toHaveFocus()
  })
})
