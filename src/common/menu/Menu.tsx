// cs-blessed-menu

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import { useIsMobile } from '../mobile/useIsMobile'
import { makeVisibleSections, type MenuRow, type MenuSection } from './menuModel'
import { makeNavRows, type NavRow } from './menuNav'
import { useMenuKeys } from './useMenuKeys'
import { useCloseOnOutsideMousedown } from './useCloseOnOutsideMousedown'
import { MenuTrigger } from './MenuTrigger'
import { MenuRowButton } from './MenuRowButton'
import { MenuSectionHeader } from './MenuSectionHeader'
import styles from './Menu.module.css'

/** The open submenu, plus where its parent row sat when it opened (desktop
 *  flyouts are `position: fixed`, so they need viewport coordinates). */
type OpenSubmenu = {
  // WHICH row is open, not the row itself: rows are re-read every render, so
  // holding one would be holding a snapshot of what it said when it opened.
  parentId: string
  // Index of the parent row in the top-level list, so closing the submenu can
  // put focus back where it came from.
  parentIndex: number
  // Where the parent row sat at open time — the flyout's top, and the edge it
  // hangs off. Desktop only.
  anchor: { top: number; right: number }
}

/** What `ref` reaches: a way to open the menu from outside, for the `?` key.
 *  `PageHeaderMenu` registers it in `pageMenuStore`, and `act-open-menu` calls
 *  it. Closing stays the menu's own. */
export type MenuHandle = { open: () => void }

type Props = {
  // The identity element the menu hangs off — an app or game logo. Menu wraps
  // it in the trigger and adds the down-chevron.
  logo: ReactNode
  // The sections, in order. Empty sections drop out; dividers appear between
  // the ones that remain, none leading or trailing.
  sections: MenuSection[]
  // The trigger's accessible name: "Game menu", "Club menu".
  triggerLabel?: string
  // Whether closing returns focus to the trigger (default) or lets it fall to
  // the page. The game page passes `false` — common/menu/doc.md says why.
  returnFocusOnClose?: boolean
  ref?: Ref<MenuHandle>
}

/**
 * The dropdown menu behind every page header's logo — a trigger and a popover
 * of grouped rows, with the keyboard contract in common/menu/doc.md. Reach for
 * it through `<PageHeaderMenu>`, which is its only renderer; hand it sections
 * of actions (`MenuSection`, in `menuModel.ts`) and it draws them.
 *
 * A row may open a submenu (`MenuSubmenu`): a flyout beside the row on
 * desktop, a drill-down that replaces the list on mobile — doc.md → Intro to
 * area.
 *
 * A mousedown outside closes it, and a row's action runs after the menu closes,
 * so a modal the row opens takes focus cleanly. Its stacking rung is
 * `--z-menu`; `base.css` says why it has one.
 */
