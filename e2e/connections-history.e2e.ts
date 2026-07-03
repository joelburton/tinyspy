import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, createConnectionsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Turn-history viewer for connections — the feature added on the (still monolithic)
 * PlayArea. connections's board MUTATES (a correct guess collapses 4 tiles into a
 * colored band), so the viewer uses the strictly-before boundary (like stackdown):
 * clicking a turn-log #N replays the board with the bands matched BEFORE that turn,
 * every other tile still on the grid, and that turn's 4 guessed tiles ringed in their
 * outcome color. These are real layout/overlay properties jsdom can't see — so a
 * browser check that also pins the shared exit paths + the no-reflow invariant.
 *
 * We make a CORRECT guess (the 4 A-words of the fixture puzzle): the novel case,
 * since those tiles are a colored BAND on the live board but the viewer shows them
 * as 4 green-ringed tiles on the grid (strictly-before — they haven't collapsed).
 * A SOLO coop game so there's no presence-pause to manage.
 */
const boardHeight = async (page: Page): Promise<number> => {
  const box = await page.locator('[data-board]').boundingBox()
  if (!box) throw new Error('board has no bounding box')
  return box.height
}

test.describe('connections turn-history viewer', () => {
  test('clicking a turn replays it (frame + ringed tiles + banner), exits, no reflow', async ({
    browser,
  }) => {
    const club = await createSoloClub('conn')
    const game = await createConnectionsGame(club, 'coop') // solo coop; fixture A/B/C/D puzzle
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // Guess the 4 A-words (a correct category), then Submit.
    for (const word of ['ALPHA', 'ANGEL', 'APPLE', 'ARROW']) {
      await page.getByRole('button', { name: word }).click()
    }
    await page.getByRole('button', { name: /submit/i }).click()

    // Turn #1 logs — the log's #N handle appearing is the "guess landed" signal.
    const handle = page.locator('[data-turn-number]')
    await expect(handle).toBeVisible({ timeout: 15000 })
    const liveHeight = await boardHeight(page)

    // ── Open the viewer via the turn's #N handle: the banner names the turn; the
    // board must not reflow (the banner overlays a fixed-height slot).
    await handle.click()
    const banner = page.locator('[title="Click to exit"]')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner).toContainText(/matched/i) // "Matched WORDS STARTING WITH A"
    await expect(Math.abs((await boardHeight(page)) - liveHeight)).toBeLessThan(1)

    // Visual capture — the yellow board frame, the 4 green-ringed A-word tiles (a
    // band on the live board, tiles here), the banner.
    await page.screenshot({
      path: '/private/tmp/claude-501/-Users-joel-src-codenames/ed6e8ac1-4791-48ee-b2cd-8a67974e2f37/scratchpad/conn-history-viewing.png',
      fullPage: true,
    })

    // ── Exit path A — a keystroke.
    await page.keyboard.press('Space')
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Exit path B — clicking the BOARD (the framed board is click-through).
    await handle.click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await page.locator('[data-board]').click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Exit path C — a click anywhere else (the "Guesses" log heading).
    await handle.click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await page.getByRole('heading', { name: 'Guesses' }).click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    await ctx.close()
  })
})
