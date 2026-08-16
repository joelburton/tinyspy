import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { createSoloClub, createSetgameGame } from './helpers/fixtures'
import { boardOf, claim, findSetOn } from './helpers/setgame'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * Smoke: setgame's "Print board (PDF)" menu item generates + downloads a real
 * PDF (brand HareTrigger). jsPDF's runtime is unreachable by the mocked
 * component tests, so this drives the real path in a browser.
 *
 * setgame's printout is THE LOG: per-player totals, then every claim and hint in
 * one sequence, each drawn as pictures of the cards (see `pdf/model.ts`). Like
 * every other print smoke in this suite it asserts a real PDF comes out, not
 * what is on it — the drawing is geometry, and pinning geometry from here would
 * cost more than it caught. What the cards actually look like on paper was
 * settled by rendering them and looking (`docs/pdf.md`).
 *
 * A set is claimed first so the totals have a number in them and the log has a
 * row, rather than only their empty states.
 */
test.describe('setgame — print board', () => {
  test('the Print menu item downloads a non-empty PDF', async ({ browser }) => {
    const club = await createSoloClub('sgp')
    const [alice] = club.members
    const { id, gametype } = await createSetgameGame(club)

    await claim(alice, id, findSetOn(await boardOf(alice, id))!)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)
    await boardReady(page, page.locator('button[class*="card"]').first())
    // `:visible` — the mobile status bar's copy of this row is in the DOM at
    // every width, hidden by CSS above the breakpoint (see setgame.e2e.ts).
    await expect(page.locator('[class*="counts"]:visible')).toContainText('Found: 1')

    await page.getByRole('button', { name: 'Game menu' }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByText('Print board (PDF)').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.pdf$/)
    const bytes = readFileSync(await download.path())
    expect(bytes.length, 'a real PDF, not an empty file').toBeGreaterThan(1000)
    expect(bytes.subarray(0, 5).toString('latin1'), 'PDF magic bytes').toBe('%PDF-')
  })
})
