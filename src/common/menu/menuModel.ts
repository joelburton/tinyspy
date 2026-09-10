// cs-unmet

import type { AppIcon } from '../icons/icons'
import type { BoundAction } from '../actions/useBoundAction'

/**
 * What a menu is made of — the row, section and header types every `<Menu>`
 * speaks, plus the two functions that tell the kinds of row apart.
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
  // **Take it from `common/icons/icons.ts`, never `lucide-react`.** That
  // registry is "the ONE place that maps an action to its glyph"; the menu
  // joining it is what stops a legend from ever teaching a symbol the button
  // doesn't use. `AppIcon` is the registry's own type rather than lucide's, so
  // a menu row and its button can be handed the identical value — including a
  // glyph the registry defines itself, as IconBack is.
  //
  // A menu with NO icons reserves no gutter; one with any reserves it for all,
  // so labels line up rather than going ragged (Menu.module.css).
  icon?: AppIcon
}

/**
 * A hand-written row that DOES something when activated.
 *
 * **TRANSITIONAL.** A command is an action now (`common/actions`), and a menu
 * row is a reference to one: the label, glyph, key and availability come from
 * the action, so nothing has to be typed twice and a row cannot disagree with
 * the button beside it. This is the shape the surfaces that have not converted
 * yet still write, and it goes when the last of them does.
 */
export type MenuAction = MenuItemBase & {
  onClick: () => void
  // The keyboard-shortcut hint shown right-aligned + muted on the row (e.g.
  // "⌥C"). Hand-typed, and hand-kept in step with a binding written elsewhere,
  // which is the drift a bound action removes: it knows its own keys.
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
  items: Array<BoundAction | MenuAction>
  onClick?: never
  shortcut?: never
}

/**
 * One row in a menu. Three kinds, and only the first is the one to write:
 *
 *   - a **bound action** — a reference to a command (`common/actions`), which
 *     is where its label, glyph, key and availability come from;
 *   - a **submenu**, holding rows of its own;
 *   - a hand-written `MenuAction`, for the surfaces that have not converted.
 *
 * See docs/ui.md → "GamePage menu" for the placement + activation contract.
 */
export type MenuItem = BoundAction | MenuAction | MenuSubmenu

/** Narrow a row to the submenu arm. A function rather than an inline
 *  `'items' in item` so the discriminant is named in one place. */
export function isSubmenu(item: MenuItem): item is MenuSubmenu {
  return (item as MenuSubmenu).items !== undefined
}

/** Narrow a row to the bound-action arm — the one that answers for itself. */
export function isBoundAction(item: MenuItem): item is BoundAction {
  return (item as BoundAction).spec !== undefined
}

/**
 * WHAT THE MENU DRAWS for one row, whatever kind of row it is.
 *
 * The one place a bound action is read on its way into a menu, so `<Menu>`
 * itself never asks what kind of row it has: it lays out labels, glyphs,
 * shortcut hints and disabled states, and this says what those are. A hidden
 * action becomes a row with `hidden`, which the menu drops before it counts
 * rows for keyboard navigation.
 */
export type MenuRow = {
  // Stable per row, for React keying and for naming the open submenu.
  id: string
  label: string
  icon?: AppIcon
  dot?: string
  // The first key, as it is shown — right-aligned and muted on the row.
  shortcut?: string
  disabled: boolean
  hidden: boolean
  // The rows behind this one when it opens a submenu; null on an ordinary row.
  children: MenuRow[] | null
  // What activating it does. A no-op on a submenu parent, which opens instead.
  run: () => void
}

export function menuRow(item: MenuItem): MenuRow {
  if (isSubmenu(item)) {
    const children = item.items.map(menuRow).filter((row) => !row.hidden)
    return {
      id: item.id,
      label: item.label,
      icon: item.icon,
      dot: item.dot,
      disabled: item.disabled ?? false,
      // A submenu with nothing left to show is not a row you can open.
      hidden: children.length === 0,
      children,
      run: () => {},
    }
  }
  if (isBoundAction(item)) {
    const { state, label, icon } = item.describe()
    return {
      id: item.id,
      label: label ?? item.spec.label,
      // A toggle's face, when it has one — the menu is the legend that teaches
      // the buttons' glyphs, so it has to show the one the button is wearing.
      icon: icon ?? item.spec.icon,
      shortcut: item.spec.keys?.[0]?.label,
      // An action still out is not one to fire again, and the row says so.
      disabled: state === 'disabled' || item.pending,
      hidden: state === 'hidden',
      children: null,
      run: () => item.run(),
    }
  }
  return {
    id: item.id,
    label: item.label,
    icon: item.icon,
    dot: item.dot,
    shortcut: item.shortcut,
    disabled: item.disabled ?? false,
    hidden: false,
    children: null,
    run: item.onClick,
  }
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
  // Help for THIS game — the manifest's `help` component, opened as a row in
  // the menu. Bound by the game page, because it is the page that knows which
  // rules to show; place it with `buildGameMenu`.
  actHelp: BoundAction
  // "Back to club": navigates directly for a terminal game, or opens the
  // suspend-confirm modal mid-game. Also carries `<`, so a menu row built from
  // it advertises the key. Place it in a menu, or as an `<ActionButton>` in a
  // terminal row.
  actBackToClub: BoundAction
  // Open chat, bound at the app root rather than here — the game page only
  // passes it along so a menu can show it. Null on a page with no chat panel.
  actChat: BoundAction | null
  // Replace the game's ENTIRE header menu. Every game owns its whole
  // menu — the shell injects nothing — so the game supplies all sections
  // (dividers appear between them). Use the `buildGameMenu` helper (common/lib/game/
  // gameMenu.ts) to get the standard Help + End/Concede + Back-to-club
  // framing. Pass `[]` to clear (on unmount). Identity is stable across
  // GamePage renders.
  setGameSections: (sections: MenuSection[]) => void
}
