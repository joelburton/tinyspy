import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, createStackdownGame, seedStackdownFirstWord } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Turn-history viewer for stackdown. Clicking a turn-log #N replays that word on
 * the board (the cleared tiles restored/highlighted at that point) behind the
 * "viewing" frame + a description banner. Real overlay/layout properties jsdom
 * can't see, so a browser check — pinning the no-reflow invariant and the
 * click-to-exit paths.
 *
 * A SOLO coop game (no presence-pause). The game is pinned to the known fixture
 * board and its first word (EAGLE) cleared through the real submit_word RPC, so
 * the log loads with one #N handle and the game stays mid-play (1 of 6 words).
 */
const boardHeight = async (page: Page): Promise<number> => {
  const box = await page.locator('[class*="boardCol"]').first().boundingBox()
  if (!box) throw new Error('board has no bounding box')
  return box.height
}

test.describe('stackdown turn-history viewer', () => {
  test('clicking a turn replays it (banner + frame), no reflow, clicks out', async ({
    browser,
  }) => {
    const club = await createSoloClub('sdh')
    const game = await createStackdownGame(club) // stackdown_coop, solo
    await seedStackdownFirstWord(club.members[0], game.id) // clears EAGLE → log has #1

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })

    // The cleared word logs a #N handle (the shared `[data-turn-number]`).
    const handles = page.locator('[data-turn-number]')
    await expect(handles).toHaveCount(1, { timeout: 15000 })
    const liveHeight = await boardHeight(page)

    // ── Open the viewer via the turn's handle: the banner appears; no reflow.
    await handles.first().click()
    const banner = page.locator('[title="Click to exit"]')
    await expect(banner).toBeVisible({ timeout: 10000 })
    expect(Math.abs((await boardHeight(page)) - liveHeight)).toBeLessThan(1)

    // ── Exit by clicking the banner (its onClick returns to live).
    await banner.click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Re-open, then exit by clicking elsewhere (the "Turns" log heading).
    await handles.first().click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await page.getByRole('heading', { name: 'Turns' }).click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    await ctx.close()
  })
})
