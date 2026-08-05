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
import { cls } from '../../lib/util/cls'
import { Dot } from '../text/Dot'
import { isSubmenu, type MenuItem, type MenuSection, type MenuSubmenu } from '../../lib/games'
import { useIsMobile } from '../../hooks/ui/useIsMobile'
import styles from './Menu.module.css'

/**
 * One row the arrow keys can land on. Almost always a real `MenuItem`; the
 * exception is the mobile drill-down's "‹ Back" row, which is navigable and
 * activatable but isn't a menu item the caller supplied.
 *
 * Modelling Back as a nav row (rather than special-casing it around the
 * keyboard code) is what keeps the flat-index model intact: there is still
 * exactly ONE list of rows on screen with focus in it, mobile or desktop.
 */
type NavRow =
  | { kind: 'back' }
  | { kind: 'item'; item: MenuItem }

/** The open submenu, plus where its parent row sat when it opened (desktop
 *  flyouts are `position: fixed`, so they need viewport coordinates). */
type OpenSubmenu = {
  parent: MenuSubmenu
  /** Flat index of the parent row in the TOP-LEVEL list, so closing the
   *  submenu can put focus back where it came from. */
  parentIndex: number
  /** The parent row's viewport rect at open time. Desktop only. */
  anchor: { top: number; left: number; right: number }
}

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
   *  side of the screen, so the popover doesn't overflow
   *  off-screen to the right. Also flips the side a submenu flies
   *  out toward, for the same reason. */
  popoverAlign?: 'left' | 'right'
  /** Whether closing the menu returns focus to the trigger button.
   *  Default `true` (standard menu a11y — Esc restores focus for
   *  Tab users). Set `false` where the trigger retaining focus
   *  fights a page-level keyboard handler: the crosswords game menu
   *  sits over a board that reads `window` keydowns for cursor
   *  movement, so a focused trigger would swallow arrows / reopen the
   *  menu. With `false` the trigger blurs on close and focus falls to
   *  `<body>`, so the board's keyboard resumes immediately. */
  returnFocusOnClose?: boolean
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
  returnFocusOnClose = true,
}, ref) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  // The open submenu, or null. ONE piece of state serves both presentations —
  // see the component docstring's "Submenus" section.
  const [submenu, setSubmenu] = useState<OpenSubmenu | null>(null)
  // Which presentation: flyout on desktop, drill-down on mobile. Read here
  // rather than in CSS because the two differ in what is RENDERED, not just how
  // it looks — the drill-down replaces the list, so the arrow keys walk a
  // different set of rows.
  const isMobile = useIsMobile()
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

  /**
   * The rows the KEYBOARD is currently walking — the single list that owns
   * focus. This is where the hybrid collapses to almost nothing: in BOTH
   * presentations an open submenu takes over navigation entirely, so the only
   * difference is the "‹ Back" row (which exists solely in the drill-down,
   * where the parent list is gone and there'd otherwise be no way back).
   *
   * On desktop the parent list stays *visible* behind the flyout but is not
   * navigable — matching every desktop menu, where arrows move inside the open
   * submenu and ArrowLeft/Escape steps back out.
   */
  const navRows: NavRow[] = submenu
    ? [
      ...(isMobile ? [{ kind: 'back' } as const] : []),
      ...submenu.parent.items.map((item) => ({ kind: 'item' as const, item })),
    ]
    : flatItems.map((item) => ({ kind: 'item' as const, item }))

  const closeSubmenu = useCallback((restoreFocusTo?: number) => {
    setSubmenu((cur) => {
      if (cur && restoreFocusTo === undefined) setFocusedIndex(cur.parentIndex)
      return null
    })
    if (restoreFocusTo !== undefined) setFocusedIndex(restoreFocusTo)
  }, [])

  const closeMenu = useCallback(() => {
    setOpen(false)
    // A menu that reopens still drilled into a submenu would be a stale
    // surprise — every open starts at the top level.
    setSubmenu(null)
    // Restore focus to the trigger (standard menu a11y), UNLESS the caller
    // opted out — then blur it so focus falls to <body> and a page-level
    // keyboard handler (the crosswords board) isn't shadowed by a focused
    // trigger. `blur()` also covers the click-to-toggle-close case, where the
    // mousedown had just focused the trigger.
    if (returnFocusOnClose) triggerRef.current?.focus()
    else triggerRef.current?.blur()
  }, [returnFocusOnClose])

  const openMenu = useCallback(() => {
    const firstEnabled = flatItems.findIndex((it) => !it.disabled)
    setFocusedIndex(Math.max(0, firstEnabled))
    setOpen(true)
  }, [flatItems])

  // Let an app-level shortcut open the menu (the "?" key). Only `open`
  // is exposed — closing stays owned by the menu (Esc, click-outside,
  // item activation), matching how a user dismisses it.
  useImperativeHandle(ref, () => ({ open: openMenu }), [openMenu])

  /**
   * Open a submenu from the row at `index` in the CURRENT list. Captures the
   * parent row's viewport rect for the desktop flyout, which is
   * `position: fixed` — see the flyout's own comment for why it can't simply be
   * absolutely positioned inside the popover.
   */
  const openSubmenu = useCallback((parent: MenuSubmenu, index: number, from?: HTMLElement) => {
    // The anchor element is passed in from a click (`e.currentTarget`) rather
    // than looked up, because switching straight from one open flyout to
    // another would find the FLYOUT's button under that index, not the parent
    // row's — the ref map is keyed by nav index, and the flyout owns that space
    // while it's open.
    const el = from ?? itemRefsRef.current.get(index)
    const r = el?.getBoundingClientRect()
    setSubmenu({
      parent,
      parentIndex: index,
      anchor: { top: r?.top ?? 0, left: r?.left ?? 0, right: r?.right ?? 0 },
    })
    // Focus the submenu's first enabled row. On mobile the Back row occupies
    // index 0, so the first real item is 1.
    const offset = isMobile ? 1 : 0
    const firstEnabled = parent.items.findIndex((it) => !it.disabled)
    setFocusedIndex(firstEnabled < 0 ? 0 : firstEnabled + offset)
  }, [isMobile])

  /** What a row does when clicked or Enter'd. A submenu parent opens; a Back
   *  row steps out; anything else runs its action and closes the menu. */
  function activateRow(row: NavRow, index: number, from?: HTMLElement) {
    if (row.kind === 'back') {
      closeSubmenu()
      return
    }
    const { item } = row
    if (item.disabled) return
    if (isSubmenu(item)) {
      openSubmenu(item, index, from ?? itemRefsRef.current.get(index))
      return
    }
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
    // While the menu is open it OWNS the keyboard — stop keys from also
    // reaching a page-level `window` keydown handler (e.g. the crosswords
    // board would otherwise move its cursor as you arrow through the menu).
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      // Escape unwinds ONE level at a time: out of a submenu first, and only
      // then out of the menu. Closing the whole thing from inside a submenu
      // would throw away the step the user just took.
      if (submenu) closeSubmenu()
      else closeMenu()
      return
    }
    if (e.key === 'Tab') {
      // Tab while open: close the menu, let focus advance
      // normally to the next page element. (No preventDefault.)
      setOpen(false)
      setSubmenu(null)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((curr) => findNextEnabled(curr, 1, navRows))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((curr) => findNextEnabled(curr, -1, navRows))
      return
    }
    // The horizontal pair is the desktop-menu convention, and it works in the
    // drill-down too (where it reads as "in" / "out" rather than left/right).
    if (e.key === 'ArrowRight') {
      const row = navRows[focusedIndex]
      if (row?.kind === 'item' && isSubmenu(row.item) && !row.item.disabled) {
        e.preventDefault()
        openSubmenu(row.item, focusedIndex)
      }
      return
    }
    if (e.key === 'ArrowLeft') {
      if (submenu) {
        e.preventDefault()
        closeSubmenu()
      }
      return
    }
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    // While the trigger has focus it owns its keys — don't let them fall
    // through to a page-level `window` keydown handler (the crosswords board
    // would otherwise open the rebus overlay on Enter, jump a clue on Tab, or
    // move the cursor on ArrowDown at the same time as opening the menu).
    e.stopPropagation()
    // ArrowDown on the trigger is the conventional "step into the
    // menu" gesture. Enter and Space already fire the button's
    // click handler (browser default), so they don't need their
    // own case here — the toggle in onClick handles open/close.
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      openMenu()
    }
  }

  /**
   * Render one row.
   *
   * `navIndex` is the row's position in `navRows` — or null when the row is on
   * screen but NOT keyboard-navigable, which happens to the parent list behind
   * an open desktop flyout. A non-navigable row registers no ref, so the ref
   * map stays a clean 1:1 with `navRows` and the focus effect can't land on a
   * button in the wrong list.
   */
  function renderRow(row: NavRow, navIndex: number | null, key: string): ReactNode {
    const isBack = row.kind === 'back'
    const item = row.kind === 'item' ? row.item : null
    const parent = item && isSubmenu(item) ? item : null
    const disabled = item?.disabled ?? false
    return (
      <button
        key={key}
        type="button"
        ref={(el) => {
          if (navIndex === null) return
          if (el) itemRefsRef.current.set(navIndex, el)
          else itemRefsRef.current.delete(navIndex)
        }}
        className={cls(
          styles.item,
          disabled && styles.itemDisabled,
          isBack && styles.itemBack,
          // The parent row of an open flyout stays lit, so it's obvious which
          // row the floating panel belongs to.
          parent && submenu?.parent.id === parent.id && styles.itemOpen,
        )}
        role="menuitem"
        aria-disabled={disabled || undefined}
        disabled={disabled}
        // A submenu parent is a disclosure, so it advertises itself as one.
        aria-haspopup={parent ? 'menu' : undefined}
        aria-expanded={parent ? submenu?.parent.id === parent.id : undefined}
        // tabIndex -1 because the popover's keyboard handler
        // owns navigation; only one item is focusable at a time
        // (via programmatic .focus()), and Tab from any item
        // closes the menu.
        tabIndex={-1}
        onClick={(e) => activateRow(row, navIndex ?? 0, e.currentTarget)}
      >
        {/* The identity disc, when the item carries one — before the label, the
            way every other "who" surface in the app draws it. Not rendered on
            the drill-down's Back row: that row names where you're going, not a
            person. */}
        {!isBack && item?.dot && <Dot color={item.dot} className={styles.itemDot} />}
        <span className={styles.itemLabel}>
          {isBack ? `‹ ${submenu?.parent.label ?? 'Back'}` : item?.label}
        </span>
        {item?.shortcut && <span className={styles.itemShortcut}>{item.shortcut}</span>}
        {/* The affordance that says "there's more behind this row". Purely
            decorative — the label and aria-haspopup carry the meaning. */}
        {parent && <span className={styles.itemChevron} aria-hidden>›</span>}
      </button>
    )
  }

  // ── The DRILL-DOWN (mobile): the submenu REPLACES the list ──
  // No sections and no dividers — a submenu is one group by construction, and
  // the Back row is the only chrome it needs.
  if (isMobile && submenu) {
    const drilledRows = navRows.map((row, i) =>
      renderRow(row, i, row.kind === 'back' ? '__back' : row.item.id),
    )
    return (
      <div className={styles.menu}>
        {renderTrigger()}
        <div
          ref={popoverRef}
          id={popoverId}
          className={cls(styles.popover, popoverAlign === 'right' && styles.popoverRight)}
          role="menu"
          aria-label={submenu.parent.label}
          onKeyDown={onPopoverKeyDown}
        >
          {drilledRows}
        </div>
      </div>
    )
  }

  // Build the dropdown's children list. We walk sections in order,
  // skip empty ones, insert a divider before each non-first
  // section, and track a flat index per rendered item so each item
  // can register itself in `itemRefsRef` and so keyboard nav can
  // address it directly.
  const renderedItems: ReactNode[] = []
  let flatIdx = 0
  sections.forEach((section, sectionIdx) => {
    if (section.items.length === 0 && !section.header) return
    if (renderedItems.length > 0) {
      renderedItems.push(
        <div
          key={`sep-${sectionIdx}`}
          className={styles.divider}
          role="separator"
        />,
      )
    }
    // A non-clickable info header (crosswords puzzle title + credits). Not a
    // menuitem — no keyboard-nav index, no ref registration; the popover's arrow
    // navigation walks only the real `.item` buttons.
    if (section.header) {
      renderedItems.push(
        <div key={`hdr-${sectionIdx}`} className={styles.header} role="presentation">
          <div className={styles.headerTitle}>{section.header.title}</div>
          {(section.header.lines ?? []).map((line, i) => (
            <div key={i} className={styles.headerLine}>
              {line}
            </div>
          ))}
        </div>,
      )
    }
    section.items.forEach((item) => {
      const idx = flatIdx
      flatIdx += 1
      // While a desktop flyout is open IT owns navigation, so the rows behind it
      // pass `null` and register no ref (see renderRow).
      renderedItems.push(renderRow({ kind: 'item', item }, submenu ? null : idx, item.id))
    })
  })

  return (
    <div className={styles.menu}>
      {renderTrigger()}
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
          // Scrolling the list would leave a fixed-position flyout stranded
          // beside empty space (crosswords' ~20-item menu really does scroll),
          // so the flyout closes rather than detaching. Cheaper and steadier
          // than re-measuring on every scroll frame.
          onScroll={submenu ? () => closeSubmenu() : undefined}
        >
          {renderedItems}
          {/* ── The FLYOUT (desktop): a second panel beside the parent row ──
              `position: fixed`, which is not a stylistic choice: `.popover` is
              `overflow-y: auto`, and per spec that computes overflow-x to
              `auto` too — so a flyout absolutely positioned inside the popover
              would be CLIPPED at its edge instead of overflowing. Fixed
              coordinates escape the scroll container entirely. It sits on the
              side the parent menu opens toward, so a right-aligned menu (one
              anchored at the screen's right edge) flies out leftward and can't
              run off-screen. */}
          {submenu && (
            <div
              className={cls(styles.flyout, popoverAlign === 'right' && styles.flyoutLeft)}
              role="menu"
              aria-label={submenu.parent.label}
              style={{
                top: submenu.anchor.top,
                ...(popoverAlign === 'right'
                  ? { right: window.innerWidth - submenu.anchor.left }
                  : { left: submenu.anchor.right }),
              }}
            >
              {navRows.map((row, i) =>
                renderRow(row, i, row.kind === 'back' ? '__back' : row.item.id),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )

  function renderTrigger() {
    return (
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
    )
  }
})

/** Find the next enabled item in `direction` (1 = forward,
 *  -1 = backward), wrapping at the ends. Returns `current` if
 *  every item is disabled (so focus doesn't crash). */
function findNextEnabled(
  current: number,
  direction: 1 | -1,
  rows: NavRow[],
): number {
  const n = rows.length
  if (n === 0) return 0
  for (let i = 1; i <= n; i++) {
    // The %-then-+n-then-% pattern handles negative dividends
    // cleanly (JS % can return negatives).
    const next = (((current + direction * i) % n) + n) % n
    const row = rows[next]
    // The Back row is always enabled — it's the only way out of a drill-down.
    if (row.kind === 'back' || !row.item.disabled) return next
  }
  return current
}
