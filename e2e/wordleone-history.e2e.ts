// cs-unmet

import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, createWordleoneGame, seedWordleoneMisses } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * Turn-history viewer for wordleone. Clicking an event-log #N replays that
 * turn on the board: the starter, and below it the missed word as it looked
 * before it was sent — typed, uncolored, unringed — with the board wearing the
 * viewing frame and a banner over the below-board region. These are real
 * layout/overlay properties jsdom can't see, so this is a browser check — and
 * it pins the shared exit paths (keystroke / a board click / any click) and the
 * no-reflow invariant.
 *
 * A SOLO coop game, so there's no presence-pause to manage. Two misses are
 * seeded through the real RPC, so the page loads with a populated event log.
 */
const boardHeight = async (page: Page): Promise<number> => {
  const box = await page.locator('[data-board]').boundingBox()
  if (!box) throw new Error('board has no bounding box')
  return box.height
}

test.describe('wordleone turn-history viewer', () => {
  test('clicking a turn replays it (frame + the miss below the starter + banner), exits, no reflow', async ({
    browser,
  }) => {
    const club = await createSoloClub('w1h')
    const game = await createWordleoneGame(club)
    const words = await seedWordleoneMisses(club.members[0], game.id, 2)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await boardReady(page, page.locator('[data-board]'))

    const handles = page.locator('[data-history-handle]')
    await expect(handles).toHaveCount(2, { timeout: 15000 })
    const liveHeight = await boardHeight(page)

    // ── Open turn #2: the banner names it, the miss sits in the second row,
    // and the board must not reflow.
    await handles.nth(1).click()
    const banner = page.locator('[data-history-banner]')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner).toContainText(`Guess 2: ${words[1]}`)
    await expect(page.locator('[data-board] [role="row"]').nth(1)).toHaveText(words[1], { ignoreCase: true })
    await expect(Math.abs((await boardHeight(page)) - liveHeight)).toBeLessThan(1)

    // Switching turns without leaving the viewer.
    await handles.first().click()
    await expect(banner).toContainText(`Guess 1: ${words[0]}`)

    // ── Exit path A — a keystroke.
    await page.keyboard.press('a')
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Exit path B — clicking the board's wrapper (the framed grid is
    // click-through while viewing).
    await handles.first().click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await page.locator('[data-board]').locator('xpath=..').click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Exit path C — a click anywhere else.
    await handles.first().click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await page.getByRole('heading', { name: 'Guesses' }).click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    await ctx.close()
  })
})
