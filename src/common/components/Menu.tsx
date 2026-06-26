import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cls } from '../lib/cls'
import type { MenuItem, MenuSection } from '../lib/games'
import styles from './Menu.module.css'

/** Imperative handle exposed via `ref` so an app-level shortcut (the
 *  "?" key — see useAppShortcuts) can open the menu without owning
 *  its internal open state. */
export type MenuHandle = { open: () => void }

type Props = {
  /** The clickable element that opens the menu. Wrapped by
   *  `<Menu>` in a `<button>` with the menu ARIA attributes;
   *  the trigger element itself should be visually descriptive
   *  (an icon, a logo) — Menu adds nothing visual around it
   *  besides hover/focus state on the wrapping button. */
  trigger: ReactNode
  /** Ordered list of sections rendered in the dropdown. Empty
   *  sections drop out; dividers appear between non-empty
   *  sections (no leading or trailing divider). */
  sections: MenuSection[]
  /** Accessible label for the trigger button (becomes
   *  `aria-label`). Default: "Menu". Override to "Game menu" /
   *  "Club menu" for context. */
  triggerLabel?: string
  /** Extra CSS class for the trigger button, so the caller can
   *  add per-context styling (sizing, padding). The base
   *  `styles.trigger` already handles button reset + hover. */
  triggerClassName?: string
  /** Which edge of the trigger the popover aligns to. Default
   *  `left` (popover's left edge sits at the trigger's left
   *  edge — the right thing for a left-side trigger like the
   *  GamePage logo). Set to `right` for triggers at the right
   *  side of the screen (the UserMenu in the top-right corner),
   *  so the popover doesn't overflow off-screen to the right. */
  popoverAlign?: 'left' | 'right'
}

/**
 * Generic dropdown menu — trigger button + popover with grouped
 * items + keyboard navigation. Used by `<GamePage>` (logo →
 * game menu); will be reused by `<ClubPage>` later (club icon →
 * club menu with "Exit club," "Rename club," etc.).
 *
 * **Keyboard contract:**
 *
 *   - Trigger has focus: Enter / Space open the menu and focus
 *     the first enabled item. ArrowDown does the same (it's the
 *     conventional "I want to enter the menu" gesture).
 *   - Item has focus (menu open): ArrowDown / ArrowUp move to
 *     the next / previous enabled item (wrapping at ends, skipping
 *     disabled). Enter / Space activate. Esc closes the menu and
 *     returns focus to the trigger. Tab closes the menu and
 *     advances focus to the next page element.
 *
 * **Click outside** closes the menu. Mousedown rather than click
 * so the close fires before any potential downstream click handler.
 *
 * **Activation order**: an item's `onClick` runs AFTER `closeMenu()`,
 * so that any modal opened by the item picks up focus cleanly
 * (the trigger's focus restoration completes first, then the
 * modal mounts and steals focus on its own initiative).
 *
 * **Z-index** comes from the popover stylesheet — see Menu.module.css
 * for the chosen layer and the rationale (above 500-tier modals so
 * a menu click can open one; below the 10000-tier chat panel so
 * chat stays available for "what does this option do?" Q&A).
 */
