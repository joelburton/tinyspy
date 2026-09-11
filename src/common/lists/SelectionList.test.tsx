// cs-audited-lists

/**
 * Tests for SelectionList.
 *
 * The paint is four CSS rules and the behavior is everything else, so this is
 * where the component's claims get pinned: when the cursor appears at all,
 * where it sits, what each key does to it, and the cases where it must NOT
 * move — a disabled row under Enter, a frozen list, and a list that shrank.
 *
 * "Appears at all" is half the file because this is a SELECTION cursor: an
 * alternative to clicking, hidden until a key asks for it, so a mouse user is
 * never shown a ring. Most tests here therefore reveal it first, which is what
 * `revealCursor` is for — and what it does (one arrow, no movement) is itself
 * one of the claims.
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

type Props = Parameters<typeof SelectionList<Club>>[0]

function setup(props: Partial<Props> = {}) {
  const onActivate = vi.fn()
  const all = (extra: Partial<Props>): Props => ({
    items: CLUBS,
    rowKey: (c) => c.id,
    renderRow: (c) => c.name,
    onActivate,
    empty: 'No clubs yet.',
    label: 'Clubs',
    ...props,
    ...extra,
  })
  const view = render(<SelectionList {...all({})} />)
  const user = userEvent.setup()
  return {
    onActivate,
    user,
    /** Re-render with something changed — how a caller flips `frozen`. */
    rerender: (extra: Partial<Props>) => view.rerender(<SelectionList {...all(extra)} />),
    /** Focus the list and press one arrow, which shows the ring on the
     *  resting row without stepping off it. */
    revealCursor: async () => {
      focusList(list())
      await user.keyboard('{ArrowDown}')
    },
  }
}

describe('SelectionList — the cursor is hidden until asked for', () => {
  it('is one tab stop, and the rows are not focusable', async () => {
    const { user } = setup()
    await user.tab()
    expect(list()).toHaveFocus()
    for (const row of rows()) expect(row).not.toHaveAttribute('tabindex')
  })

  // Focus alone warms the FRAME's border, which is what says "arrows work
  // here". The row ring is a keyboard affordance and waits to be asked for —
  // both page lists autofocus, so otherwise a mouse user meets a blue ring
  // having touched nothing.
  it('stays hidden when the list merely takes focus', async () => {
    const { user } = setup()
    await user.tab()
    expect(list()).toHaveFocus()
    expect(cursorAt()).toBe(-1)
  })

  it('the FIRST arrow reveals it on the resting row without moving', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{ArrowDown}')
    expect(cursorAt()).toBe(0)
  })

  it('the second arrow moves it', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(cursorAt()).toBe(1)
  })

  it('ArrowUp reveals too — any relative key asks for the cursor', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{ArrowUp}')
    expect(cursorAt()).toBe(0)
  })

  it('Space does not reveal it — Space asks for nothing', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard(' ')
    expect(cursorAt()).toBe(-1)
  })

  it('blanks when focus leaves, and comes back where it was', async () => {
    const { user, revealCursor } = setup()
    await revealCursor()
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
    const { user, revealCursor } = setup()
    await revealCursor()
    await user.keyboard('{ArrowUp}')
    expect(cursorAt()).toBe(0)
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(cursorAt()).toBe(CLUBS.length - 1)
  })

  // Home and End name a DESTINATION rather than a direction, so unlike an
  // arrow they reveal and go in the same press: revealing at the resting row
  // would ignore what was asked.
  it('End reveals and jumps in one press', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{End}')
    expect(cursorAt()).toBe(3)
  })

  it('Home reveals and jumps in one press', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(cursorAt()).toBe(2)
    await user.keyboard('{Home}')
    expect(cursorAt()).toBe(0)
  })

  it('Enter activates the row under the cursor', async () => {
    const { onActivate, user, revealCursor } = setup()
    await revealCursor()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onActivate).toHaveBeenCalledWith(CLUBS[1])
  })

  // The mirror of Space never activating: acting must not happen on a row the
  // player cannot see. On the homepage that Enter would navigate off the page.
  it('Enter REVEALS instead of activating while the cursor is hidden', async () => {
    const { onActivate, user } = setup()
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onActivate).not.toHaveBeenCalled()
    expect(cursorAt()).toBe(0)
    // …and the next Enter does act, so this is a delay and not a dead key.
    await user.keyboard('{Enter}')
    expect(onActivate).toHaveBeenCalledWith(CLUBS[0])
  })

  it('Space does NOTHING — moving a cursor must not consent to an action', async () => {
    const { onActivate, user, revealCursor } = setup()
    await revealCursor()
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
    const { user, revealCursor } = setup({ items: MANY })
    await revealCursor()
    await user.keyboard('{PageDown}')
    expect(cursorAt()).toBe(5)
    await user.keyboard('{PageDown}')
    expect(cursorAt()).toBe(10)
    await user.keyboard('{PageUp}')
    expect(cursorAt()).toBe(5)
  })

  // It is a relative key, so it asks for the cursor like an arrow does.
  it('PageDown as the first press only reveals', async () => {
    withHeights(100, 20)
    const { user } = setup({ items: MANY })
    await user.tab()
    await user.keyboard('{PageDown}')
    expect(cursorAt()).toBe(0)
  })

  it('falls back to one row when there is nothing to measure', async () => {
    const { user, revealCursor } = setup({ items: MANY })
    await revealCursor()
    await user.keyboard('{PageDown}')
    expect(cursorAt()).toBe(1)
  })

  it('a page past the end still clamps', async () => {
    withHeights(1000, 20)
    const { user, revealCursor } = setup({ items: MANY })
    await revealCursor()
    await user.keyboard('{PageDown}')
    expect(cursorAt()).toBe(MANY.length - 1)
  })
})

