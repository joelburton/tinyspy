// cs-unmet

import type { Dispatch, KeyboardEvent, SetStateAction } from 'react'
import { pressed } from '../keyboard/componentKeyGroups'
import type { MenuRow } from './menuModel'
import { findNextEnabled, type NavRow } from './menuNav'

type MenuKeysOptions = {
  isOpen: boolean
  isSubmenuOpen: boolean
  navRows: NavRow[]
  focusedIndex: number
  setFocusedIndex: Dispatch<SetStateAction<number>>
  openMenu: () => void
  openSubmenu: (parent: MenuRow, index: number) => void
  closeSubmenu: () => void
  closeAndRefocus: () => void
  closeLeavingFocus: () => void
}

/**
 * The menu's two key handlers, for the popover and for the trigger. Each stops
 * every key it sees: while the menu has focus it owns the keyboard, so arrowing
 * through it never doubles as a move on a board. The keys themselves are the
 * `keys-menu-*` groups (keyboard/componentKeyGroups.ts).
 */
export function useMenuKeys(menu: MenuKeysOptions) {
  function onPopoverKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (pressed('keys-menu-unwind', e)) {
      e.preventDefault()
      // One level at a time: out of a submenu first, then out of the menu.
      if (menu.isSubmenuOpen) menu.closeSubmenu()
      else menu.closeAndRefocus()
      return
    }
    if (pressed('keys-menu-leave', e)) {
      // Consumed, so the browser doesn't walk focus off into its chrome; the
      // next press is the surface's tab ring's.
      e.preventDefault()
      menu.closeLeavingFocus()
      return
    }
    if (pressed('keys-menu-walk-down', e)) {
      e.preventDefault()
      menu.setFocusedIndex((curr) => findNextEnabled(curr, 1, menu.navRows))
      return
    }
    if (pressed('keys-menu-walk-up', e)) {
      e.preventDefault()
      menu.setFocusedIndex((curr) => findNextEnabled(curr, -1, menu.navRows))
      return
    }
    if (pressed('keys-menu-in', e)) {
      const row = menu.navRows[menu.focusedIndex]
      if (row?.kind === 'item' && row.row.children && !row.row.disabled) {
        e.preventDefault()
        menu.openSubmenu(row.row, menu.focusedIndex)
      }
      return
    }
    if (pressed('keys-menu-out', e)) {
      if (menu.isSubmenuOpen) {
        e.preventDefault()
        menu.closeSubmenu()
      }
      return
    }
  }

  // Enter and Space already press the button; this is the "step into the menu"
  // key.
  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (pressed('keys-menu-open', e) && !menu.isOpen) {
      e.preventDefault()
      menu.openMenu()
    }
  }

  return { onPopoverKeyDown, onTriggerKeyDown }
}
