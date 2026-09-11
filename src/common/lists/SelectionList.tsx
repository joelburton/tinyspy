// cs-audited-lists

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { cls } from '../utils/cls'
import styles from './SelectionList.module.css'

type Props<T> = {
  // The rows, in display order. Its length IS the list's length — the cursor
  // is clamped to it on every render, because these lists shrink under the
  // cursor (the clubs are realtime; both club-page lists are filtered).
  items: readonly T[]
  // A stable identity per row.
  rowKey: (item: T) => string
  // The row's CONTENTS. The component renders the row element itself, which is
  // what lets it own the cursor ring, the scroll-into-view and the click.
  renderRow: (item: T) => ReactNode
  // Choosing a row DOES the thing, immediately: you land on the club, the
  // setup dialog opens, the puzzle starts. Enter fires it and Space does not,
  // because moving a cursor must not consent to an action.
  onActivate: (item: T) => void
  // Shown inside the frame when there are no items — including the busy
  // moment before an answer arrives ("Loading puzzles…").
  empty: ReactNode
  // Rows the cursor lands on but Enter won't act on.
  disabled?: (item: T) => boolean
  // Native tooltip for a row — in practice, why a disabled one does nothing.
  // It belongs on the row element, which only this component renders.
  rowTitle?: (item: T) => string | undefined
  // Tightens the rows. For a list whose rows carry two lines of text.
  density?: 'default' | 'packed'
  // Take focus on arrival, once, when the list first has content. A page says
  // yes (arrows work without a first Tab); a list inside a dialog that
  // autofocuses a field says no.
  autoFocus?: boolean
  // Absorb the parent's free space rather than hugging the rows.
  fills?: boolean
  // Something ABOVE this list owns the keyboard — a modal the list itself
  // opened. While frozen it ignores every key and, crucially, does not blank
  // its cursor when focus leaves: a dialog that autofocuses a field pulls focus
  // out of here, and treating that as "the user left the list" both loses the
  // ring behind the modal and re-renders while the dialog is being clicked —
  // which can land between a button's mousedown and its click and swallow it.
  //
  // Only a caller knows what it has open, so only a caller can say this.
  frozen?: boolean
  // Names the list for the container element.
  label: string
  // The container element. ClubPage compares it against `document.activeElement`
  // to toggle Tab between its two lists, and focuses it when a setup dialog
  // closes.
  ref?: Ref<HTMLDivElement>
}

/**
 * **A list you move a cursor through and choose from.**
 *
 * The name is deliberate: "list" alone also means a plain bulleted list of
 * text, which is most of what the word points at in this repo and is
 * emphatically not this. The line that decides membership is *you pick exactly
 * one thing* — not "a column of rows", which is what `Menu`, `FilterSelect` and
 * the setup dialog's player checkboxes all look like from the outside without
 * being one.
 *
 * **The container is the tab stop and the rows are inert.** That is the whole
 * shape: the list holds the real focus, arrows move a cursor through the rows,
 * and Enter acts on the one under it. A row is a plain `<div>` — not an anchor,
 * not a button — so there is no second thing to focus and no second ring to
 * explain. What Tab does *next* belongs to the page, never to this.
 *
 * **Why `items` + `renderRow` and not children.** The paint is four rules and
 * the behavior is the rest, so a CSS pattern would leave the ring, the
 * scroll-into-view, the disabled test and Enter at every call site. Given
 * assembled children this component could count them but not see inside one,
 * which is the same thing: it has to render the row element itself to own any
 * of that. So the caller supplies the row's CONTENTS and nothing else.
 *
 * docs/ui.md → Selection lists
 */
