// cs-audited-lists

/**
 * Tests for SelectionList.
 *
 * The paint is four CSS rules and the behavior is everything else, so this is
 * where the component's claims get pinned: where the cursor sits, what each
 * key does to it, and the three cases where it must NOT move — a disabled row
 * under Enter, a frozen list, and a list that shrank under the cursor.
 *
 * The cursor is read off the row's class rather than off focus, because no row
 * is ever focused: the container holds the keyboard and points at a row.
 * Vitest resolves a CSS module to a proxy that echoes the key, so `cursor`
 * appearing in a className is the component having applied `styles.cursor`
 * (that the RULE exists is `vocabularies`/`cssClasses`' job, not this file's).
 */

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectionList } from './SelectionList'

beforeEach(() => {
  // jsdom has no layout, and the component asks it two things.
  // `scrollIntoView` doesn't exist at all.
  Element.prototype.scrollIntoView = vi.fn()
  // `offsetParent` is always null, which the focus-on-arrival effect reads as
  // "this list isn't on screen" and declines to focus. Say it is.
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body)
})

// The page-measuring tests stub heights on the prototype; without this they
// leak into whatever runs next and it silently measures a page it shouldn't.
afterEach(() => {
  vi.restoreAllMocks()
})

/** Move focus without an un-acted state update — there is nothing else on
 *  these pages to Tab to, so the test drives the container directly. */
const focusList = (el: HTMLElement) => act(() => el.focus())
const blurList = (el: HTMLElement) => act(() => el.blur())

type Club = { id: string; name: string }
const CLUBS: Club[] = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bert' },
  { id: 'c', name: 'Cyd' },
  { id: 'd', name: 'Dot' },
]

const list = () => screen.getByRole('group', { name: 'Clubs' })
const rows = () => Array.from(list().children) as HTMLElement[]
/** The index the cursor ring is on, or -1 when no row wears it. */
const cursorAt = () => rows().findIndex((r) => r.className.includes('cursor'))
const names = () => rows().map((r) => r.textContent)

function setup(props: Partial<Parameters<typeof SelectionList<Club>>[0]> = {}) {
  const onActivate = vi.fn()
  const view = render(
    <SelectionList
      items={CLUBS}
      rowKey={(c) => c.id}
      renderRow={(c) => c.name}
      onActivate={onActivate}
      empty="No clubs yet."
      label="Clubs"
      {...props}
    />,
  )
  return { onActivate, user: userEvent.setup(), view }
}

describe('SelectionList — the cursor', () => {
  it('is one tab stop, and the rows are not focusable', async () => {
    const { user } = setup()
    await user.tab()
    expect(list()).toHaveFocus()
    for (const row of rows()) expect(row).not.toHaveAttribute('tabindex')
  })

  it('shows on the first row as soon as the container has focus, before any arrow', async () => {
    const { user } = setup()
    expect(cursorAt()).toBe(-1)
    await user.tab()
    expect(cursorAt()).toBe(0)
  })

  it('blanks when focus leaves, and comes back where it was', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{ArrowDown}')
    expect(cursorAt()).toBe(1)
    blurList(list())
    expect(cursorAt()).toBe(-1)
    focusList(list())
    expect(cursorAt()).toBe(1)
  })
})

