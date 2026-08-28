// cs-unmet

import { test, expect, type Page } from '@playwright/test'
import { createClubWithMembers } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { startGameRow } from './helpers/clubPage'

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
 * The puzzle field's DISCLOSURE. It was a `<fieldset>` until 2026-08-25, when
 * every setup field became a `<SetupSection>` (plans/areas/forms.md → F35), so
 * the answer now lives in the summary — `Puzzle: 2025-06-15: Here's to him!` —
 * and the body holds only the date override.
 */
function puzzleSection(page: Page) {
  return page
    .locator('details', { has: page.locator('summary', { hasText: /^Puzzle:/ }) })
    .first()
}

/**
 * Open it. Closed by default like every other setup section — EXCEPT when there
 * is nothing to play (the archive is used up, or the typed date has no puzzle),
 * where it opens itself so the message can't hide behind a summary. So this
 * checks before clicking rather than toggling blind, which would close it.
 */
async function openPuzzle(page: Page) {
  const section = puzzleSection(page)
  await expect(section).toBeVisible({ timeout: 15000 })
  const isOpen = await section.evaluate((el) => (el as HTMLDetailsElement).open)
  if (!isOpen) await section.locator('summary').click()
}

/**
 * The "next up" line inside the opened disclosure.
 *
 * Matched by ELEMENT, not by text shape. The line has four states — waiting,
 * a puzzle, "everyone has played everything", "no puzzle for that date" — and
 * a `/^\d{4}-\d{2}-\d{2}: /` locator silently matches none of the last two,
 * so asserting on them fails as "element not found" rather than as a wrong
 * message. (It did, while this was being written.)
 */
function nextUpLine(page: Page) {
  return puzzleSection(page).locator('p[class*="next"]').first()
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

    await startGameRow(page, /PaulPath/).click()
    await openPuzzle(page)
    const first = nextUpLine(page)
    await expect(first).toBeVisible({ timeout: 15000 })
    const firstText = (await first.textContent())!

    // Start with nothing picked — the whole point.
    await page.getByRole('button', { name: /^Start PaulPath/ }).click()
    await expect(page).toHaveURL(/\/g\/strands_coop\//, { timeout: 20000 })

    // Re-open: the club has now played that one, so the offer must move on.
    await page.goto(`/c/${club.handle}`)
    await startGameRow(page, /PaulPath/).click()
    await openPuzzle(page)
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

    await startGameRow(page, /WordKnit/).click()
    await openPuzzle(page)
    await expect(nextUpLine(page)).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: /^Start WordKnit/ }).click()
    await expect(page).toHaveURL(/\/g\/connections_coop\//, { timeout: 20000 })

    await ctx.close()
  })

  test('crosswords: the NYT picker picks by weekday, with a date override', async ({ browser }) => {
    // crosswords is the game where the date carries real meaning — an NYT
    // crossword's DAY is its difficulty — so it picks a weekday rather than
    // being handed the next unplayed puzzle outright. The server turns that
    // into the most recent date of that weekday nobody playing has done.
    //
    // The four sources are four blocking modals now, not tabs
    // (plans/areas/forms.md → F50 `puzzle-source-picks-in-a-dialog`), so the
    // resolved date is read off the setup form's CAPTION rather than a line
    // inside the source's body: once the picker closes, the caption is the only
    // place that answer exists.
    const club = await createClubWithMembers(['erin', 'finn'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    await startGameRow(page, /CrossPlay/).click()

    // Nothing chosen yet — and the caption says so rather than implying a
    // default the player did not pick.
    const caption = page.getByText(/^Puzzle: /)
    await expect(caption).toHaveText('Puzzle: choose one')

    // Choosing CLOSES the picker: one press, the same as the tab it replaces.
    await page.getByRole('button', { name: 'NYT', exact: true }).click()
    await page.getByText('Monday', { exact: true }).click()
    await expect(caption).toHaveText(/^Puzzle: NYT Monday · \d{4}-\d{2}-\d{2}$/, {
      timeout: 15000,
    })

    // The weekday drives the answer.
    await page.getByRole('button', { name: 'NYT', exact: true }).click()
    await page.getByText('Saturday', { exact: true }).click()
    await expect(caption).toHaveText(/^Puzzle: NYT Saturday · \d{4}-\d{2}-\d{2}$/, {
      timeout: 15000,
    })

    // The date box overrides it, and Return means the same there as on a row.
    await page.getByRole('button', { name: 'NYT', exact: true }).click()
    await expect(page.getByLabel('Puzzle date')).toHaveAttribute('min', '2015-01-01')
    await page.getByLabel('Puzzle date').fill('2019-03-14')
    await page.getByLabel('Puzzle date').press('Enter')
    await expect(caption).toHaveText('Puzzle: NYT 2019-03-14')

    // ...and choosing a weekday takes the choice back, rather than leaving a
    // control that silently does nothing.
    await page.getByRole('button', { name: 'NYT', exact: true }).click()
    await page.getByText('Wednesday', { exact: true }).click()
    await expect(caption).toHaveText(/^Puzzle: NYT Wednesday · /, { timeout: 15000 })

    await ctx.close()
  })

  test('crosswords: a picker can be canceled without choosing', async ({ browser }) => {
    // The affordance the tabs did not have. Leaving a source used to be a side
    // effect of pressing a different tab, which also cleared what you had
    // already chosen; backing out of a picker now leaves the choice alone.
    const club = await createClubWithMembers(['erin', 'finn'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    await startGameRow(page, /CrossPlay/).click()
    const caption = page.getByText(/^Puzzle: /)

    await page.getByRole('button', { name: 'Guardian', exact: true }).click()
    await page.getByText('Quiptic', { exact: true }).click()
    await expect(caption).toHaveText('Puzzle: Guardian Quiptic')

    await page.getByRole('button', { name: 'NYT', exact: true }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(caption).toHaveText('Puzzle: Guardian Quiptic')

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
      await startGameRow(page, /PaulPath/).click()
      await openPuzzle(page)
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
