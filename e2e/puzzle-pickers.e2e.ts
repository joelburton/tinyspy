// cs-blessed-setup-form

import { test, expect, type Page } from '@playwright/test'
import { createClubWithMembers } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { startGameRow } from './helpers/clubPage'

/**
 * The three date-anchored games' setup dialogs.
 *
 * connections and strands have no picker: the server hands out
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
 * Locators scope to the Puzzle section on purpose. The setup dialog is a
 * draggable window, not a `role="dialog"`, AND a strands game's TITLE is
 * `<date>: <clue>` — the same shape as the preview line — so an unscoped
 * match happily finds the club-page game row behind the dialog and reports a
 * stale date.
 */

/**
 * The puzzle field's DISCLOSURE — a `<SetupSection>` like every other setup
 * field, so the answer lives in the summary (`Puzzle: 2025-06-15: Here's to
 * him!`) and the body holds only the date override.
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
 * Matched by its TEST ID, not by text shape. The line has four states —
 * waiting, a puzzle, "everyone has played everything", "no puzzle for that
 * date" — and a `/^\d{4}-\d{2}-\d{2}: /` locator silently matches none of the
 * last two, so asserting on them fails as "element not found" rather than as a
 * wrong message.
 */
function nextUpLine(page: Page) {
  return puzzleSection(page).getByTestId('next-puzzle')
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
    await page.getByRole('button', { name: 'Start' }).click()
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

    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page).toHaveURL(/\/g\/connections_coop\//, { timeout: 20000 })

    await ctx.close()
  })

  test('crosswords: the NYT picker picks by weekday, with a date override', async ({ browser }) => {
    // crosswords is the game where the date carries real meaning — an NYT
    // crossword's DAY is its difficulty — so it picks a weekday rather than
    // being handed the next unplayed puzzle outright. The server turns that
    // into the most recent date of that weekday nobody playing has done.
    //
    // Each source is its own blocking modal, so the resolved date is read off
    // the setup form's CAPTION rather than a line inside the source's body:
    // once the picker closes, the caption is the only place that answer
    // exists.
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

    // Choosing CLOSES the picker: one press, and you are back at the form.
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

  test('crosswords: canceling a picker CLEARS the choice', async ({ browser }) => {
    // Pressing a source button is the start of choosing, so backing out ends
    // with nothing chosen — not with the puzzle you had before the press, which
    // the caption and a filled button would both still be describing while
    // Start offered to play it.
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
    // TWO "Cancel"s are on screen once a picker opens — the picker's own, and the
    // setup dialog's underneath it, both the same shared CancelButton. Scope to
    // the picker by the panel carrying its heading, so this cancels the picker
    // and not the dialog behind it (which is the whole point of the test).
    // Our own marker, not react-rnd's class names. The picker opens from inside
    // the setup dialog's tree, so the dialog's panel holds the heading too: the
    // picker is the panel with the heading and no panel inside it.
    const nytPicker = page
      .locator('[data-floating-panel]:not(:has([data-floating-panel]))')
      .filter({ has: page.getByRole('heading', { name: 'New York Times' }) })
    await nytPicker.getByRole('button', { name: 'Cancel' }).click()

    // The Guardian series went with it: no source is named, so the field is back
    // to asking, and the Start it was gating is refused again.
    await expect(caption).toHaveText('Puzzle: choose one')
    await expect(page.getByRole('button', { name: /^Start/ })).toBeDisabled()

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
    // CLUE rather than the date matters, because the not-found sentence names
    // the date too ("No PaulPath puzzle for 2025-06-15") and would match a
    // looser check while showing the opposite of what's meant.
    const CLUE = "Here's to him!"

    await open()
    await expect(nextUpLine(page)).not.toContainText(CLUE)

    // The setup form's date box carries no caption — the section's summary is
    // the caption — so it is reached by its form name. (The crosswords NYT
    // picker above is a different control and does have an aria-label.)
    await page.locator('input[name="puzzle_id"]').fill('2025-06-15')
    await expect(nextUpLine(page)).toContainText(CLUE, { timeout: 10000 })

    // A date the archive doesn't have says so rather than silently ignoring it.
    await page.locator('input[name="puzzle_id"]').fill('1999-01-01')
    await expect(nextUpLine(page)).toContainText('No PaulPath puzzle', { timeout: 10000 })

    // Clearing hands the choice back to the server.
    await page.locator('input[name="puzzle_id"]').fill('')
    await expect(nextUpLine(page)).not.toContainText(CLUE, { timeout: 10000 })

    await page.locator('input[name="puzzle_id"]').fill('2025-06-15')
    await expect(nextUpLine(page)).toContainText(CLUE, { timeout: 10000 })
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page).toHaveURL(/\/g\/strands_coop\//, { timeout: 20000 })
    const firstUrl = page.url()

    // Same date again → a SECOND game. The default picker exists to stop you
    // stumbling into a repeat; this is the door marked "yes, I mean it".
    await page.goto(`/c/${club.handle}`)
    await open()
    await page.locator('input[name="puzzle_id"]').fill('2025-06-15')
    await expect(nextUpLine(page)).toContainText(CLUE, { timeout: 10000 })
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page).toHaveURL(/\/g\/strands_coop\//, { timeout: 20000 })
    expect(page.url()).not.toBe(firstUrl)

    await ctx.close()
  })
})