describe('SelectionList — disabled rows', () => {
  // Skipping them would put the cursor index and the row index out of step,
  // and leave nowhere to go when every row is disabled.
  const notCyd = (c: Club) => c.id === 'c'

  it('the cursor LANDS on a disabled row', async () => {
    const { user, revealCursor } = setup({ disabled: notCyd })
    await revealCursor()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(cursorAt()).toBe(2)
  })

  it('Enter does nothing there', async () => {
    const { onActivate, user, revealCursor } = setup({ disabled: notCyd })
    await revealCursor()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('clicking one does nothing either', async () => {
    const { onActivate, user } = setup({ disabled: notCyd })
    await user.click(rows()[2])
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('every row disabled leaves the cursor somewhere and activates nothing', async () => {
    const { onActivate, user, revealCursor } = setup({ disabled: () => true })
    await revealCursor()
    expect(cursorAt()).toBe(0)
    await user.keyboard('{Enter}')
    expect(onActivate).not.toHaveBeenCalled()
  })
})

describe('SelectionList — the mouse sets the cursor without showing it', () => {
  it('clicking a row activates it and shows NO ring', async () => {
    const { onActivate, user } = setup()
    await user.click(rows()[2])
    expect(onActivate).toHaveBeenCalledWith(CLUBS[2])
    expect(cursorAt()).toBe(-1)
  })

  // Cancel a dialog you opened from a row and your first arrow reveals THAT
  // row, so the hand resumes where it left off rather than at the top.
  it('the first arrow after a click reveals the clicked row', async () => {
    const { user } = setup()
    await user.click(rows()[2])
    focusList(list())
    await user.keyboard('{ArrowDown}')
    expect(cursorAt()).toBe(2)
    await user.keyboard('{ArrowDown}')
    expect(cursorAt()).toBe(3)
  })
})

describe('SelectionList — frozen', () => {
  it('ignores every key', async () => {
    const { onActivate, user, revealCursor, rerender } = setup()
    await revealCursor()
    rerender({ frozen: true })
    await user.keyboard('{ArrowDown}{Enter}')
    expect(cursorAt()).toBe(0)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('does not even reveal the cursor', async () => {
    const { user } = setup({ frozen: true })
    await user.tab()
    await user.keyboard('{ArrowDown}')
    expect(cursorAt()).toBe(-1)
  })

  // A dialog that autofocuses a field pulls focus out of the list. Treating
  // that as "the user left" would both lose the ring behind the modal and
  // re-render at the moment the dialog's own buttons are being clicked.
  it('keeps its cursor when focus leaves', async () => {
    const { revealCursor, rerender } = setup()
    await revealCursor()
    expect(cursorAt()).toBe(0)
    rerender({ frozen: true })
    blurList(list())
    expect(cursorAt()).toBe(0)
  })
})

describe('SelectionList — the list changing under the cursor', () => {
  it('clamps the cursor when the list shrinks past it', async () => {
    const { user, rerender, revealCursor } = setup()
    await revealCursor()
    await user.keyboard('{End}')
    expect(cursorAt()).toBe(3)
    rerender({ items: CLUBS.slice(0, 2) })
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

  // Taking focus is not asking for a cursor: autoFocus exists so arrows work
  // without a first Tab, and a player who never presses one sees no ring.
  it('does not reveal the cursor', () => {
    setup({ autoFocus: true })
    expect(cursorAt()).toBe(-1)
  })

  it('does not take focus while the list is still empty', () => {
    setup({ autoFocus: true, items: [] })
    expect(list()).not.toHaveFocus()
  })

  // The two halves of "once" fail separately, so they are pinned separately.
  // This half is the effect's DEPS: it watches whether there is content, not
  // how much, so a list that merely GROWS never re-runs it.
  it('a club arriving does not take focus back', async () => {
    const { user, rerender } = setup({ autoFocus: true, items: CLUBS.slice(0, 2) })
    expect(list()).toHaveFocus()
    blurList(list())
    rerender({ items: CLUBS })
    expect(list()).not.toHaveFocus()
    // …and the list still works, so this isn't just "the component died".
    focusList(list())
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(cursorAt()).toBe(1)
  })

  // This half is the `claimedFocus` ref, and only emptying the list reaches
  // it: that flips the effect's dep back to false, so the deps alone would let
  // it fire a second time when rows return.
  it('a list that empties and refills does not take focus back', () => {
    const { rerender } = setup({ autoFocus: true })
    expect(list()).toHaveFocus()
    blurList(list())
    rerender({ items: [] })
    rerender({ items: CLUBS })
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
