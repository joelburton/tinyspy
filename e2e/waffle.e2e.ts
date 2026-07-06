import { test, expect } from '@playwright/test'
import { createSoloClub, createWaffleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * "Replay board" (the game menu) restarts the same board from scratch: it
 * clears the turn log and resets all progress on the same game row. Solo club
 * so the game doesn't presence-pause with a single viewer.
 */
test.describe('waffle replay board', () => {
  test('coop: a swap logs a turn; "Replay board" clears the log', async ({ browser }) => {
    const club = await createSoloClub('wfrp')
    const [alice] = club.members
    const game = await createWaffleGame(club) // coop by default

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    // Auto-confirm the "Replay board?" window.confirm.
    page.on('dialog', (d) => void d.accept())
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The scramble is `bacdef.g.hijklmn.o.pqrstu`; tiles are buttons labelled
    // "<LETTER> (<color>)". Wait for the board, then make one swap (D↔E) — a
    // non-solving move that leaves the game in play and logs turn #1.
    await expect(page.getByRole('button', { name: /^B \(/ })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /^D \(/ }).click()
    await page.getByRole('button', { name: /^E \(/ }).click()
    await expect(page.getByText('#1', { exact: true })).toBeVisible({ timeout: 8000 })

    // Replay → the turn log clears (and the board resets to the scramble).
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'Replay board' }).click()
    await expect(page.getByText('#1', { exact: true })).toHaveCount(0, { timeout: 8000 })
  })
})
