// cs-audited-game-page

import type { ReactNode } from 'react'
import { PageHeaderMenu } from '../page-header/PageHeaderMenu'
import { useGameMenuSections } from '../menu/gameMenuStore'
import type { MenuSection } from '../menu/menuModel'

/**
 * The game page's header menu — the game's own sections, then the account row.
 *
 * A component of its own for one reason: it is the ONLY thing that subscribes
 * to what a game pushes (`gameMenuStore`). If `<GamePage>` read that itself,
 * every menu push would re-render the page and the board with it, for a change
 * nothing outside the menu can see.
 *
 * The account section stays a prop rather than a second subscription: it
 * belongs to the shell, the shell already builds it, and it is the same row on
 * every page.
 */
export function GameHeaderMenu({
  logo,
  accountSection,
}: {
  logo: ReactNode
  accountSection: MenuSection
}) {
  const gameSections = useGameMenuSections()
  return (
    <PageHeaderMenu
      logo={logo}
      sections={[...gameSections, accountSection]}
      label="Game menu"
      // The game menu sits over boards that read window keydowns for play
      // (crosswords' cursor), so focus falls back to the page on close rather
      // than to a trigger that would swallow those keys or reopen the menu.
      returnFocusOnClose={false}
    />
  )
}
