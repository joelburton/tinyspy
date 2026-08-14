import { test, expect, type Page } from '@playwright/test'
import { createClubWithMembers } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The three date-anchored games' setup dialogs, after the 2026-08-13 rework.
 *
 * connections and strands lost their pickers entirely: the server hands out
 * the earliest puzzle none of the SELECTED PLAYERS has played, in any club
 * (`next_puzzle_for_club`), and the dialog only previews it. crosswords picks a
 * WEEKDAY, because its dates carry real meaning — an NYT crossword's day is
 * its difficulty — and the server resolves that to the most recent date of
 * that day nobody playing has done. All three also carry a plain date box as
 * an override that filters nothing.
 *
 * The claim worth an e2e rather than a pgTAP test is the SEAM: that starting
 * a game with no puzzle chosen anywhere in the FE works, and that the next
 * dialog then offers a different puzzle. pgTAP owns the derivation's rules
 * (tests/strands/next_puzzle_test.sql); this owns "the dialog and the server
 * agree".
 *
 * Locators scope to the Puzzle fieldset on purpose. The setup dialog is a
 * draggable window, not a `role="dialog"`, AND a strands game's TITLE is
 * `<date>: <clue>` — the same shape as the preview line — so an unscoped
 * match happily finds the club-page game row behind the dialog and reports a
 * stale date. (It did, while this was being written.)
 */

/**
 * The "next up" line inside whichever setup dialog is open.
 *
 * Matched by ELEMENT, not by text shape. The line has four states — waiting,
 * a puzzle, "everyone has played everything", "no puzzle for that date" — and
 * a `/^\d{4}-\d{2}-\d{2}: /` locator silently matches none of the last two,
 * so asserting on them fails as "element not found" rather than as a wrong
 * message. (It did, while this was being written.)
 */
function nextUpLine(page: Page) {
  return page
    .locator('fieldset', { has: page.getByText('Puzzle', { exact: true }) })
    .locator('p[class*="next"]')
    .first()
}

test.describe('puzzle pickers', () => {
  test('strands: no picker, and starting advances what the next dialog offers', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    await page.getByRole('button', { name: /PaulPath/ }).first().click()
    const first = nextUpLine(page)
    await expect(first).toBeVisible({ timeout: 15000 })
    const firstText = (await first.textContent())!

    // Start with nothing picked — the whole point.
    await page.getByRole('button', { name: /^Start PaulPath/ }).click()
    await expect(page).toHaveURL(/\/g\/strands_coop\//, { timeout: 20000 })

    // Re-open: the club has now played that one, so the offer must move on.
    await page.goto(`/c/${club.handle}`)
    await page.getByRole('button', { name: /PaulPath/ }).first().click()
    const second = nextUpLine(page)
    await expect(second).toBeVisible({ timeout: 15000 })
    expect(await second.textContent()).not.toBe(firstText)

    await ctx.close()
  })

  test('connections: previews a puzzle and starts it with no picker', async ({ browser }) => {
    const club = await createClubWithMembers(['carol', 'dave'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    await page.getByRole('button', { name: /WordKnit/ }).first().click()
    await expect(nextUpLine(page)).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: /^Start WordKnit/ }).click()
    await expect(page).toHaveURL(/\/g\/connections_coop\//, { timeout: 20000 })

    await ctx.close()
  })

  test('crosswords: the NYT tab picks by weekday, with a date override', async ({ browser }) => {
    // crosswords is the game where the date carries real meaning — an NYT
    // crossword's DAY is its difficulty — so it picks a weekday rather than
    // being handed the next unplayed puzzle outright. The server turns that
    // into the most recent date of that weekday nobody playing has done.
    const club = await createClubWithMembers(['erin', 'finn'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    await page.getByRole('button', { name: /CrossPlay/ }).first().click()
    await page.getByRole('button', { name: 'NYT', exact: true }).click()

    const line = page.locator('p[class*="nextDate"]').first()
    await expect(line).toBeVisible({ timeout: 15000 })

    // Monday by default, and the line names a real date rather than a title —
    // an NYT daily isn't stored anywhere until it's fetched, so there is
    // nothing to name it by.
    await expect(line).toContainText(/^Next Monday: \d{4}-\d{2}-\d{2}$/, { timeout: 10000 })

    // The weekday drives the answer.
    await page.getByLabel('Weekday').selectOption('6')
    await expect(line).toContainText(/^Next Saturday: \d{4}-\d{2}-\d{2}$/, { timeout: 10000 })

    // The date box overrides it...
    await page.getByLabel('Puzzle date').fill('2019-03-14')
    await expect(line).toContainText('Playing 2019-03-14', { timeout: 10000 })

    // ...and choosing a weekday takes the choice back, clearing the box rather
    // than leaving a control that silently does nothing.
    await page.getByLabel('Weekday').selectOption('3')
    await expect(line).toContainText(/^Next Wednesday: /, { timeout: 10000 })
    expect(await page.getByLabel('Puzzle date').inputValue()).toBe('')

    // The override's floor is enforced by the input too.
    await expect(page.getByLabel('Puzzle date')).toHaveAttribute('min', '2015-01-01')

    await ctx.close()
  })

  test('strands: the date box overrides, and replaying a date makes a SECOND game', async ({
    browser,
  }) => {
    // The escape hatch for "we know the date and we want that one" — including
    // one already played, which is why it filters nothing and why starting it
    // creates a new game rather than reopening the old one.
    const club = await createClubWithMembers(['gail', 'hank'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    const open = async () => {
      await page.getByRole('button', { name: /PaulPath/ }).first().click()
      await expect(nextUpLine(page)).toBeVisible({ timeout: 15000 })
    }
    // 2025-06-15's clue is the fixtures' own reference puzzle; asserting on the
    // CLUE rather than the date matters, because the not-found copy names the
    // date too ("No PaulPath puzzle for 2025-06-15") and would match a looser
    // check while showing the opposite of what's meant.
    const CLUE = "Here's to him!"

    await open()
    await expect(nextUpLine(page)).not.toContainText(CLUE)

    await page.getByLabel('Puzzle date').fill('2025-06-15')
    await expect(nextUpLine(page)).toContainText(CLUE, { timeout: 10000 })

    // A date the archive doesn't have says so rather than silently ignoring it.
    await page.getByLabel('Puzzle date').fill('1999-01-01')
    await expect(nextUpLine(page)).toContainText('No PaulPath puzzle', { timeout: 10000 })

    // Clearing hands the choice back to the server.
    await page.getByLabel('Puzzle date').fill('')
    await expect(nextUpLine(page)).not.toContainText(CLUE, { timeout: 10000 })

    await page.getByLabel('Puzzle date').fill('2025-06-15')
    await expect(nextUpLine(page)).toContainText(CLUE, { timeout: 10000 })
    await page.getByRole('button', { name: /^Start PaulPath/ }).click()
    await expect(page).toHaveURL(/\/g\/strands_coop\//, { timeout: 20000 })
    const firstUrl = page.url()

    // Same date again → a SECOND game. The default picker exists to stop you
    // stumbling into a repeat; this is the door marked "yes, I mean it".
    await page.goto(`/c/${club.handle}`)
    await open()
    await page.getByLabel('Puzzle date').fill('2025-06-15')
    await expect(nextUpLine(page)).toContainText(CLUE, { timeout: 10000 })
    await page.getByRole('button', { name: /^Start PaulPath/ }).click()
    await expect(page).toHaveURL(/\/g\/strands_coop\//, { timeout: 20000 })
    expect(page.url()).not.toBe(firstUrl)

    await ctx.close()
  })
})
