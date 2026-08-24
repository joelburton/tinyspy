// cs-audited

import { test, expect } from '@playwright/test'
import { createClubWithMembers } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The club list's keyboard navigation — which since 2026-08-24 is
 * `<SelectionList>`'s, not this page's (plans/selection-lists.md). The contract:
 * the LIST CONTAINER is the tab stop, Up/Down move a cursor ring through the
 * rows (clamped, no wrap), Home/End jump to the ends, Space does nothing, and
 * Enter opens the row under the ring.
 *
 * A real browser because the whole thing is `document.activeElement` plus a
 * computed outline — neither of which jsdom models. It is also the only place
 * the "Space must not scroll and must not act" rule can be checked at all: in
 * the DOM the focused element IS the scroll box.
 */
test('home page: arrows move the club cursor, Enter opens', async ({ browser }) => {
  // Two rows so there's somewhere to move TO. Claiming a username materializes
  // a solo club, so this member sees their own solo club (which sorts first)
  // plus the shared one.
  const club = await createClubWithMembers(['hkbda', 'hkbdb'])
  const soloHandle = `=${club.members[0].username}`

  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto('/')
  await expect(page.getByText('Your clubs')).toBeVisible({ timeout: 15000 })

  // The rows are the SelectionList's own, scoped by the list's label so this
  // can't drift onto some other module that also calls a class `row`.
  const LIST = '[aria-label="Your clubs"]'
  const rows = page.locator(`${LIST} [class*="_row_"]`)
  await expect(rows.first()).toBeVisible()
  expect(await rows.count()).toBeGreaterThanOrEqual(2)

  /** Index of the row wearing the 2px cursor ring, or -1. */
  const ringed = () =>
    page.evaluate((sel) => {
      const els = [...document.querySelectorAll(`${sel} [class*="_row_"]`)]
      return els.findIndex((el) => getComputedStyle(el).outlineWidth === '2px')
    }, LIST)

  const focusedList = () =>
    page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)

  // Focus starts on the list, so arrows work without a first Tab, and the ring
  // starts on the first row.
  expect(await focusedList()).toBe('Your clubs')
  expect(await ringed()).toBe(0)

  // Down moves it; Up brings it back.
  await page.keyboard.press('ArrowDown')
  expect(await ringed()).toBe(1)
  await page.keyboard.press('ArrowUp')
  expect(await ringed()).toBe(0)

  // Up at the top CLAMPS — deliberately no wrap-around.
  await page.keyboard.press('ArrowUp')
  expect(await ringed()).toBe(0)

  // End jumps to the last row, Home back to the first.
  await page.keyboard.press('End')
  expect(await ringed()).toBe((await rows.count()) - 1)
  await page.keyboard.press('Home')
  expect(await ringed()).toBe(0)

  // Space does NOTHING in a "do now" list: it must not open the club (moving a
  // cursor is not consenting to an action) and it must not scroll the box.
  const scrollTop = () =>
    page.evaluate((sel) => document.querySelector(sel)!.scrollTop, LIST)
  const before = await scrollTop()
  await page.keyboard.press('Space')
  expect(page.url()).toContain('/')
  expect(await ringed()).toBe(0)
  expect(await scrollTop()).toBe(before)
  await expect(page.getByText('Your clubs')).toBeVisible()

  // Tab does NOTHING: focus stays on the list and the ring doesn't move, so a
  // reflex Tab can't walk off to the header menu or out into the browser chrome.
  await page.keyboard.press('Tab')
  expect(await focusedList()).toBe('Your clubs')
  expect(await ringed()).toBe(0)
  await page.keyboard.press('Shift+Tab')
  expect(await focusedList()).toBe('Your clubs')

  // Enter opens the club under the cursor — row 0 is the solo club.
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`${soloHandle.replace(/[/=]/g, '\\$&')}$`), {
    timeout: 10000,
  })

  await ctx.close()
})
