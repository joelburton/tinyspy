import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { createSoloClub, createConnectionsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke: connections' "Print board (PDF)" menu item generates + downloads a real
 * PDF (brand WordKnit). jsPDF's runtime is unreachable from the mocked component
 * tests — `pdf/model.test.ts` covers the shaping with no renderer — so this
 * drives the real path in a browser.
 *
 * It solves one category first, so the printed page exercises BOTH board row
 * kinds: a bordered category band (with its A–D letter) and the remaining-tile
 * grid. A board with no bands would leave the most interesting renderer branch
 * untouched.
 *
 * Solo club so it doesn't presence-pause with one viewer.
 */
test.describe('connections — print board', () => {
  test('the Print menu item downloads a non-empty PDF', async ({ browser }) => {
    const club = await createSoloClub('cnpr')
    const game = await createConnectionsGame(club, 'coop')

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // Solve category A so a band renders, then leave the rest unsolved.
    for (const t of ['ALPHA', 'ANGEL', 'APPLE', 'ARROW']) {
      await page.getByRole('button', { name: t, exact: true }).click()
    }
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText('Words starting with A').first()).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Game menu' }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByText('Print board (PDF)').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.pdf$/)
    const bytes = readFileSync(await download.path())
    expect(bytes.length, 'a real PDF, not an empty file').toBeGreaterThan(1000)
    expect(bytes.subarray(0, 5).toString('latin1'), 'PDF magic bytes').toBe('%PDF-')

    await ctx.close()
  })
})
