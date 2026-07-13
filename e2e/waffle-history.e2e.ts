import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, createWaffleGame, seedWaffleSwap } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Turn-history viewer for waffle. Clicking a swap-log #N replays that swap on the
 * board: the two moved cells ringed, the board wearing the "viewing" frame, and a
 * description banner over the below-board region. These are real overlay/layout
 * properties jsdom can't see, so this is a browser check — and it pins the
 * no-reflow invariant (the framed board must not resize) plus the click-to-exit
 * path (clicking the banner returns to live).
 *
 * A SOLO coop game (no presence-pause). One swap is seeded through the real RPC —
 * two already-correct cells, so it does NOT solve, leaving the game mid-play with
 * one #N handle in the log.
 */
const boardHeight = async (page: Page): Promise<number> => {
  const box = await page.locator('[class*="boardCol"]').first().boundingBox()
  if (!box) throw new Error('board has no bounding box')
  return box.height
}

test.describe('waffle turn-history viewer', () => {
  test('clicking a swap replays it (banner + frame), no reflow, clicks out', async ({
    browser,
  }) => {
    const club = await createSoloClub('wfh')
    const game = await createWaffleGame(club) // waffle_coop, solo, untimed
    await seedWaffleSwap(club.members[0], game.id) // one non-solving swap → log has #1

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })

    // The seeded swap logs a #N handle (the shared `[data-turn-number]`).
    const handles = page.locator('[data-turn-number]')
    await expect(handles).toHaveCount(1, { timeout: 15000 })
    const liveHeight = await boardHeight(page)

    // ── Open the viewer via the swap's handle: the banner appears over the
    // below-board region and the board must not reflow.
    await handles.first().click()
    const banner = page.locator('[title="Click to exit"]')
    await expect(banner).toBeVisible({ timeout: 10000 })
    expect(Math.abs((await boardHeight(page)) - liveHeight)).toBeLessThan(1)

    // ── Exit by clicking the banner (its onClick returns to live).
    await banner.click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Re-open, then exit by clicking elsewhere (the "Swaps" log heading) — the
    // document-level listener returns to live for any click off a #N handle.
    await handles.first().click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await page.getByRole('heading', { name: 'Swaps' }).click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    await ctx.close()
  })
})
