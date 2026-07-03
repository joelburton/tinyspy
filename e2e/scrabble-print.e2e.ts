import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { createSoloClub, createScrabbleGame, setScrabbleRack } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * SPIKE smoke (branch `scrabble-jspdf`): the "Print board (PDF)" menu item actually
 * generates + downloads a non-empty PDF. jsPDF's runtime behavior is unreachable by
 * the mocked component tests, so this drives the real path in a browser — play a move
 * (so the board + moves table have content), open the GamePage menu, click Print,
 * and assert a `*.pdf` download whose bytes start with the `%PDF-` magic.
 */
test.describe('scrabble — print board (jsPDF spike)', () => {
  test('the Print menu item downloads a non-empty PDF', async ({ browser }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createScrabbleGame(club, 'coop')
    setScrabbleRack(game.id, ['C', 'A', 'T', 'S', 'E', 'R', 'O'])

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // Play CAT so the printed board + moves table aren't empty.
    await expect(page.locator('[data-zone="rack"] [data-rack-tile]')).toHaveCount(7, { timeout: 15_000 })
    await page.locator('[data-cell][data-x="7"][data-y="7"]').click()
    await page.keyboard.type('CAT')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/CAT \+\d/i)).toBeVisible({ timeout: 10_000 })

    // Open the GamePage menu (the logo) → Print board (PDF); capture the download.
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
