// cs-unmet

import type { Locator, Page } from '@playwright/test'

/**
 * Find a command by WHICH COMMAND IT IS, not by what it currently says.
 *
 * An action's words are the half that moves: `describe()` varies them per game
 * and per state, so one action reads "Reveal answer", "Reveal secrets", "Hide
 * solution" and "Solution already shown" depending on where and when you look.
 * A spec keyed to the wording breaks the first time a game says it better — and
 * silently, since nobody runs every spec. Both surfaces write the id instead:
 * `<ActionButton>` and `<Menu>`'s rows each carry `data-action="act-…"`.
 *
 * **Use the words where the words are the SUBJECT.** waffle asserts that the
 * same button now wears its Hide face; that test is about the wording and
 * should go on naming it. These are for the tests that just need to press the
 * thing.
 */

/**
 * The button that fires an action — a game's action row, a terminal row, the
 * pause overlay.
 *
 * The ROLE half of this is load-bearing twice over: it excludes the menu's row
 * for the same action (a menu row is a `menuitem`), and it excludes what is
 * hidden from the accessibility tree, which is how a game that draws a control
 * in both its mobile and its desktop column still resolves to one element.
 * A bare attribute locator finds both and fails strict mode.
 */
export function actionButton(scope: Page | Locator, id: string): Locator {
  return scope.getByRole('button').and(scope.locator(`[data-action="${id}"]`))
}

/** The MENU row for an action. A submenu parent ("Check", "Reveal") is not a
 *  command and carries no id — reach those by their words, which are the
 *  grouping's own and do not vary. */
export function actionRow(scope: Page | Locator, id: string): Locator {
  return scope.getByRole('menuitem').and(scope.locator(`[data-action="${id}"]`))
}
