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
/** Pick from ClubPage's gametype <FilterSelect> by its visible label. The
 *  trigger is the button carrying `aria-expanded`; its options only exist in
 *  the DOM while the list is open. */
async function pickGametype(page: import('@playwright/test').Page, label: string) {
  const trigger = page.getByLabel('Filter your games by game')
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await trigger.locator('xpath=../div').getByRole('button', { name: label, exact: true }).click()
}

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
    // <FilterSelect>, not a <select>: options exist only while the list is open,
    // and are labelled with each family's BRAND (manifest.name).
    await select.click()
    const options = await select.locator('xpath=../div').getByRole('button').allInnerTexts()
    expect(options).toEqual(['All games', 'SyrupSwap', 'WordNerd'])

    await pickGametype(page, 'WordNerd')
    // BOTH wordle games survive the family filter; the waffles don't.
    await expect(gameCards).toHaveCount(2)
    // ...and the filter never took focus in the first place, so the games list
    // keeps its arrow-key cursor without any hand-back. (The old native <select>
    // stole focus to open its popup and needed ClubPage to give it back — which
    // it failed to do when you re-picked the option already selected.)
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe('BUTTON')
    expect(await startButtons.count()).toBe(allStart) // start list untouched

    await pickGametype(page, 'All games')
    await expect(gameCards).toHaveCount(4)

    await ctx.close()
  })

  /**
   * The two filters persist DIFFERENTLY, and the asymmetry is the point (see
   * ClubPage's note where they're declared):
   *
   *   - the MODE filter is a standing taste — "I'm here to play compete games" —
   *     that narrows a menu of things you could start, hiding nothing that
   *     exists, so re-picking it every visit is pure friction. It sticks, in
   *     localStorage, keyed by user;
   *   - the GAMETYPE filter narrows a list of the club's REAL games, so a
   *     remembered one hides games that are still there. It resets.
   *
   * Both halves are asserted here because "sticky" and "not sticky" are equally
   * easy to break, and only one of them looks like a bug when it happens.
   */
  test('the mode filter survives a reload; the gametype filter does not', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['flp', 'flq'])
    await createWordleGame(club, 'coop')
    await createWaffleGame(club, 'compete')

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await expect(page.getByText('Start a new game')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Join the active game')).toHaveCount(0, { timeout: 20000 })

    const headings = page.locator('[class*="_headingRow_"]')
    const modeButton = (name: string) => headings.getByRole('button', { name, exact: true })
    const select = headings.getByLabel('Filter your games by game')

    await modeButton('Compete').click()
    await expect(modeButton('Compete')).toHaveAttribute('aria-pressed', 'true')
    await pickGametype(page, 'WordNerd')

    await page.reload()
    await expect(page.getByText('Start a new game')).toBeVisible({ timeout: 20000 })

    // The taste came back…
    await expect(modeButton('Compete')).toHaveAttribute('aria-pressed', 'true')
    await expect(modeButton('All')).toHaveAttribute('aria-pressed', 'false')
    // …and the hide-real-games filter did not. The trigger shows the current
    // choice as TEXT now (it's a button, not a <select> with a value).
    await expect(select).toHaveText('All games')

    // It's a preference, not a trap: switching back sticks just as readily.
    await modeButton('All').click()
    await page.reload()
    await expect(page.getByText('Start a new game')).toBeVisible({ timeout: 20000 })
    await expect(modeButton('All')).toHaveAttribute('aria-pressed', 'true')

    await ctx.close()
  })

  /**
   * A solo club draws no coop/compete distinction anywhere (`<ModePill>`
   * suppresses the badge there), so it gets NO mode filter — offering to sort
   * by a distinction the page isn't showing is worse than the empty space.
   * The start list still shows everything.
   */
  test('a solo club gets no mode filter at all', async ({ browser }) => {
    const club = await createSoloClub('flsolo')

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await expect(page.getByText('Start a new game')).toBeVisible({ timeout: 20000 })

    // Neither instance renders — not the desktop heading-row one, not the
    // mobile under-the-tabs one.
    await expect(page.getByRole('group', { name: 'Filter games by mode' })).toHaveCount(0)
    // ...and the solo club's whole startable set is listed, unfiltered.
    await expect(
      page.locator('[class*="_startList_"] [class*="_button_"]'),
    ).not.toHaveCount(0)

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
