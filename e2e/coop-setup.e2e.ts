import { test, expect } from '@playwright/test'
import { createClubWithMembers } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The shared coop-pacing setup field (CoopStyleField) as it renders in a real
 * setup dialog: it's the FIRST section (right below the dialog's player picker),
 * the "Co-op style" radio (free-for-all / turns) sits above a spaced "First
 * player" DROPDOWN that only appears once turns is chosen. Driven on WordNerd
 * (wordle) coop as a representative — the field is identical across the six
 * turn-order games. A 2-player club so the field shows (it hides for solo).
 */
test.describe('coop setup — pacing field', () => {
  test('Co-op section is first, turns reveals a first-player dropdown', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    // Open the WordNerd COOP setup dialog (coop is the first WordNerd button).
    await page.getByRole('button', { name: /WordNerd/ }).first().click()

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

    await page.screenshot({
      path: '/private/tmp/claude-501/-Users-joel-src-codenames/d9659abe-d158-4755-86b7-c17d10569fef/scratchpad/coop-setup-turns.png',
    })

    await ctx.close()
  })
})
