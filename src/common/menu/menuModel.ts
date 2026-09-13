// cs-blessed-menu

import type { AppIcon } from '../icons/icons'
import type { BoundAction } from '../actions/useBoundAction'

/**
 * What a menu is made of — the row, section and header types every `<Menu>`
 * speaks, plus the one function that tells the two kinds of row apart.
 *
 * Reach for this when you are BUILDING a menu: a game assembling its header
 * menu (via `buildGameMenu` next door), or any surface handing sections to
 * `<Menu>`. The imperative side — opening a menu, replacing a game's sections —
 * is `MenuApi`, which a PlayArea receives on its `GamePageCtx` rather than
 * importing.
 *
 * Types only, plus `isSubmenu` and `menuRow`. The rendering lives in `Menu.tsx`
 * and the opener `?` reaches in `pageMenuStore.ts`, both next door.
 *
 * **Why its own module.** None of these names a game: a menu is a shell
 * thing, and a surface that builds one should not have to import the manifest
 * contract to get the row type.
 */

/**
 * A row that OPENS A SUBMENU instead of acting — crosswords' Check and Reveal
 * by scope, and the account row. One level deep only: its items are actions,
 * not further submenus (doc.md → Intro to area says why the cap).
 *
 * The only kind of row that is not itself an action: opening is the whole
 * behavior, so there is nothing to run and no key to advertise. Its own words
 * and glyph are written here because a family name ("Check", "Reveal") belongs
 * to the grouping rather than to any command in it — and the account row's,
 * because what it shows is who you are.
 */
export type MenuSubmenu = {
  // Stable id for React keying, and the name the menu holds an open submenu by.
  id: string
  label: string
  // When true, the row renders grayed-out and skips keyboard navigation — and a
  // disabled parent can't be opened, which is why the children carry no
  // `disabled` of their own to repeat.
  disabled?: boolean
  // A member-color NAME ('red' … 'pink') to draw as an identity disc before the
  // label — the app-wide "this color is this player" marker (docs/ui.md →
  // "Player identity = a colored disc").
  //
  // Exists for the account row, which is labeled with your username and shows
  // who you are the way every other surface does: name beside disc. A color
  // name rather than a ReactNode label, so `label` stays a plain string — the
  // drill-down's "‹ {label}" row and the button's accessible name both depend
  // on that.
  dot?: string
  // The family's glyph, drawn before the label. The menu is the icon language's
  // legend (doc.md → Intro to area), so take it from `common/icons/icons.ts`, never
  // `lucide-react`: the registry is the one place that maps an action to its
  // glyph, and `AppIcon` is its type so a row and its button are handed the
  // identical value.
  icon?: AppIcon
  items: BoundAction[]
}

/**
 * One row in a menu: an ACTION, or a submenu holding actions.
 *
 * A command is an action (`common/actions`), so a row is a reference to one —
 * its label, glyph, shortcut and availability all come from the action, which
 * is what stops a row from disagreeing with the button beside it. There is no
 * hand-written row shape any more: writing one was how a menu came to say a
 * thing the rest of the app said differently.
 *
 * See docs/ui.md → "GamePage menu" for the placement + activation contract.
 */
export type MenuItem = BoundAction | MenuSubmenu

/** Narrow a row to the submenu arm. A function rather than an inline
 *  `'items' in item` so the discriminant is named in one place. */
export function isSubmenu(item: MenuItem): item is MenuSubmenu {
  return (item as MenuSubmenu).items !== undefined
}

/** What the menu draws for one row, whatever kind of row it is — `menuRow`'s
 *  answer, and the only shape `<Menu>` lays out. */
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

/**
 * Read one row on its way into the menu — a bound action's words, glyph,
 * shortcut and state, or a submenu's own — so `<Menu>` never asks what kind of row
 * it has. A hidden action becomes a row with `hidden`, which the menu drops
 * before it counts rows for keyboard navigation; an action still out is
 * `disabled`, so a row cannot advertise a key for a run it would drop.
 */
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

/** A group of items rendered together in the menu popover.
 *  Sections are separated by a thin divider. A section with NEITHER items nor a
 *  header drops out — no leading or trailing dividers around them — so a
 *  header-only section is kept and drawn. */
export type MenuSection = {
  // Optional non-clickable header shown ABOVE the section's items — a bold
  // `title` plus muted `lines`. crosswords shows the loaded puzzle's title and
  // credits with it. A section may be header-only (`items: []`), which is how
  // `buildGameMenu` pins that block above everything.
  header?: MenuHeader
  items: MenuItem[]
}

/** A non-clickable block of text at the top of a section: a title and muted
 *  lines under it (an author, a copyright). */
export type MenuHeader = {
  title: string
  // Empty or omitted lines are the caller's to filter out.
  lines?: string[]
}

/**
 * The menu as a PlayArea sees it, on its `GamePageCtx`: the three rows the
 * shell binds and the game cannot, and the one call that replaces the game's
 * sections. Hand the rows to `buildGameMenu` with the game's own, and push the
 * result through `setGameSections` from an effect whose cleanup pushes `[]`.
 */
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
  // (dividers appear between them). Use the `buildGameMenu` helper (common/menu/
  // gameMenu.ts) to get the standard Help + End/Concede + Back-to-club
  // framing. Pass `[]` to clear (on unmount). Identity is stable across
  // GamePage renders.
  setGameSections: (sections: MenuSection[]) => void
}
