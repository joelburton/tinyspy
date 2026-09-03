// cs-unmet

import { useEffect, useRef, type ReactNode } from 'react'
import { Menu, type MenuHandle } from '../menu/Menu'
import { registerPageMenu } from '../../lib/menu/pageMenuStore'
import type { MenuSection } from '../../lib/menu/menu'

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
 * It exists because the same five-line block was written three times, identical
 * apart from the logo, the sections and the label (plans/areas/homepage.md →
 * `page-header-trio`). Two of those three things stayed the same at every
 * site and neither was a decision anyone was making:
 *
 * - **The chevron-wrapped logo.** Now `<Menu>`'s own business — it takes a
 *   `logo` and supplies the chevron, so a caller cannot forget it.
 * - **The `?` wiring.** Each page used to declare a `useRef<MenuHandle>`, pass
 *   it down, and hand `() => ref.current?.open()` to `useAppShortcuts`. The ref
 *   lives here now and registers itself in `pageMenuStore`, so the shortcut
 *   finds the menu without the page carrying it across.
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
