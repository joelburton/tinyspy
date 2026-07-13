import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { createSoloClub, createWordwheelGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke: wordwheel's "Print board (PDF)" menu item generates + downloads a real PDF
 * (brand MooseWheel). jsPDF's runtime is unreachable by the mocked component tests, so
 * this drives the real path in a browser — solo game (no presence-pause), open the
 * GamePage menu, click Print, and assert a non-empty `*.pdf` download that begins
 * with the `%PDF-` magic bytes. The board renders even with no finds, so no
 * gameplay is needed. Guards printBoggle/printWordwheelPdf + the shared common/pdf
 * helpers end to end (their unit tests use a fake jsPDF; this uses the real one).
 */
test.describe('wordwheel — print board', () => {
  test('the Print menu item downloads a non-empty PDF', async ({ browser }) => {
    const club = await createSoloClub('wwp')
    const { id, gametype } = await createWordwheelGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)
    await expect(page.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })

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