describe('SelectionList — the keyboard', () => {
  it('arrows move it and CLAMP — no wrap at either end', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{ArrowUp}')
    expect(cursorAt()).toBe(0)
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(cursorAt()).toBe(CLUBS.length - 1)
  })

  it('Home and End jump to the ends', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{End}')
    expect(cursorAt()).toBe(3)
    await user.keyboard('{Home}')
    expect(cursorAt()).toBe(0)
  })

  it('Enter activates the row under the cursor', async () => {
    const { onActivate, user } = setup()
    await user.tab()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onActivate).toHaveBeenCalledWith(CLUBS[1])
  })

  it('Space does NOTHING — moving a cursor must not consent to an action', async () => {
    const { onActivate, user } = setup()
    await user.tab()
    await user.keyboard(' ')
    expect(onActivate).not.toHaveBeenCalled()
    expect(cursorAt()).toBe(0)
  })

  // Every one of these would otherwise scroll the box out from under the
  // cursor, because the focused element IS the scroll box.
  it.each(['{ArrowDown}', '{ArrowUp}', '{Home}', '{End}', '{PageDown}', '{PageUp}', ' '])(
    'traps %s so the browser cannot scroll the box',
    async (key) => {
      const { user } = setup()
      await user.tab()
      // On `document`, so the component's handler — which React attaches at
      // the render root, above the list — has already run by the time this
      // sees the event.
      const seen: boolean[] = []
      const spy = (e: KeyboardEvent) => seen.push(e.defaultPrevented)
      document.addEventListener('keydown', spy)
      await user.keyboard(key)
      document.removeEventListener('keydown', spy)
      expect(seen).toEqual([true])
    },
  )

  it('a key does nothing at all when the list is empty', async () => {
    const { onActivate, user } = setup({ items: [] })
    await user.tab()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onActivate).not.toHaveBeenCalled()
    expect(cursorAt()).toBe(-1)
  })
})

describe('SelectionList — a measured page', () => {
  /** A page is `clientHeight / offsetHeight`, both of which jsdom reports as
   *  0. Give the container a height and the rows one so PageDown has a real
   *  page to move: 100 / 20 = five rows. */
  function withHeights(boxHeight: number, rowHeight: number) {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(boxHeight)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(rowHeight)
  }

  const MANY = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, name: `Club ${i}` }))

  it('PageDown moves by one visible page, and PageUp back', async () => {
    withHeights(100, 20)
    const { user } = setup({ items: MANY })
    await user.tab()
    await user.keyboard('{PageDown}')
    expect(cursorAt()).toBe(5)
    await user.keyboard('{PageDown}')
    expect(cursorAt()).toBe(10)
    await user.keyboard('{PageUp}')
    expect(cursorAt()).toBe(5)
  })

  it('falls back to one row when there is nothing to measure', async () => {
    const { user } = setup({ items: MANY })
    await user.tab()
    await user.keyboard('{PageDown}')
    expect(cursorAt()).toBe(1)
  })

  it('a page past the end still clamps', async () => {
    withHeights(1000, 20)
    const { user } = setup({ items: MANY })
    await user.tab()
    await user.keyboard('{PageDown}')
    expect(cursorAt()).toBe(MANY.length - 1)
  })
})