export function SelectionList<T>({
  items,
  rowKey,
  renderRow,
  onActivate,
  empty,
  disabled,
  rowTitle,
  density = 'default',
  autoFocus,
  fills,
  frozen,
  label,
  ref,
}: Props<T>) {
  const listRef = useRef<HTMLDivElement | null>(null)
  // Tracked on the container proper (not a bubbled child focus) so nothing can
  // leave a stale ring pointing somewhere else.
  const [focused, setFocused] = useState(false)
  // The row the cursor sits on: the top one until the user moves it. Clamped
  // here rather than at the move, because the list shrinks under the cursor.
  const [movedTo, setMovedTo] = useState(0)
  const cursor = items.length === 0 ? -1 : Math.min(movedTo, items.length - 1)
  // The ring shows whenever the container holds focus. It does NOT wait for a
  // first arrow the way a board tile's cursor does: a tile shares its box with
  // the game's own colors, and a row has no competing color, so an always-on
  // ring costs nothing and answers "where am I" before you ask.
  const showCursor = focused && cursor >= 0

  function moveTo(next: number) {
    setMovedTo(Math.max(0, Math.min(items.length - 1, next)))
  }

  /** One visible page, measured rather than guessed: a constant would be wrong
   *  for both densities and for every list height. Falls back to one row when
   *  there is nothing to measure. */
  function pageSize() {
    const box = listRef.current
    const firstRow = box?.firstElementChild as HTMLElement | null
    if (!box || !firstRow?.offsetHeight) return 1
    return Math.max(1, Math.floor(box.clientHeight / firstRow.offsetHeight))
  }

  function activate(index: number) {
    const item = items[index]
    if (!item || disabled?.(item)) return
    onActivate(item)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (frozen) return
    // NOTHING here is allowed to do the native thing. The focused element IS
    // the scroll box, so Space and the four page keys would otherwise scroll
    // it out from under the cursor.
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        // Clamped to the ends — deliberately no wrap-around.
        moveTo(cursor + (e.key === 'ArrowDown' ? 1 : -1))
        break
      case 'Home':
        e.preventDefault()
        moveTo(0)
        break
      case 'End':
        e.preventDefault()
        moveTo(items.length - 1)
        break
      case 'PageDown':
        e.preventDefault()
        moveTo(cursor + pageSize())
        break
      case 'PageUp':
        e.preventDefault()
        moveTo(cursor - pageSize())
        break
      case 'Enter':
        e.preventDefault()
        activate(cursor)
        break
      case ' ':
        // Trapped so it cannot scroll the box, and then inert: choosing here
        // acts, and moving a cursor must not consent to that.
        e.preventDefault()
        break
    }
  }

  // Take focus once, when the list first has CONTENT — not on every length
  // change. The clubs list is realtime, so keying on length would re-run this
  // when a friend adds you to a club and take focus out from under you. Yields
  // to anything already focused, and `preventScroll` because a focus-scroll
  // here only jitters the page.
  const claimedFocus = useRef(false)
  const hasItems = items.length > 0
  useEffect(
    function focusOnArrival() {
      if (!autoFocus || claimedFocus.current || !hasItems) return
      claimedFocus.current = true
      const el = listRef.current
      const idle =
        document.activeElement === null || document.activeElement === document.body
      if (el && el.offsetParent !== null && idle) el.focus({ preventScroll: true })
    },
    [autoFocus, hasItems],
  )

  // Keep the cursor row inside the scrolled frame. The list scrolls and focus
  // never moves to a row, so the browser has nothing of its own to scroll to.
  //
  // An effect and not a `ref` on the row: an inline ref callback is a new
  // function every render, so React detaches and re-attaches it each time and
  // the scroll re-runs on renders the cursor did not move in. That is mostly
  // invisible — `nearest` does nothing while the row is already on screen —
  // but it yanks the list back if you have scrolled away from the cursor.
  useEffect(
    function keepCursorInView() {
      if (!showCursor) return
      listRef.current?.children[cursor]?.scrollIntoView({ block: 'nearest' })
    },
    [cursor, showCursor],
  )

  return (
    <div
      ref={(el) => {
        listRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      className={cls(styles.list, fills && styles.fills, density === 'packed' && styles.packed)}
      tabIndex={0}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        if (e.target === e.currentTarget) setFocused(true)
      }}
      onBlur={(e) => {
        if (e.target === e.currentTarget && !frozen) setFocused(false)
      }}
    >
      {items.length === 0 ? (
        <p className="emptyState">{empty}</p>
      ) : (
        items.map((item, i) => {
          const isDisabled = disabled?.(item) ?? false
          return (
            <div
              key={rowKey(item)}
              title={rowTitle?.(item)}
              className={cls(
                styles.row,
                isDisabled && styles.disabled,
                showCursor && i === cursor && styles.cursor,
              )}
              // Clicking IS moving the cursor, so the mouse and the keyboard
              // agree on where you are: cancel a dialog you opened from a row
              // and the next arrow steps from that row, not from wherever the
              // ring last sat.
              onClick={() => {
                moveTo(i)
                activate(i)
              }}
            >
              {renderRow(item)}
            </div>
          )
        })
      )}
    </div>
  )
}
