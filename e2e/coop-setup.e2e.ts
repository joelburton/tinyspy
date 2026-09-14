// cs-blessed-setup-form

import { test, expect } from '@playwright/test'
import { createClubWithMembers } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { startGameRow } from './helpers/clubPage'

/**
 * The shared coop-pacing setup field (SetupCoopStyleSection) as it renders in a real
 * setup dialog: right below the player picker every form opens with, the
 * "Co-op style" radio (free-for-all / turns) sits above a "First player"
 * DROPDOWN that only appears once turns is chosen. Driven on WordNerd
 * (wordle) coop as a representative — the field is the same component in every
 * game that offers turns. A 2-player club so the field shows (it hides for
 * solo).
 */
test.describe('coop setup — pacing field', () => {
  test('turns reveals a first-player dropdown', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    // Open the WordNerd COOP setup dialog. `startGameRow` takes the FIRST
    // matching row, and the start list sorts coop before compete inside a
    // sibling pair's tie (`ClubPage`'s `startableGames`).
    await startGameRow(page, /WordNerd/).click()

    // The Co-op disclosure is present, collapsed, showing the current value.
    const coopSummary = page.getByText('Co-op: free-for-all')
    await expect(coopSummary).toBeVisible({ timeout: 10000 })

    // Expand it, switch to turns → the first-player dropdown appears.
    await coopSummary.click()
    await page.getByRole('radio', { name: 'turns' }).click()
    const firstPlayer = page.getByRole('combobox', { name: 'First player' })
    await expect(firstPlayer).toBeVisible()
    // The dropdown lists the selected players.
    await expect(firstPlayer.getByRole('option')).toHaveCount(2)

    await ctx.close()
  })
})
