import { test, expect } from '@playwright/test'
import {
  createClubWithMembers,
  createSoloClub,
  createWaffleGame,
  createWordleGame,
  type E2EClub,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * ClubPage's two list filters (docs/ui.md → ClubPage "Filtering the two
 * lists"): mode buttons over "Start a new game", a gametype dropdown over
 * "Your games". The load-bearing claims are that each filter narrows only its
 * OWN list, and that the dropdown groups a coop/compete sibling pair into one
 * choice — so a "Wordle" filter keeps both wordle games.
 *
 * Both filters render TWICE (the desktop heading-row instance and the mobile
 * under-the-tabs one, one of them always hidden — see ClubPage), so every
 * locator here is scoped: `_headingRow_` for the desktop tests,
 * `_mobileFilters_` for the mobile one. An unscoped `getByRole` would match
 * both instances and trip Playwright's strict mode.
 */
test.describe('club page list filters', () => {
  test('mode buttons filter the start list; the gametype dropdown filters your games', async ({
    browser,
  }) => {
    // A two-member club so compete gametypes are startable (their [2, n]
    // player-count floor hides them in a solo club).
    const club = await createClubWithMembers(['fla', 'flb'])
    // Two wordle games — the coop/compete SIBLING PAIR the dropdown must
    // collapse into a single choice — plus two waffles for that choice to
    // exclude.
    await createWordleGame(club, 'coop')
    await createWordleGame(club, 'compete')
    await createWaffleGame(club, 'coop')
    await createWaffleGame(club, 'compete')

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await expect(page.getByText('Start a new game')).toBeVisible({ timeout: 20000 })

    // The last-created game is the club's CURRENT one, so it starts out in the
    // active-game card rather than the list. Nobody is actually viewing it, so
    // ClubPage's abandoned-pointer heal clears it a beat later and it joins the
    // list. Wait that out before counting anything — otherwise the list length
    // changes under the assertions.
    await expect(page.getByText('Join the active game')).toHaveCount(0, { timeout: 20000 })

    const headings = page.locator('[class*="_headingRow_"]')
    const modeButton = (name: string) =>
      headings.getByRole('button', { name, exact: true })
    const select = headings.getByLabel('Filter your games by game')
    const startButtons = page.locator('[class*="_startList_"] [class*="_button_"]')
    const gameCards = page.locator('[class*="_gamesList_"] [class*="_wrapper_"]')

    // ─── Mode filter ────────────────────────────────────────────────────
    const allStart = await startButtons.count()
    expect(allStart).toBeGreaterThan(2)
    await expect(gameCards).toHaveCount(4)

    await modeButton('Co-op').click()
    const coopOnly = await startButtons.count()
    expect(coopOnly).toBeGreaterThan(0)
    expect(coopOnly).toBeLessThan(allStart)
    // Every remaining start button is a co-op one...
    await expect(
      page.locator('[class*="_startList_"]').getByText('Compete', { exact: true }),
    ).toHaveCount(0)
    // ...and the OTHER column is untouched — each filter owns one list.
    await expect(gameCards).toHaveCount(4)

    // Every gametype is coop or compete, so the two halves partition the whole.
    await modeButton('Compete').click()
    expect(await startButtons.count()).toBe(allStart - coopOnly)

    await modeButton('All').click()
    expect(await startButtons.count()).toBe(allStart)

    // ─── Gametype filter ────────────────────────────────────────────────
    // Siblings collapse: ONE option covers wordle_coop + wordle_compete, so
    // the options are the FAMILIES listed (plus "All games"), by baseGametype.
    const options = await select
      .locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
    expect(options).toEqual(['all', 'waffle', 'wordle'])

    await select.selectOption('wordle')
    // BOTH wordle games survive the family filter; the waffles don't.
    await expect(gameCards).toHaveCount(2)
    expect(await startButtons.count()).toBe(allStart) // start list untouched

    await select.selectOption('all')
    await expect(gameCards).toHaveCount(4)

    await ctx.close()
  })

  /**
   * A solo club draws no coop/compete distinction anywhere (`<ModePill>`
   * suppresses the badge there), so the mode filter collapses to the one
   * always-selected "All" — the control keeps its slot in the heading row
   * without offering to sort by something the page isn't showing.
   */
  test('a solo club gets only the always-selected All', async ({ browser }) => {
    const club = await createSoloClub('flsolo')

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await expect(page.getByText('Start a new game')).toBeVisible({ timeout: 20000 })

    const modeButtons = page
      .locator('[class*="_headingRow_"]')
      .getByRole('group', { name: 'Filter games by mode' })
      .getByRole('button')
    await expect(modeButtons).toHaveCount(1)
    await expect(modeButtons).toHaveText('All')
    await expect(modeButtons).toHaveAttribute('aria-pressed', 'true')

    // Pressing it is a no-op — it stays selected and the list is unchanged.
    const startButtons = page.locator('[class*="_startList_"] [class*="_button_"]')
    const before = await startButtons.count()
    await modeButtons.click()
    await expect(modeButtons).toHaveAttribute('aria-pressed', 'true')
    expect(await startButtons.count()).toBe(before)

    await ctx.close()
  })

  /**
   * On mobile the section headings are gone (the tab bar names the view), so
   * the filter for the tab you're on moves to a row directly under the tabs —
   * and only that one is in that row.
   */
  test("mobile shows the showing tab's filter under the tabs", async ({ browser }) => {
    const club: E2EClub = await createClubWithMembers(['flm', 'fln'])
    await createWordleGame(club, 'coop')

    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    const bar = page.locator('[class*="_mobileFilters_"]')
    const modeFilter = bar.getByRole('group', { name: 'Filter games by mode' })
    const gametypeFilter = bar.getByLabel('Filter your games by game')

    await expect(modeFilter).toBeVisible({ timeout: 20000 })
    await expect(gametypeFilter).toHaveCount(0)

    await page.getByRole('button', { name: 'Your games', exact: true }).tap()
    await expect(gametypeFilter).toBeVisible()
    await expect(modeFilter).toHaveCount(0)

    // The desktop instances are still in the tree — hidden with their heading
    // rows, which is what keeps exactly one of each control on screen.
    await expect(
      page.locator('[class*="_headingRow_"]').getByRole('button', { name: 'All', exact: true }),
    ).toBeHidden()

    await ctx.close()
  })
})
