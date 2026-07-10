import type { MenuApi, MenuHeader, MenuItem, MenuSection } from '../games'

/**
 * Assemble a game's FULL header menu. Every game owns its own menu now (the
 * shell no longer injects a common section — see docs/ui.md → GamePage menu),
 * but the three framing items are identical everywhere, so this builds them
 * once: **Help** at the top, the game's own `extra` sections in the middle, and
 * a **End game / Concede game** + **Back to club** tail at the bottom.
 *
 * The end/concede item's id is standardized (`end-game` in coop, `concede` in
 * compete) so the shell's ⌥⌫ shortcut can find + fire it; Back to club carries
 * ⇧<. Both dispatch through the shell actions on `menu` (`openHelp`,
 * `requestBackToClub`) or the game's own end/concede handler — each game's `db` is
 * schema-typed, so the RPC call stays at the call site.
 */
export function buildGameMenu(opts: {
  /** The shell menu actions (openHelp / requestBackToClub) from `ctx.menu`. */
  menu: Pick<MenuApi, 'openHelp' | 'requestBackToClub'>
  mode: 'coop' | 'compete'
  isTerminal: boolean
  /** Compete only: a conceded player has already dropped out — grey the item. */
  conceded?: boolean
  /** Coop: fires the game's `end_game` RPC (neutral mutual give-up). */
  onEndGame?: () => void
  /** Compete: fires the game's `concede` RPC (drop out of the race). */
  onConcede?: () => void
  /** The game's own sections, inserted between Help and the End/Back tail. */
  extra?: MenuSection[]
  /** Optional info block pinned at the VERY TOP of the menu (above Help) — a
   *  non-clickable title + credit lines. crosswords passes the loaded puzzle's
   *  title / author / copyright, matching crossplay's menu. */
  header?: MenuHeader
}): MenuSection[] {
  const { menu, mode, isTerminal, conceded, onEndGame, onConcede, extra = [], header } = opts

  const endOrConcede: MenuItem =
    mode === 'compete'
      ? {
          id: 'concede',
          label: 'Concede game',
          shortcut: '⌥⌫',
          disabled: isTerminal || !!conceded,
          onClick: () => onConcede?.(),
        }
      : {
          id: 'end-game',
          label: 'End game',
          shortcut: '⌥⌫',
          disabled: isTerminal,
          onClick: () => onEndGame?.(),
        }

  return [
    // A header-only section (no items) at the very top when a header is given.
    ...(header ? [{ header, items: [] }] : []),
    { items: [{ id: 'help', label: 'Help', onClick: menu.openHelp }] },
    ...extra,
    {
      items: [
        endOrConcede,
        { id: 'back', label: 'Back to club', shortcut: '⇧<', onClick: menu.requestBackToClub },
      ],
    },
  ]
}

/** The menu-item ids the shell's ⌥⌫ shortcut looks for to fire end/concede. */
export const END_OR_CONCEDE_IDS = ['end-game', 'concede'] as const
