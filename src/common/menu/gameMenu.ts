// cs-audited-menu

import type { BoundAction } from '../actions/useBoundAction'
import type { MenuApi, MenuHeader, MenuItem, MenuSection } from './menuModel'

/**
 * Assemble a game's FULL header menu. Every game owns its own menu (the shell
 * injects nothing — see docs/ui.md → GamePage menu), but the framing is
 * identical everywhere, so this builds it once: **Help** + **Open chat** at the
 * top, the game's own `extra` sections in the middle, and the game's **exits** +
 * **Back to club** at the bottom.
 *
 * Every row is a bound action, so this arranges rows and decides nothing about
 * them: which exit a mode offers, whether one is available and what key it
 * answers to are the actions' own business (`useStandardGameActions` binds End,
 * Concede and Restart; `common/actions` holds what they are). A row an action
 * says is hidden drops out when the menu draws — which is how a coop game shows
 * End and a race shows Concede without this asking.
 */
export function buildGameMenu(opts: {
  /** The shell's own rows, off `ctx.menu`: Help, chat and Back to club. */
  menu: Pick<MenuApi, 'actHelp' | 'actChat' | 'actBackToClub'>
  /** The game's exits, in the order they should read. Concede goes before End
   *  where a race offers both — it is the mode's primary exit, and the first
   *  one on the list is the one a player reaches for. */
  exits: BoundAction[]
  /** The game's own sections, inserted between Help and the exits. */
  extra?: MenuSection[]
  /** Optional info block pinned at the VERY TOP of the menu (above Help) — a
   *  non-clickable title + credit lines. crosswords passes the loaded puzzle's
   *  title / author / copyright, matching the menu of the original crossplay
   *  app it was ported from. */
  header?: MenuHeader
}): MenuSection[] {
  const { menu, exits, extra = [], header } = opts

  const top: MenuItem[] = menu.actChat ? [menu.actHelp, menu.actChat] : [menu.actHelp]

  return [
    // A header-only section (no items) at the very top when a header is given.
    ...(header ? [{ header, items: [] }] : []),
    { items: top },
    ...extra,
    { items: [...exits, menu.actBackToClub] },
  ]
}
