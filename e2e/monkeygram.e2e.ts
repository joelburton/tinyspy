import { test, expect } from '@playwright/test'
import { createSoloClub, createMonkeygramGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke test for the MonkeyGram play surface actually rendering ON SCREEN.
 *
 * The bug this guards against: a layout regression left the PlayArea blank
 * with no console error — the oversized padded board canvas ballooned the
 * board column, pushing the hand column off-screen and leaving only empty
 * canvas padding visible. `toBeVisible()` alone wouldn't catch it (an
 * off-screen element is still "visible"), so we assert the elements'
 * bounding boxes fall inside the viewport.
 *
 * Solo club (one member) so the game doesn't presence-pause (which would
 * unmount the play area and is a different code path).
 */
test.describe('monkeygram renders', () => {
  test('the dealt hand and the board are both on screen', async ({ browser }) => {
    // alice's own solo club + a solo game: only she's a player, so it won't
    // presence-pause when she's the sole viewer.
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createMonkeygramGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    const vp = page.viewportSize()
    if (!vp) throw new Error('no viewport size')

    // The hand was dealt 15 tiles — they must render in the right column,
    // and the column must be on screen (not pushed off to the right).
    const handTiles = page.locator('[data-zone="hand"] > *')
    await expect(handTiles).toHaveCount(15, { timeout: 15000 })
    const handBox = await handTiles.first().boundingBox()
    expect(handBox, 'first hand tile has a box').not.toBeNull()
    expect(handBox!.x, 'hand is on screen (not pushed off the right)').toBeLessThan(vp.width)
    expect(handBox!.x).toBeGreaterThanOrEqual(0)

    // The board renders a grid of cells, and the origin cell (0,0) — what
    // recenter frames — must sit INSIDE the viewport, not scrolled off into the
    // off-screen part of the grid (the "blank PlayArea" regression).
    expect(await page.locator('[data-cell]').count(), 'board cells rendered').toBeGreaterThan(100)
    const origin = page.locator('[data-cell][data-row="0"][data-col="0"]')
    await expect(origin).toBeVisible()
    const obox = await origin.boundingBox()
    expect(obox, 'origin cell has a box').not.toBeNull()
    expect(obox!.x, 'origin cell is on screen (left)').toBeGreaterThanOrEqual(0)
    expect(obox!.x, 'origin cell is on screen (right)').toBeLessThan(vp.width)
    expect(obox!.y, 'origin cell is on screen (top)').toBeGreaterThanOrEqual(0)
    expect(obox!.y, 'origin cell is on screen (bottom)').toBeLessThan(vp.height)

    await ctx.close()
  })
})
