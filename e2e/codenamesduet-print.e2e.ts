import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { createClubWithMembers, createCodenamesduetGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke: codenamesduet's "Print board (PDF)" menu item generates + downloads a
 * real PDF. jsPDF's runtime is unreachable from the mocked component tests —
 * `pdf/model.test.ts` covers the shaping with no renderer — so this drives the
 * real path in a browser.
 *
 * Two players connect because a duet game presence-pauses with one viewer (the
 * board unmounts, and there'd be nothing to print).
 *
 * This is the MID-GAME view — 25 tiles each carrying the viewer's own key, which
 * is the state the printout exists for (thinking about clues away from a
 * screen). The terminal both-keys view shares the renderer and differs only by a
 * second inset per tile.
 */
test.describe('codenamesduet — print board', () => {
  test('the Print menu item downloads a non-empty PDF', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createCodenamesduetGame(club, alice.userId)

    const ctxs = []
    for (const m of [alice, bob]) {
      const ctx = await browser.newContext()
      await signIn(ctx, m.session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)
      ctxs.push({ ctx, page })
    }
    const page = ctxs[0].page
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    await page.getByRole('button', { name: 'Game menu' }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByText('Print board (PDF)').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.pdf$/)
    const bytes = readFileSync(await download.path())
    expect(bytes.length, 'a real PDF, not an empty file').toBeGreaterThan(1000)
    expect(bytes.subarray(0, 5).toString('latin1'), 'PDF magic bytes').toBe('%PDF-')

    for (const { ctx } of ctxs) await ctx.close()
  })
})
