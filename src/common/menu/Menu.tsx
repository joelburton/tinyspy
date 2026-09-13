// cs-blessed-menu

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
import { cls } from '../utils/cls'
import { Dot } from '../members/Dot'
import { menuRow, type MenuHeader, type MenuRow, type MenuSection } from './menuModel'
import { useIsMobile } from '../mobile/useIsMobile'
import { IconMenuChevron, IconSubmenu } from '../icons/icons'
import styles from './Menu.module.css'

/**
 * One row the arrow keys can land on. Almost always a real `MenuItem`; the
 * exception is the mobile drill-down's "‹ Back" row, which is navigable and
 * activatable but isn't a menu item the caller supplied. Back is a row rather
 * than a special case so there is exactly ONE list of rows with focus in it,
 * mobile or desktop — doc.md → Intro to area.
 */
type NavRow =
  | { kind: 'back' }
  | { kind: 'item'; row: MenuRow }

/** The open submenu, plus where its parent row sat when it opened (desktop
 *  flyouts are `position: fixed`, so they need viewport coordinates). */
type OpenSubmenu = {
  // WHICH row is open, not the row itself: rows are re-read every render, so
  // holding one would be holding a snapshot of what it said when it opened.
  parentId: string
  // Flat index of the parent row in the TOP-LEVEL list, so closing the submenu
  // can put focus back where it came from.
  parentIndex: number
  // Where the parent row sat at open time — the flyout's top, and the edge it
  // hangs off. Desktop only.
  anchor: { top: number; right: number }
}

/** Imperative handle exposed via `ref` so the `?` key can open the menu without
 *  owning its internal open state: `PageHeaderMenu` registers it in
 *  `pageMenuStore`, and `act-open-menu` calls it. */
export type MenuHandle = { open: () => void }

type Props = {
  // The identity element the menu hangs off — an app or game logo. Menu wraps
  // it in a `<button>` and snugs the down-chevron against its right; the
  // chevron is the "this opens a menu" affordance and is not optional, which is
  // the point of taking the logo rather than a whole trigger.
  logo: ReactNode
  // The sections, in order. Empty sections drop out; dividers appear between
  // the ones that remain, none leading or trailing.
  sections: MenuSection[]
  // The trigger's accessible name. Default "Menu"; "Game menu", "Club menu" in
  // context.
  triggerLabel?: string
  // Whether closing returns focus to the trigger (default) or lets it fall to
  // the page. The game page passes `false` — docs/ui.md → GamePage menu →
  // Focus says why.
  returnFocusOnClose?: boolean
}

/**
 * The dropdown menu behind every page header's logo — a trigger and a
 * popover of grouped rows, with the keyboard contract in
 * docs/keyboard-shortcuts.md → Menus, dialogs, and panels. Reach for it
 * through `<PageHeaderMenu>`, which is its only renderer; hand it sections of
 * bound actions (`MenuSection`, next door in `menuModel.ts`) and it draws them.
 *
 * A row may open a submenu (`MenuSubmenu`): a flyout beside the row on
 * desktop, a drill-down that replaces the list on mobile — doc.md → Intro to area.
 *
 * **Click outside** closes the menu, on mousedown so the close fires before
 * any click handler underneath.
 *
 * **Activation order**: a row's action runs AFTER `closeMenu()`, so a modal
 * the row opens takes focus cleanly once the trigger has it back.
 *
 * **Stacking** is `--z-menu`, read by the stylesheet; `base.css` says why the
 * menu is a rung of its own.
 */
