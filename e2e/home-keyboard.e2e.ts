import { test, expect } from '@playwright/test'
import { createClubWithMembers } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The club-list page's keyboard navigation — the same shape ClubPage uses for
 * its two lists, so the two pages read as one idiom: the LIST CONTAINER is the
 * tab stop, Up/Down move a cursor ring through the rows (clamped, no wrap), and
 * Enter opens the club under the ring.
 *
 * A real browser because the whole thing is `document.activeElement` plus a
 * computed outline — neither of which jsdom models.
 */
test('home page: arrows move the club cursor, Enter opens', async ({ browser }) => {
  // Two rows so there's somewhere to move TO. Claiming a username materializes
  // a solo club, so this member sees their own solo club (which sorts first)
  // plus the shared one.
  const club = await createClubWithMembers(['hkbda', 'hkbdb'])

  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto('/')
  await expect(page.getByText('Your clubs')).toBeVisible({ timeout: 15000 })

  const rows = page.locator('[class*="_clubItem"]')
  await expect(rows.first()).toBeVisible()
  const rowCount = await rows.count()
  expect(rowCount).toBeGreaterThanOrEqual(2)

  /** Index of the row wearing the 2px cursor ring, or -1. */
  const ringed = () =>
    page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*="_clubItem"]')]
      return els.findIndex((el) => getComputedStyle(el).outlineWidth === '2px')
    })

  // Focus starts on the list, so arrows work without a first Tab, and the ring
  // starts on the first row.
  expect(
    await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') === 'Your clubs',
    ),
  ).toBe(true)
  expect(await ringed()).toBe(0)

  // Down moves it; Up brings it back.
  await page.keyboard.press('ArrowDown')
  expect(await ringed()).toBe(1)
  await page.keyboard.press('ArrowUp')
  expect(await ringed()).toBe(0)

  // Up at the top CLAMPS — deliberately no wrap-around (matches ClubPage).
  await page.keyboard.press('ArrowUp')
  expect(await ringed()).toBe(0)

  // Tab does NOTHING: focus stays on the list and the ring doesn't move, so a
  // reflex Tab can't walk off to the header menu or out into the browser chrome.
  await page.keyboard.press('Tab')
  expect(
    await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') === 'Your clubs',
    ),
  ).toBe(true)
  expect(await ringed()).toBe(0)
  await page.keyboard.press('Shift+Tab')
  expect(
    await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') === 'Your clubs',
    ),
  ).toBe(true)

  // Enter opens the club under the cursor — row 0 is the solo club.
  const href = await rows.first().getAttribute('href')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`${href!.replace(/[/=]/g, '\\$&')}$`), {
    timeout: 10000,
  })

  await ctx.close()
})