export function Menu({
  logo,
  sections,
  triggerLabel = 'Menu',
  returnFocusOnClose = true,
  ref,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  // ONE piece of state serves both presentations — doc.md → Intro to area.
  const [submenu, setSubmenu] = useState<OpenSubmenu | null>(null)
  // Read here rather than in CSS because the two presentations differ in what
  // is RENDERED: the drill-down replaces the list.
  const isMobile = useIsMobile()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  // Ties the trigger's `aria-controls` to the popover.
  const popoverId = useId()
  // The keyboard's rows' buttons, by their index in `navRows`, for focusing.
  const rowButtonsRef = useRef<Map<number, HTMLButtonElement>>(new Map())

  const visibleSections = makeVisibleSections(sections)
  // Every top-level row in order, disabled ones included, so an index means the
  // same row from render to render.
  const flatRows = visibleSections.flatMap((s) => s.rows)
  // The open submenu's parent row, as it reads NOW. An action that went hidden
  // while open reads as closed.
  const openSubmenuParent = submenu
    ? flatRows.find((r) => r.id === submenu.parentId) ?? null
    : null
  const navRows = makeNavRows(flatRows, openSubmenuParent, isMobile)
  const isDrilledDown = isMobile && openSubmenuParent !== null

  function openMenu() {
    const firstEnabled = flatRows.findIndex((r) => !r.disabled)
    setFocusedIndex(Math.max(0, firstEnabled))
    setIsOpen(true)
  }

  // Close and put focus back on the trigger — or, when the caller opted out
  // (`returnFocusOnClose`), let it fall to the page. Every open starts at the
  // top level, so the submenu goes too.
  const closeAndRefocus = useCallback(() => {
    setIsOpen(false)
    setSubmenu(null)
    if (returnFocusOnClose) triggerRef.current?.focus()
    else triggerRef.current?.blur()
  }, [returnFocusOnClose])

  // Close without touching focus, for the ways out where it has already gone
  // elsewhere: Tab, a click outside.
  const closeLeavingFocus = useCallback(() => {
    setIsOpen(false)
    setSubmenu(null)
  }, [])

  // No dependency list: `openMenu` reads this render's rows, and nothing holds
  // the handle's identity (`pageMenuStore` is a slot, not a subscription).
  useImperativeHandle(ref, () => ({ open: openMenu }))

  /** Open a submenu from the row at `index`. The parent row's place is taken
   *  for the desktop flyout; `from` is the clicked row, passed in because,
   *  switching straight from one flyout to another, the button under `index`
   *  is the flyout's, not the parent row's. */
  function openSubmenu(parent: MenuRow, index: number, from?: HTMLElement) {
    // The row was just clicked or is under the keyboard, so its button exists.
    const rect = (from ?? rowButtonsRef.current.get(index))!.getBoundingClientRect()
    setSubmenu({
      parentId: parent.id,
      parentIndex: index,
      anchor: { top: rect.top, right: rect.right },
    })
    // The first enabled child; on mobile the Back row is index 0.
    const offset = isMobile ? 1 : 0
    const firstEnabled = (parent.children ?? []).findIndex((it) => !it.disabled)
    setFocusedIndex(firstEnabled < 0 ? 0 : firstEnabled + offset)
  }

  function closeSubmenu() {
    if (submenu) setFocusedIndex(submenu.parentIndex)
    setSubmenu(null)
  }

  /** A submenu parent opens; Back steps out; anything else closes the menu,
   *  then runs. */
  function activateRow(row: NavRow, index: number, from: HTMLElement) {
    if (row.kind === 'back') {
      closeSubmenu()
      return
    }
    if (row.row.disabled) return
    if (row.row.children) {
      openSubmenu(row.row, index, from)
      return
    }
    closeAndRefocus()
    row.row.run()
  }

  useEffect(function focusMenuRow() {
    if (!isOpen) return
    rowButtonsRef.current.get(focusedIndex)?.focus()
  }, [isOpen, focusedIndex])

  useCloseOnOutsideMousedown({ isOpen, triggerRef, popoverRef, onClose: closeLeavingFocus })

  const keys = useMenuKeys({
    isOpen,
    isSubmenuOpen: submenu !== null,
    navRows,
    focusedIndex,
    setFocusedIndex,
    openMenu,
    openSubmenu,
    closeSubmenu,
    closeAndRefocus,
    closeLeavingFocus,
  })

  /**
   * One row's button. `index` is the row's place in its own list. A row the
   * keyboard isn't walking — the parent list behind an open desktop flyout —
   * registers no button, so `rowButtonsRef` only ever holds the walked list.
   */
  function renderRow(row: NavRow, index: number, isNavigable: boolean) {
    const key = row.kind === 'back' ? '__back' : row.row.id
    const isOpenParent = row.kind === 'item' && submenu?.parentId === row.row.id
    function registerButton(button: HTMLButtonElement | null) {
      if (button) rowButtonsRef.current.set(index, button)
      else rowButtonsRef.current.delete(index)
    }
    return (
      <MenuRowButton
        key={key}
        row={row}
        isOpenParent={isOpenParent}
        backLabel={openSubmenuParent?.label ?? 'Back'}
        registerButton={isNavigable ? registerButton : undefined}
        onActivate={(button) => activateRow(row, index, button)}
      />
    )
  }

  /** The sections as the popover lists them: a divider before every section
   *  but the first, a section's header above its rows. */
  function renderSections(): ReactNode[] {
    const rendered: ReactNode[] = []
    let rowIndex = 0
    visibleSections.forEach((section, sectionIndex) => {
      if (section.rows.length === 0 && !section.header) return
      if (rendered.length > 0) {
        rendered.push(<div key={`sep-${sectionIndex}`} className={styles.divider} role="separator" />)
      }
      if (section.header) {
        rendered.push(<MenuSectionHeader key={`hdr-${sectionIndex}`} header={section.header} />)
      }
      for (const row of section.rows) {
        rendered.push(renderRow({ kind: 'item', row }, rowIndex, openSubmenuParent === null))
        rowIndex += 1
      }
    })
    return rendered
  }

  // The open submenu's rows: in the popover in place of the sections on mobile,
  // in the flyout beside them on desktop.
  const submenuRows = openSubmenuParent ? navRows.map((row, i) => renderRow(row, i, true)) : null

  return (
    <div className={styles.menu}>
      <MenuTrigger
        ref={triggerRef}
        logo={logo}
        isOpen={isOpen}
        popoverId={popoverId}
        label={triggerLabel}
        onClick={() => (isOpen ? closeAndRefocus() : openMenu())}
        onKeyDown={keys.onTriggerKeyDown}
      />
      {isOpen && (
        <div
          ref={popoverRef}
          id={popoverId}
          className={styles.popover}
          role="menu"
          aria-label={isDrilledDown ? openSubmenuParent.label : triggerLabel}
          onKeyDown={keys.onPopoverKeyDown}
          // Scrolling the list would strand a fixed-position flyout, so the
          // flyout closes instead.
          onScroll={openSubmenuParent && !isDrilledDown ? () => closeSubmenu() : undefined}
        >
          {isDrilledDown ? submenuRows : renderSections()}
          {/* `position: fixed` — Menu.module.css's `.flyout` says why. */}
          {openSubmenuParent && submenu && !isDrilledDown && (
            <div
              className={styles.flyout}
              role="menu"
              aria-label={openSubmenuParent.label}
              style={{ top: submenu.anchor.top, left: submenu.anchor.right }}
            >
              {submenuRows}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