export const Menu = forwardRef<MenuHandle, Props>(function Menu({
  logo,
  sections,
  triggerLabel = 'Menu',
  returnFocusOnClose = true,
}, ref) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  // The open submenu, or null. ONE piece of state serves both presentations —
  // doc.md → Intro to area.
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

  // What each section DRAWS, asked once per render. A bound action answers for
  // itself here — its words, its key, whether it applies — and a row that says
  // it is hidden drops out before anything counts rows, so what is left is what
  // is on screen.
  const drawn: Array<{ header?: MenuHeader; rows: MenuRow[] }> = sections.map((s) => ({
    header: s.header,
    rows: s.items.map(menuRow).filter((row) => !row.hidden),
  }))

  // Flat list of every row across all sections — used for
  // keyboard navigation (which doesn't care about section
  // structure, just enabled/disabled order). Includes disabled
  // rows so the flat-index ↔ rendered-button mapping stays
  // stable across renders; arrow nav skips them via
  // findNextEnabled.
  const flatRows = drawn.flatMap((s) => s.rows)

  // The open submenu's parent row, as it reads NOW. Gone (an action that went
  // hidden while it was open) reads as closed.
  const openParent = submenu ? flatRows.find((r) => r.id === submenu.parentId) ?? null : null

  // The rows the KEYBOARD is currently walking — the single list that owns
  // focus. In BOTH presentations an open submenu takes over navigation
  // entirely, so the only difference is the "‹ Back" row, which exists solely
  // in the drill-down, where the parent list is gone. On desktop the parent
  // list stays visible behind the flyout but is not navigable, as in every
  // desktop menu.
  const navRows: NavRow[] = openParent
    ? [
      ...(isMobile ? [{ kind: 'back' } as const] : []),
      ...(openParent.children ?? []).map((row) => ({ kind: 'item' as const, row })),
    ]
    : flatRows.map((row) => ({ kind: 'item' as const, row }))

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
    // Restore focus to the trigger, unless the caller wants it to fall to the
    // page instead (`Props.returnFocusOnClose`). `blur()` also covers the
    // click-to-toggle-close case, where the mousedown had just focused the
    // trigger.
    if (returnFocusOnClose) triggerRef.current?.focus()
    else triggerRef.current?.blur()
  }, [returnFocusOnClose])

  function openMenu() {
    const firstEnabled = flatRows.findIndex((r) => !r.disabled)
    setFocusedIndex(Math.max(0, firstEnabled))
    setOpen(true)
  }

  // Let an app-level shortcut open the menu (the "?" key). Only `open`
  // is exposed — closing stays owned by the menu (Esc, click-outside,
  // item activation), matching how a user dismisses it.
  //
  // No dependency list: `openMenu` reads `flatRows`, which is rebuilt from
  // `sections` every render, so a memo here could only ever hand back a new
  // handle while claiming otherwise. Nothing reads the handle's identity —
  // `PageHeaderMenu` registers a closure over its ref ONCE and `pageMenuStore`
  // is a slot, not a subscription — so the honest version is also the free one.
  useImperativeHandle(ref, () => ({ open: openMenu }))

  /**
   * Open a submenu from the row at `index` in the CURRENT list. Captures the
   * parent row's viewport rect for the desktop flyout, which is
   * `position: fixed` — see the flyout's own comment for why it can't simply be
   * absolutely positioned inside the popover.
   */
  const openSubmenu = useCallback((parent: MenuRow, index: number, from?: HTMLElement) => {
    // The anchor element is passed in from a click (`e.currentTarget`) rather
    // than looked up, because switching straight from one open flyout to
    // another would find the FLYOUT's button under that index, not the parent
    // row's — the ref map is keyed by nav index, and the flyout owns that space
    // while it's open.
    const el = from ?? itemRefsRef.current.get(index)
    const r = el?.getBoundingClientRect()
    setSubmenu({
      parentId: parent.id,
      parentIndex: index,
      anchor: { top: r?.top ?? 0, right: r?.right ?? 0 },
    })
    // Focus the submenu's first enabled row. On mobile the Back row occupies
    // index 0, so the first real item is 1.
    const offset = isMobile ? 1 : 0
    const firstEnabled = (parent.children ?? []).findIndex((it) => !it.disabled)
    setFocusedIndex(firstEnabled < 0 ? 0 : firstEnabled + offset)
  }, [isMobile])

  /** What a row does when clicked or Enter'd. A submenu parent opens; a Back
   *  row steps out; anything else runs its action and closes the menu. */
  function activateRow(row: NavRow, index: number, from?: HTMLElement) {
    if (row.kind === 'back') {
      closeSubmenu()
      return
    }
    if (row.row.disabled) return
    if (row.row.children) {
      openSubmenu(row.row, index, from ?? itemRefsRef.current.get(index))
      return
    }
    closeMenu()
    row.row.run()
  }

  // Focus the currently-focused item whenever it changes (or the
  // menu opens). Runs after render so the item button exists in
  // the DOM by the time we call .focus().
  useEffect(function focusMenuItem() {
    if (!open) return
    itemRefsRef.current.get(focusedIndex)?.focus()
  }, [open, focusedIndex])

  // Close WITHOUT touching focus — for the ways out where focus has already
  // gone somewhere else (Tab, a click elsewhere). `closeMenu` is for the ways
  // out that leave focus with the menu. Both clear the submenu: a menu that
  // reopens still drilled in would be a stale surprise.
  const dismiss = useCallback(() => {
    setOpen(false)
    setSubmenu(null)
  }, [])

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
      dismiss()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, dismiss])

  function onPopoverKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // While the menu is open it OWNS the keyboard: nothing here may also reach
    // a `window` keydown handler, or arrowing through the menu doubles as a
    // board move.
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
      // Tab while open closes the menu AND is consumed: the popover stops its
      // own keys, so the surface's tab ring never hears this press and a native
      // Tab would walk off into the browser's chrome. The NEXT press is the
      // ring's, from wherever the close left focus.
      e.preventDefault()
      dismiss()
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
      if (row?.kind === 'item' && row.row.children && !row.row.disabled) {
        e.preventDefault()
        openSubmenu(row.row, focusedIndex)
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
    // While the trigger has focus it owns its keys, for the same reason the
    // popover does: a press that opens the menu must not also reach a board.
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
   * `index` is the row's position in its own list, and every row has one —
   * including the parent list behind an open desktop flyout, which is what a
   * click on a second submenu parent records as the row to return focus to.
   *
   * `navigable` is separate, and false for exactly that case: while a flyout
   * is open IT owns the keyboard, so the rows behind it register no ref. That
   * keeps the ref map a clean 1:1 with `navRows`, so the focus effect can't
   * land on a button in the wrong list. Position and navigability are two
   * facts about a row, not one.
   */
  function renderRow(row: NavRow, index: number, navigable: boolean, key: string): ReactNode {
    const isBack = row.kind === 'back'
    const item = row.kind === 'item' ? row.row : null
    const parent = item?.children ? item : null
    const disabled = item?.disabled ?? false
    return (
      <button
        key={key}
        type="button"
        ref={(el) => {
          if (!navigable) return
          if (el) itemRefsRef.current.set(index, el)
          else itemRefsRef.current.delete(index)
        }}
        className={cls(
          styles.item,
          isBack && styles.itemBack,
          // The parent row of an open flyout stays lit, so it's obvious which
          // row the floating panel belongs to.
          parent && submenu?.parentId === parent.id && styles.itemOpen,
        )}
        role="menuitem"
        // WHICH action this row is, in the DOM — the twin of the attribute
        // `<ActionButton>` writes, and for the same reason: what a row is
        // CALLED is `describe()`'s to vary per game and per state, so a test or
        // a stylesheet that wants THIS command should not be asking about its
        // words. A submenu parent gets none: its id names a grouping, not a
        // command, and `children` is what tells the two apart.
        data-action={item && item.children === null ? item.id : undefined}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        // A submenu parent is a disclosure, so it advertises itself as one.
        aria-haspopup={parent ? 'menu' : undefined}
        aria-expanded={parent ? submenu?.parentId === parent.id : undefined}
        onClick={(e) => activateRow(row, index, e.currentTarget)}
      >
        {/* ONE leading slot, shared by the two things that can sit before a
            label: the identity disc (who) and the action's glyph (what). No row
            carries both — an account row names a person, an action names a
            deed — so they take turns rather than stacking, which is what keeps
            every label in the same column. Reserved on EVERY row, empty or not,
            so a leading mark has exactly one place it can be. Not rendered on
            the drill-down's Back row: that row names where you're going, not a
            person or an action. */}
        {!isBack && (
          <span className={styles.itemIconSlot} aria-hidden>
            {item?.dot ? (
              <Dot color={item.dot} />
            ) : item?.icon ? (
              <item.icon size="1em" />
            ) : null}
          </span>
        )}
        {/* A plain wrapper: the row is a flex line and `.itemShortcut` pushes
            itself right with `margin-left: auto`, so the label needs no class of
            its own. */}
        <span>
          {isBack ? `‹ ${openParent?.label ?? 'Back'}` : item?.label}
        </span>
        {item?.shortcut && <span className={styles.itemShortcut}>{item.shortcut}</span>}
        {/* The affordance that says "there's more behind this row". Purely
            decorative — the label and aria-haspopup carry the meaning. `1em`
            like every other mark in the row: the marks are sized by the label
            they sit beside, so changing the menu's type moves all of them. */}
        {parent && (
          <span className={styles.itemChevron} aria-hidden>
            <IconSubmenu size="1em" />
          </span>
        )}
      </button>
    )
  }

  // The open submenu's rows, drawn once and placed by presentation: the
  // DRILL-DOWN (mobile) puts them IN the popover in place of the sections —
  // no dividers, since a submenu is one group by construction, and the Back
  // row is the only chrome it needs — and the FLYOUT (desktop) puts them in a
  // second panel beside the sections.
  const drilledDown = isMobile && openParent !== null
  const submenuRows = openParent
    ? navRows.map((row, i) => renderRow(row, i, true, row.kind === 'back' ? '__back' : row.row.id))
    : null

  return (
    <div className={styles.menu}>
      {renderTrigger()}
      {open && (
        <div
          ref={popoverRef}
          id={popoverId}
          className={styles.popover}
          role="menu"
          aria-label={drilledDown && openParent ? openParent.label : triggerLabel}
          onKeyDown={onPopoverKeyDown}
          // Scrolling the list would leave a fixed-position flyout stranded
          // beside empty space (crosswords' ~20-item menu really does scroll),
          // so the flyout closes rather than detaching. Cheaper and steadier
          // than re-measuring on every scroll frame.
          onScroll={openParent && !drilledDown ? () => closeSubmenu() : undefined}
        >
          {drilledDown ? submenuRows : renderSections()}
          {/* ── The FLYOUT (desktop): a second panel beside the parent row ──
              `position: fixed`, which is not a stylistic choice: `.popover` is
              `overflow-y: auto`, and per spec that computes overflow-x to
              `auto` too — so a flyout absolutely positioned inside the popover
              would be CLIPPED at its edge instead of overflowing. Fixed
              coordinates escape the scroll container entirely. */}
          {openParent && submenu && !drilledDown && (
            <div
              className={styles.flyout}
              role="menu"
              aria-label={openParent.label}
              style={{ top: submenu.anchor.top, left: submenu.anchor.right }}
            >
              {submenuRows}
            </div>
          )}
        </div>
      )}
    </div>
  )

  /**
   * The sections as the popover lists them: each non-empty section's rows,
   * a divider before every section but the first, a header block where a
   * section has one. Tracks a flat index per row so each can register itself
   * in `itemRefsRef` and keyboard nav can address it directly.
   */
  function renderSections(): ReactNode[] {
    const renderedItems: ReactNode[] = []
    let flatIdx = 0
    drawn.forEach((section, sectionIdx) => {
      if (section.rows.length === 0 && !section.header) return
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
      // menuitem — no keyboard-nav index, no ref registration; the popover's
      // arrow navigation walks only the real `.item` buttons.
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
      section.rows.forEach((row) => {
        const idx = flatIdx
        flatIdx += 1
        // While a desktop flyout is open IT owns navigation, so the rows behind
        // it register no ref — but they keep their index (see renderRow).
        renderedItems.push(renderRow({ kind: 'item', row }, idx, !openParent, row.id))
      })
    })
    return renderedItems
  }

  function renderTrigger() {
    return (
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={triggerLabel}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        {/* The gap is deliberately tiny — the chevron hugs the logo so the pair
            reads as ONE clickable unit rather than two marks. */}
        <span className={styles.triggerRow}>
          {logo}
          {/* 3, not the set's default 2: this is the smallest mark the menu
              draws (0.65em, sized to the header's type), and at that size a
              default-weight chevron thins out against the logo it sits beside
              instead of reading as a separate affordance. */}
          <IconMenuChevron className={styles.chevron} strokeWidth={3} aria-hidden />
        </span>
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
    if (row.kind === 'back' || !row.row.disabled) return next
  }
  return current
}
