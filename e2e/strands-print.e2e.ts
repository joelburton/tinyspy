import { test, expect } from '@playwright/test'
import { createSoloClub, createStrandsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke: strands' "Print board (PDF)" generates and downloads a real PDF.
 *
 * jsPDF's runtime is unreachable from the mocked component tests, so this drives
 * the real path in a browser. The judgment — what may be printed, and one track
 * per board — is unit-tested in pdf/model.test.ts; this only proves the renderer
 * runs end to end. Solo game so it doesn't presence-pause.
 */
test.describe('strands — print board', () => {
  test('the Print menu item downloads a non-empty PDF', async ({ browser }) => {
    const club = await createSoloClub('ppp')
    const game = await createStrandsGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20_000 })

    // Find one word first, so the renderer draws a path rather than a bare grid.
    const theme = game.words.find((w) => !w.isSpangram)!
    for (const [r, c] of theme.coords) await page.locator(`[data-cell="${r},${c}"]`).click()
    await page.keyboard.press('Enter')
    await expect(page.getByText(`${theme.word} — theme`)).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Game menu' }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByText('Print board (PDF)').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.pdf$/)
    const stream = await download.createReadStream()
    const head = await new Promise<string>((resolve) => {
      stream.once('data', (c: Buffer) => resolve(c.subarray(0, 5).toString()))
    })
    expect(head).toBe('%PDF-')

    await ctx.close()
  })
})
