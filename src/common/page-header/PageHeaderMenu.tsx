// cs-unmet

import { useEffect, useRef, type ReactNode } from 'react'
import { Menu, type MenuHandle } from '../menu/Menu'
import { registerPageMenu } from '../menu/pageMenuStore'
import type { MenuSection } from '../menu/menuModel'

type Props = {
  /** The identity element the menu hangs off — the app logo on home and the
   *  club page, the gametype's logo on a game. Menu adds the chevron. */
  logo: ReactNode
  /** The menu's contents. Home passes one account section; a game's PlayArea
   *  pushes the whole thing through `ctx.menu.setGameSections`. */
  sections: MenuSection[]
  /** Names the trigger — "Main menu", "Club menu", "Game menu". */
  label: string
  /** Let focus fall back to the page instead of returning to the trigger on
   *  close. GamePage's only, and for a documented reason: the game menu sits
   *  over boards that read window keydowns for play (crosswords' cursor), and a
   *  focused trigger would swallow those keys or reopen the menu. */
  returnFocusOnClose?: boolean
}

/**
 * **The page's menu** — the first mark in every `<PageHeader>`, on all three
 * real pages.
 *
 * It exists so the two things every page's menu needs are not a decision each
 * page makes:
 *
 * - **The chevron-wrapped logo.** `<Menu>` takes a `logo` and supplies the
 *   chevron, so a caller cannot forget it.
 * - **The `?` wiring.** The `MenuHandle` ref lives here and registers itself in
 *   `pageMenuStore`, which is where `act-open-menu` (bound in
 *   `AppActionsHost`) finds the menu to open.
 *
 * NOT folded into `<PageHeader>` itself, which takes children: the club page
 * and a game put their own marks beside this one, and a game fills the header's
 * `right` slot as well.
 */
export function PageHeaderMenu({ logo, sections, label, returnFocusOnClose }: Props) {
  const ref = useRef<MenuHandle>(null)

  // Claim the `?` slot for as long as this menu is mounted. The release runs on
  // unmount, so a page that drops its menu (GamePage does, while paused) leaves
  // the shortcut with nothing to open rather than a stale handle.
  useEffect(() => registerPageMenu(() => ref.current?.open()), [])

  return (
    <Menu
      ref={ref}
      logo={logo}
      sections={sections}
      triggerLabel={label}
      returnFocusOnClose={returnFocusOnClose}
    />
  )
}
