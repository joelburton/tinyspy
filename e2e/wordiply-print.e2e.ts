import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { createSoloClub, createWordiplyGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke: wordiply's "Print board (PDF)" menu item generates + downloads a real PDF
 * (brand WordWire). jsPDF's runtime is unreachable from the mocked component tests
 * — `pdf/model.test.ts` covers the shaping with no renderer — so this drives the
 * real path in a browser.
 *
 * wordiply is the turn-log family's first printer with **no board**: its page is
 * the log, so this makes a couple of guesses (one accepted, one rejected) before
 * printing, and asserts a non-empty `%PDF-` download. A board-less page that
 * still lays out is the thing most likely to break — an empty left column, a
 * log starting at a negative y — and a byte count is a coarse but real guard
 * against a renderer that throws or emits nothing.
 *
 * Solo club so it doesn't presence-pause with one viewer.
 */
test.describe('wordiply — print board', () => {
  test('the Print menu item downloads a non-empty PDF', async ({ browser }) => {
    const club = await createSoloClub('wplyp')
    const { id, gametype } = await createWordiplyGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)
    await expect(page.getByText('AR', { exact: true })).toBeVisible({ timeout: 20000 })

    // One accepted guess and one reject, so the printed log has both row kinds.
    await page.keyboard.type('hangars')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/1 \/ 5 guesses/)).toBeVisible({ timeout: 10000 })
    await page.keyboard.type('arqqqqq')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('table')).toContainText('ARQQQQQ', { timeout: 10000 })

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
