import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { createSoloClub, createLetterboxedGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * Smoke: letterboxed's "Print board (PDF)" menu item generates + downloads a
 * real PDF (brand SnakeBox). jsPDF's runtime is unreachable by the mocked
 * component tests, so this drives the real path in a browser — solo game (no
 * presence-pause), open the GamePage menu, click Print, and assert a non-empty
 * `*.pdf` download that begins with the `%PDF-` magic bytes.
 *
 * The board renders with no words played, so no gameplay is needed for the
 * smoke; a word is played anyway so the chain + move sections draw something
 * rather than only their empty states.
 */
test.describe('letterboxed — print board', () => {
  test('the Print menu item downloads a non-empty PDF', async ({ browser }) => {
    const club = await createSoloClub('lbp')
    const { id, gametype } = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)
    await boardReady(page, page.locator('svg text').first())

    await page.keyboard.type('adg')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listitem').filter({ hasText: /^ADG/ }).first()).toBeVisible({
      timeout: 10000,
    })

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