export const Menu = forwardRef<MenuHandle, Props>(function Menu({
  trigger,
  sections,
  triggerLabel = 'Menu',
  triggerClassName,
  popoverAlign = 'left',
}, ref) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  // Stable id tying the trigger's aria-controls to the popover's
  // id. Screen readers use this association to announce "expanded,
  // controls menu" + jump to the popover on demand. The popover
  // exists only when `open`, but the id reference stays valid —
  // AT implementations tolerate a missing target while the
  // popover is collapsed.
  const popoverId = useId()
  // Map of flat-index → rendered item element. Used so the
  // keyboard handler can call .focus() on whichever item should
  // receive focus next. The Map (rather than an array) is so a
  // ref callback's `el === null` cleanly removes a stale entry
  // without leaving an undefined slot.
  const itemRefsRef = useRef<Map<number, HTMLButtonElement>>(new Map())

  // Flat list of every item across all sections — used for
  // keyboard navigation (which doesn't care about section
  // structure, just enabled/disabled order). Includes disabled
  // items so the flat-index ↔ rendered-button mapping stays
  // stable across renders; arrow nav skips them via
  // findNextEnabled.
  const flatItems = sections.flatMap((s) => s.items)

  const closeMenu = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  const openMenu = useCallback(() => {
    const firstEnabled = flatItems.findIndex((it) => !it.disabled)
    setFocusedIndex(Math.max(0, firstEnabled))
    setOpen(true)
  }, [flatItems])

  // Let an app-level shortcut open the menu (the "?" key). Only `open`
  // is exposed — closing stays owned by the menu (Esc, click-outside,
  // item activation), matching how a user dismisses it.
  useImperativeHandle(ref, () => ({ open: openMenu }), [openMenu])

  function activate(item: MenuItem) {
    if (item.disabled) return
    closeMenu()
    item.onClick()
  }

  // Focus the currently-focused item whenever it changes (or the
  // menu opens). Runs after render so the item button exists in
  // the DOM by the time we call .focus().
  useEffect(function focusMenuItem() {
    if (!open) return
    itemRefsRef.current.get(focusedIndex)?.focus()
  }, [open, focusedIndex])

  // Mousedown-anywhere-outside closes the menu. Mousedown (not
  // click) so the close fires before any item-click handler
  // would; clicks inside the popover are gated by the contains()
  // check.
  useEffect(function closeOnOutsideClick() {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function onPopoverKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
      return
    }
    if (e.key === 'Tab') {
      // Tab while open: close the menu, let focus advance
      // normally to the next page element. (No preventDefault.)
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((curr) => findNextEnabled(curr, 1, flatItems))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((curr) => findNextEnabled(curr, -1, flatItems))
      return
    }
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    // ArrowDown on the trigger is the conventional "step into the
    // menu" gesture. Enter and Space already fire the button's
    // click handler (browser default), so they don't need their
    // own case here — the toggle in onClick handles open/close.
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      openMenu()
    }
  }

  // Build the dropdown's children list. We walk sections in order,
  // skip empty ones, insert a divider before each non-first
  // section, and track a flat index per rendered item so each item
  // can register itself in `itemRefsRef` and so keyboard nav can
  // address it directly.
  const renderedItems: ReactNode[] = []
  let flatIdx = 0
  sections.forEach((section, sectionIdx) => {
    if (section.items.length === 0) return
    if (renderedItems.length > 0) {
      renderedItems.push(
        <div
          key={`sep-${sectionIdx}`}
          className={styles.divider}
          role="separator"
        />,
      )
    }
    section.items.forEach((item) => {
      const idx = flatIdx
      flatIdx += 1
      renderedItems.push(
        <button
          key={item.id}
          type="button"
          ref={(el) => {
            if (el) itemRefsRef.current.set(idx, el)
            else itemRefsRef.current.delete(idx)
          }}
          className={cls(styles.item, item.disabled && styles.itemDisabled)}
          role="menuitem"
          aria-disabled={item.disabled || undefined}
          disabled={item.disabled}
          // tabIndex -1 because the popover's keyboard handler
          // owns navigation; only one item is focusable at a time
          // (via programmatic .focus()), and Tab from any item
          // closes the menu.
          tabIndex={-1}
          onClick={() => activate(item)}
        >
          {item.label}
        </button>,
      )
    })
  })

  return (
    <div className={styles.menu}>
      <button
        type="button"
        ref={triggerRef}
        className={cls(styles.trigger, triggerClassName)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={triggerLabel}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={popoverRef}
          id={popoverId}
          className={cls(
            styles.popover,
            popoverAlign === 'right' && styles.popoverRight,
          )}
          role="menu"
          aria-label={triggerLabel}
          onKeyDown={onPopoverKeyDown}
        >
          {renderedItems}
        </div>
      )}
    </div>
  )
})

/** Find the next enabled item in `direction` (1 = forward,
 *  -1 = backward), wrapping at the ends. Returns `current` if
 *  every item is disabled (so focus doesn't crash). */
function findNextEnabled(
  current: number,
  direction: 1 | -1,
  items: MenuItem[],
): number {
  const n = items.length
  if (n === 0) return 0
  for (let i = 1; i <= n; i++) {
    // The %-then-+n-then-% pattern handles negative dividends
    // cleanly (JS % can return negatives).
    const next = (((current + direction * i) % n) + n) % n
    if (!items[next].disabled) return next
  }
  return current
}
