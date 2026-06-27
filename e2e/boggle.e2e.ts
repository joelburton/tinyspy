import { test, expect } from '@playwright/test'
import { createSoloClub, createBoggleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke test for the MothCubes (boggle) play loop on screen: the board renders,
 * a typed required word lands in the found-words list, and an off-board word is
 * rejected. Solo club so the game doesn't presence-pause with a single viewer.
 * The board (fixed in the fixture) spells "cat" across its top row.
 */
test.describe('boggle play loop', () => {
  test('board renders; a required word lands and an off-board word is rejected', async ({
    browser,
  }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createBoggleGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The 4×4 board renders all 16 tiles.
    await expect(page.locator('[data-boggle-tile]')).toHaveCount(16, { timeout: 15000 })

    const input = page.locator('input[data-game-input]')
    await expect(input).toBeVisible()

    // Type the required word "cat" and submit → it lands in the list (rows are
    // role=button, rendered uppercase).
    await input.fill('CAT')
    await input.press('Enter')
    await expect(page.getByRole('button', { name: 'CAT' })).toBeVisible({ timeout: 10000 })

    // An off-board word ("zzz" — no Z on the board) is rejected: never listed.
    await input.fill('ZZZ')
    await input.press('Enter')
    await expect(page.getByRole('button', { name: 'ZZZ' })).toHaveCount(0)

    await ctx.close()
  })
})
