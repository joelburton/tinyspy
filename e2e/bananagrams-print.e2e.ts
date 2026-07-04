import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { createSoloClub, createBananagramsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke: bananagrams's "Print board (PDF)" menu item generates + downloads a real PDF.
 * jsPDF's runtime is unreachable by the mocked component tests, so this drives the real
 * path in a browser (solo game so it doesn't presence-pause) — wait for the arena, open
 * the GamePage menu, click Print, and assert a `*.pdf` download starting with `%PDF-`.
 * The board + word list render even with an empty board, so no gameplay is needed.
 */
test.describe('bananagrams — print board', () => {
  test('the Print menu item downloads a non-empty PDF', async ({ browser }) => {
    const club = await createSoloClub('alice')
    const game = await createBananagramsGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    // The 25×25 arena rendering is proof the play surface (and the print menu) is ready.
    await expect(page.locator('[data-cell]').first()).toBeVisible({ timeout: 15_000 })

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
