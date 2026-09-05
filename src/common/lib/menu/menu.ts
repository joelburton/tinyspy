// cs-blessed-game-lib

import type { LucideIcon } from 'lucide-react'

/**
 * What a menu is made of — the row, section and header types every `<Menu>`
 * speaks, plus the one function that tells the two kinds of row apart.
 *
 * Reach for this when you are BUILDING a menu: a game assembling its header
 * menu (via `buildGameMenu` in `lib/game/gameMenu.ts`), or any surface handing
 * sections to `<Menu>`. The imperative side — opening a menu, replacing a
 * game's sections — is `MenuApi`, which a PlayArea receives on its
 * `GamePageCtx` rather than importing.
 *
 * Types only, plus `isSubmenu`. The rendering lives in
 * `common/components/menu/`, and the open/closed state in `pageMenuStore.ts`
 * next door.
 *
 * **Why its own module.** None of these names a game: a menu is a shell
 * thing, and a surface that builds one should not have to import the manifest
 * contract to get the row type.
 */

/** What every menu row carries, whichever kind it is. */
type MenuItemBase = {
  // Stable id for React keying. PlayArea-owned values that
  // reflect game-state changes are fine — the sections are replaced
  // wholesale on each `setGameSections` call.
  id: string
  label: string
  // When true, the item renders grayed-out and skips keyboard
  // navigation. Use for state-dependent actions ("Reveal cell"
  // enabled only when a cell is selected). A disabled submenu
  // parent can't be opened.
  disabled?: boolean
  // A member-color NAME ('red' … 'pink') to draw as an identity disc before the
  // label — the app-wide "this color is this player" marker (docs/ui.md →
  // "Player identity = a colored disc").
  //
  // Exists for the account row, which is labeled with your username: the fixed
  // top-right chip it replaced WAS the dot, so without one the menu drops the
  // only place you see your own color. A color name rather than a ReactNode
  // label, so `label` stays a plain string — the drill-down's "‹ {label}" row
  // and the button's accessible name both depend on that.
  dot?: string
  // The action's glyph, drawn before the label — **the icon language's legend**.
  //
  // Icon-only buttons carry their names in hover tooltips, which touch devices
  // don't have (TooltipHost gates hover off there — a tap's synthetic hover
  // leaves a stuck bubble). The menu already spells those same actions out in
  // words, so showing each one's glyph beside its name teaches the association
  // once, at the point of need, and it reads in every game afterwards.
  // It costs no board space and nothing per interaction, which is why it beats
  // both a Help-page legend and a tap-to-reveal on the buttons themselves.
  //
  // **Take it from `common/components/icons.ts`, never `lucide-react`.** That
  // registry is "the ONE place that maps an action to its glyph"; the menu
  // joining it is what stops a legend from ever teaching a symbol the button
  // doesn't use. `LucideIcon` is the same type `ActionButton.icon` takes, so a
  // menu row and its button can be handed the identical value.
  //
  // A menu with NO icons reserves no gutter; one with any reserves it for all,
  // so labels line up rather than going ragged (Menu.module.css).
  icon?: LucideIcon
}

/** A row that DOES something when activated. The common case. */
export type MenuAction = MenuItemBase & {
  onClick: () => void
  // Optional keyboard-shortcut hint shown right-aligned + muted on
  // the item (e.g. "⌥C"), matching how desktop apps annotate menu
  // entries. Display only — the actual binding lives in the game's
  // keyboard hook; this just advertises it.
  shortcut?: string
  // Never present on an action — the discriminant.
  items?: never
}

/**
 * A row that OPENS A SUBMENU instead of acting. One level deep only:
 * a submenu's own items are actions, not further submenus. That cap is
 * deliberate — the flyout half of the desktop presentation would need
 * cascade positioning to go deeper, and no menu in the app wants it.
 *
 * Carries no `onClick` (opening is the whole behavior) and no
 * `shortcut` (the row isn't a command, so there's nothing to bind).
 */
export type MenuSubmenu = MenuItemBase & {
  items: MenuAction[]
  onClick?: never
  shortcut?: never
}

/** One row in the GamePage menu's per-game section (and any
 *  future reuse of `<Menu>`). See docs/ui.md → "GamePage menu"
 *  for the placement + activation contract. */
export type MenuItem = MenuAction | MenuSubmenu

/** Narrow a row to the submenu arm. A function rather than an inline
 *  `'items' in item` so the discriminant is named in one place. */
export function isSubmenu(item: MenuItem): item is MenuSubmenu {
  return item.items !== undefined
}

/** A group of items rendered together in the menu popover.
 *  Sections are separated by a thin divider. A section with NEITHER items nor a
 *  header drops out — no leading or trailing dividers around them — so a
 *  header-only section is kept and drawn. */
export type MenuSection = {
  // Optional non-clickable header shown ABOVE the section's items — a bold
  // `title` plus muted `lines` (e.g. "by Author", a copyright). crosswords uses
  // it to show the loaded puzzle's title + credits at the top of its menu, the
  // way the original crossplay app it was ported from does. A section may be
  // header-only (`items: []`), which
  // is how `buildGameMenu` pins that block above everything.
  header?: MenuHeader
  items: MenuItem[]
}

export type MenuHeader = {
  title: string
  // Muted sub-lines under the title (author, copyright). Empty/omitted lines
  // are the caller's to filter out.
  lines?: string[]
}

export type MenuApi = {
  // Replace the game's ENTIRE header menu. Every game owns its whole
  // menu — the shell injects nothing — so the game supplies all sections
  // (dividers appear between them). Use the `buildGameMenu` helper (common/lib/game/
  // gameMenu.ts) to get the standard Help + End/Concede + Back-to-club
  // framing. Pass `[]` to clear (on unmount). Identity is stable across
  // GamePage renders.
  setGameSections: (sections: MenuSection[]) => void
  // Open this game's Help modal (the manifest `help` component). Wire
  // it into your menu's Help item. Stable identity.
  openHelp: () => void
  // "Back to club": navigates directly for a terminal game, or opens
  // the suspend-confirm modal mid-game. Wire it into your menu's
  // Back-to-club item. The shell also binds ⇧< to it globally. Stable
  // identity.
  requestBackToClub: () => void
}