describe('SelectionList — disabled rows', () => {
  // Skipping them would put the cursor index and the row index out of step,
  // and leave nowhere to go when every row is disabled.
  const notCyd = (c: Club) => c.id === 'c'

  it('the cursor LANDS on a disabled row', async () => {
    const { user } = setup({ disabled: notCyd })
    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(cursorAt()).toBe(2)
  })

  it('Enter does nothing there', async () => {
    const { onActivate, user } = setup({ disabled: notCyd })
    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('clicking one does nothing either, but still moves the cursor', async () => {
    const { onActivate, user } = setup({ disabled: notCyd })
    await user.click(rows()[2])
    expect(onActivate).not.toHaveBeenCalled()
    expect(cursorAt()).toBe(2)
  })

  it('every row disabled leaves the cursor somewhere and activates nothing', async () => {
    const { onActivate, user } = setup({ disabled: () => true })
    await user.tab()
    expect(cursorAt()).toBe(0)
    await user.keyboard('{Enter}')
    expect(onActivate).not.toHaveBeenCalled()
  })
})

describe('SelectionList — the mouse and the keyboard agree', () => {
  it('clicking a row activates it AND moves the cursor there', async () => {
    const { onActivate, user } = setup()
    await user.click(rows()[2])
    expect(onActivate).toHaveBeenCalledWith(CLUBS[2])
    expect(cursorAt()).toBe(2)
  })

  // Cancel a dialog you opened from a row and the next arrow steps from THAT
  // row, not from wherever the ring last sat.
  it('the next arrow steps from the clicked row', async () => {
    const { user } = setup()
    await user.click(rows()[2])
    focusList(list())
    await user.keyboard('{ArrowDown}')
    expect(cursorAt()).toBe(3)
  })
})

describe('SelectionList — frozen', () => {
  it('ignores every key', async () => {
    const { onActivate, user } = setup({ frozen: true })
    await user.tab()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(cursorAt()).toBe(0)
    expect(onActivate).not.toHaveBeenCalled()
  })

  // A dialog that autofocuses a field pulls focus out of the list. Treating
  // that as "the user left" would both lose the ring behind the modal and
  // re-render at the moment the dialog's own buttons are being clicked.
  it('keeps its cursor when focus leaves', async () => {
    const { user } = setup({ frozen: true })
    await user.tab()
    expect(cursorAt()).toBe(0)
    blurList(list())
    expect(cursorAt()).toBe(0)
  })
})

describe('SelectionList — the list changing under the cursor', () => {
  it('clamps the cursor when the list shrinks past it', async () => {
    const { user, view } = setup()
    await user.tab()
    await user.keyboard('{End}')
    expect(cursorAt()).toBe(3)
    view.rerender(
      <SelectionList
        items={CLUBS.slice(0, 2)}
        rowKey={(c) => c.id}
        renderRow={(c) => c.name}
        onActivate={vi.fn()}
        empty="No clubs yet."
        label="Clubs"
      />,
    )
    expect(names()).toEqual(['Ada', 'Bert'])
    expect(cursorAt()).toBe(1)
  })
})

describe('SelectionList — the empty state', () => {
  it('draws the frame with the message inside it, and no rows', () => {
    setup({ items: [] })
    expect(list()).toBeInTheDocument()
    expect(screen.getByText('No clubs yet.')).toBeInTheDocument()
    expect(rows()).toHaveLength(1)
  })
})

describe('SelectionList — autoFocus', () => {
  it('takes focus when the list arrives with content', () => {
    setup({ autoFocus: true })
    expect(list()).toHaveFocus()
  })

  it('does not take focus while the list is still empty', () => {
    setup({ autoFocus: true, items: [] })
    expect(list()).not.toHaveFocus()
  })

  // The clubs list is realtime, so keying on length rather than on first
  // content would re-run this when a friend adds you to a club.
  /** Re-render the same list with different items, `autoFocus` still on. */
  function withItems(view: ReturnType<typeof setup>['view'], items: Club[]) {
    view.rerender(
      <SelectionList
        items={items}
        rowKey={(c) => c.id}
        renderRow={(c) => c.name}
        onActivate={vi.fn()}
        empty="No clubs yet."
        label="Clubs"
        autoFocus
      />,
    )
  }

  // The two halves of "once" fail separately, so they are pinned separately.
  // This half is the effect's DEPS: it watches whether there is content, not
  // how much, so a list that merely GROWS never re-runs it.
  it('a club arriving does not take focus back', async () => {
    const { user, view } = setup({ autoFocus: true, items: CLUBS.slice(0, 2) })
    expect(list()).toHaveFocus()
    blurList(list())
    withItems(view, CLUBS)
    expect(list()).not.toHaveFocus()
    // …and the list still works, so this isn't just "the component died".
    focusList(list())
    await user.keyboard('{ArrowDown}')
    expect(cursorAt()).toBe(1)
  })

  // This half is the `claimedFocus` ref, and only emptying the list reaches
  // it: that flips the effect's dep back to false, so the deps alone would let
  // it fire a second time when rows return.
  it('a list that empties and refills does not take focus back', () => {
    const { view } = setup({ autoFocus: true })
    expect(list()).toHaveFocus()
    blurList(list())
    withItems(view, [])
    withItems(view, CLUBS)
    expect(list()).not.toHaveFocus()
  })

  it('yields to something already focused', () => {
    render(<input aria-label="Search" autoFocus />)
    const field = screen.getByRole('textbox', { name: 'Search' })
    expect(field).toHaveFocus()
    setup({ autoFocus: true })
    expect(field).toHaveFocus()
    expect(list()).not.toHaveFocus()
  })
})
