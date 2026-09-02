// cs-unmet

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { cls } from '../../lib/util/cls'
import styles from './SelectionList.module.css'

/**
 * The two kinds, expressed as a union so a caller cannot be both.
 *
 * **do now** — choosing does the thing immediately: you land on the club, the
 * setup dialog opens, the suggested move stages on the board. `Enter` activates
 * and `Space` deliberately does nothing, because moving a cursor must not
 * consent to an action.
 *
 * **select** — choosing records a decision you act on LATER, and must not
 * submit the dialog the list sits in. `Enter` and `Space` both mean "make this
 * the selection", and the chosen row keeps a mark.
 */
type Activation<T> =
  | {
      onActivate: (item: T) => void
      selected?: never
      onSelect?: never
    }
  | {
      /** The chosen item's key, compared against `rowKey`. */
      selected: string | null
      onSelect: (item: T) => void
      onActivate?: never
    }

type Props<T> = {
  /** The rows, in display order. Its length IS the list's length — the cursor
   *  is clamped to it on every render, because these lists shrink under the
   *  cursor (the clubs are realtime; both club-page lists are filtered). */
  items: readonly T[]
  /** A stable identity per row. */
  rowKey: (item: T) => string
  /** The row's CONTENTS. The component renders the row element itself, which is
   *  what lets it own the cursor ring, the scroll-into-view and the click. */
  renderRow: (item: T) => ReactNode
  /** Shown inside the frame when there are no items — including the busy
   *  moment before an answer arrives ("Loading puzzles…"). */
  empty: ReactNode
  /** Rows the cursor lands on but Enter won't act on. */
  disabled?: (item: T) => boolean
  /** Native tooltip for a row — in practice, why a disabled one does nothing.
   *  It belongs on the row element, which only this component renders. */
  rowTitle?: (item: T) => string | undefined
  /** Tightens the rows. For a list whose rows carry two lines of text. */
  density?: 'default' | 'packed'
  /** Take focus on arrival, once, when the list first has content. A page says
   *  yes (arrows work without a first Tab); a list inside a dialog that
   *  autofocuses a field says no. */
  autoFocus?: boolean
  /** Absorb the parent's free space rather than hugging the rows. */
  fills?: boolean
  /**
   * Something ABOVE this list owns the keyboard — a modal the list itself
   * opened. While frozen it ignores every key and, crucially, does not blank
   * its cursor when focus leaves: a dialog that autofocuses a field pulls focus
   * out of here, and treating that as "the user left the list" both loses the
   * ring behind the modal and re-renders at the worst moment. That re-render
   * used to land BETWEEN the mousedown and the click of the dialog's own
   * buttons and swallow the click, so Cancel did nothing.
   *
   * Only a caller knows what it has open, so only a caller can say this.
   */
  frozen?: boolean
  /** Names the list for the container element. */
  label: string
  /** The container element. ClubPage compares it against `document.activeElement`
   *  to toggle Tab between its two lists, and focuses it when a setup dialog
   *  closes. */
  ref?: Ref<HTMLDivElement>
} & Activation<T>

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
 * **Why a component and not a CSS pattern.** The paint is four rules; the
 * behavior was written out by hand at three call sites, along with the ring
 * class, the `scrollIntoView` and a cursor index threaded down as a prop. It
 * also cannot take opaque children: given assembled elements it could count
 * them but not see inside one, so the ring, the ref, the disabled test and
 * Enter would all stay at the call site — which is the duplication being
 * removed. Hence `items` + `renderRow`.
 *
 * docs/ui.md → Selection lists
 */
export function SelectionList<T>({
  items,
  rowKey,
  renderRow,
  empty,
  disabled,
  rowTitle,
  density = 'default',
  autoFocus,
  fills,
  frozen,
  label,
  ref,
  onActivate,
  selected,
  onSelect,
}: Props<T>) {
  const listRef = useRef<HTMLDivElement | null>(null)
  // Tracked on the container proper (not a bubbled child focus) so nothing can
  // leave a stale ring pointing somewhere else.
  const [focused, setFocused] = useState(false)
  // Only the user's explicit moves. Where the cursor sits BEFORE they move it
  // is derived below, because in the "select" kind that answer arrives with the
  // data — freezing it in a useState initializer would pin it to whatever was
  // (or wasn't) selected on the first render.
  const [moved, setMoved] = useState(false)
  const [movedTo, setMovedTo] = useState(0)

  const isSelectKind = onSelect !== undefined
  const selectedIndex =
    selected == null ? -1 : items.findIndex((item) => rowKey(item) === selected)

  // The cursor STARTS on the selected row in the "select" kind, so opening a
  // picker puts you where you already are rather than at the top.
  const resting = selectedIndex >= 0 ? selectedIndex : 0
  const cursor =
    items.length === 0 ? -1 : Math.min(moved ? movedTo : resting, items.length - 1)
  // The ring shows whenever the container holds focus. It does NOT wait for a
  // first arrow the way a board tile's cursor does: a tile shares its box with
  // the game's own colors, and a row has no competing color, so an always-on
  // ring costs nothing and answers "where am I" before you ask.
  const showCursor = focused && cursor >= 0

  function moveTo(next: number) {
    setMoved(true)
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
    if (onSelect) onSelect(item)
    else onActivate?.(item)
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
        e.preventDefault()
        // Selecting is not consenting to an action, so Space acts only where
        // choosing IS the whole act.
        if (isSelectKind) activate(cursor)
        break
    }
  }

  // Take focus once, when the list first has content — not on every length
  // change. The clubs list is realtime, so a friend adding you to a club used
  // to re-run this and could take focus out from under you
  // (F15 `focus-on-every-refetch`). Yields to anything already focused, and
  // `preventScroll` because a focus-scroll here only jitters the page.
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
        <p className={cls('muted', styles.empty)}>{empty}</p>
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
                selectedIndex === i && styles.selected,
                showCursor && i === cursor && styles.cursor,
              )}
              // Keep the cursor row in the scrolled frame's view. The list
              // scrolls, and focus never moves to a row, so the browser has
              // nothing of its own to scroll to.
              ref={
                showCursor && i === cursor
                  ? (el) => el?.scrollIntoView({ block: 'nearest' })
                  : undefined
              }
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
