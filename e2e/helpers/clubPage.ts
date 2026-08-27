// cs-unmet

import type { Locator, Page } from '@playwright/test'

/**
 * A row of one of the club page's two `<SelectionList>`s.
 *
 * A row is a plain `<div>` — it is not a `<button>` and has no `href`, because
 * the list container owns the keyboard and the click (docs/ui.md → Selection
 * lists). So `getByRole('button', { name: /Brand/ })` cannot reach one, which is
 * what every one of these call sites used to do. Scoped by the list's own label
 * so the class needle can't drift onto some other module that also calls a
 * class `row`.
 */
function clubRow(page: Page, listLabel: string, text: RegExp): Locator {
  return page
    .locator(`[aria-label="${listLabel}"] [class*="_row_"]`)
    .filter({ hasText: text })
    .first()
}

/** The "Start a new game" row for a gametype, found by its brand — clicking it
 *  opens that game's setup dialog. */
export function startGameRow(page: Page, brand: RegExp): Locator {
  return clubRow(page, 'Start a new game', brand)
}

/** A row of "Your games", found by any text it shows (its title, usually). */
export function yourGamesRow(page: Page, text: RegExp): Locator {
  return clubRow(page, 'Your games', text)
}
