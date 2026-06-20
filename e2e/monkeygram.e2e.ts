import { test, expect } from '@playwright/test'
import {
  createSoloClub,
  createClubWithMembers,
  createMonkeygramGame,
  saveMonkeygramBoard,
} from './helpers/fixtures'
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

    // The fixed 25×25 arena renders all its cells; the board opens centered on
    // the middle of the arena, so the center cell (12,12) must sit INSIDE the
    // viewport, not scrolled off-screen (the "blank PlayArea" regression).
    expect(await page.locator('[data-cell]').count(), 'all arena cells rendered').toBe(25 * 25)
    const center = page.locator('[data-cell][data-row="12"][data-col="12"]')
    await expect(center).toBeVisible()
    const cbox = await center.boundingBox()
    expect(cbox, 'center cell has a box').not.toBeNull()
    expect(cbox!.x, 'center cell is on screen (left)').toBeGreaterThanOrEqual(0)
    expect(cbox!.x, 'center cell is on screen (right)').toBeLessThan(vp.width)
    expect(cbox!.y, 'center cell is on screen (top)').toBeGreaterThanOrEqual(0)
    expect(cbox!.y, 'center cell is on screen (bottom)').toBeLessThan(vp.height)

    // At MAX zoom the grid is ~1600px wide — it must scroll inside the board
    // column, NOT widen it and push the hand off-screen. (Use the native value
    // setter so React's onChange actually fires.)
    await page.locator('input[type="range"]').evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, el.max)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const cellAtMax = await center.boundingBox()
    expect(cellAtMax!.width, 'zoom actually applied (cells got bigger)').toBeGreaterThan(cbox!.width)
    const handAtMax = await handTiles.first().boundingBox()
    expect(handAtMax, 'hand tile has a box at max zoom').not.toBeNull()
    expect(handAtMax!.x, 'hand stays on screen at max zoom').toBeLessThan(vp.width)
    expect(handAtMax!.x).toBeGreaterThanOrEqual(0)

    await ctx.close()
  })
})

/**
 * Persistence: a placed tile must survive a reload (debounced autosave →
 * monkeygram.save_player_board → reload → useGame restore).
 */
test.describe('monkeygram persistence', () => {
  test('a placed tile survives a reload', async ({ browser }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createMonkeygramGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()

    const saves: number[] = []
    page.on('response', (r) => {
      if (r.url().includes('save_player_board')) saves.push(r.status())
    })

    await page.goto(`/g/${game.gametype}/${game.id}`)

    // Place the first hand tile at the center cell via the keyboard cursor.
    const firstTile = page.locator('[data-zone="hand"] > *').first()
    await expect(firstTile).toBeVisible({ timeout: 15000 })
    const letter = (await firstTile.textContent())!.trim()
    const centerCell = page.locator('[data-cell][data-row="12"][data-col="12"]')
    await centerCell.click()
    await page.keyboard.type(letter)
    await expect(centerCell).toContainText(letter)

    // Wait out the debounced autosave, then reload — the tile must still be there.
    await page.waitForTimeout(1500)
    expect(saves.length, 'save_player_board was called').toBeGreaterThan(0)
    expect(saves.every((s) => s < 400), `save responses ok (${saves})`).toBe(true)

    await page.reload()
    await expect(
      page.locator('[data-cell][data-row="12"][data-col="12"]'),
      'tile survived the reload',
    ).toContainText(letter, { timeout: 15000 })

    await ctx.close()
  })
})

/**
 * Phase 4 win flow: emptying your hand enables Done; declaring ends the game
 * and pops the win modal (declare_done → is_terminal flip → useTerminalModal).
 */
test.describe('monkeygram win', () => {
  test('finishing your tiles wins the game', async ({ browser }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createMonkeygramGame(club)

    // Empty alice's hand server-side (all 15 tiles "placed") so Done is enabled
    // on load — placing 15 tiles through the UI is covered elsewhere and would
    // only make this test slow and flaky.
    await saveMonkeygramBoard(alice, game.id, {
      board: 'ABCDEFGHIJKLMNO' + '.'.repeat(25 * 25 - 15),
      hand: '',
    })

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    const done = page.getByRole('button', { name: 'Done — I finished!' })
    await expect(done).toBeEnabled({ timeout: 15000 })
    await done.click()

    // The terminal modal appears with the self-won verdict.
    await expect(page.getByText('You finished first!')).toBeVisible({ timeout: 15000 })

    await ctx.close()
  })
})

/**
 * The Phase 3 realtime signal: a peer's tiles-left count updating live in the
 * PeersStrip. A 2-player game presence-pauses unless both players are present,
 * so both browsers stay open; one player's board snapshot must tick the other's
 * peer count down.
 */
test.describe('monkeygram peer counts', () => {
  test("a peer's tiles-left count updates live", async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createMonkeygramGame(club, [alice.userId, bob.userId])

    const ctxA = await browser.newContext()
    await signIn(ctxA, alice.session)
    const pageA = await ctxA.newPage()
    const ctxB = await browser.newContext()
    await signIn(ctxB, bob.session)
    const pageB = await ctxB.newPage()
    await Promise.all([
      pageA.goto(`/g/${game.gametype}/${game.id}`),
      pageB.goto(`/g/${game.gametype}/${game.id}`),
    ])

    // Once both are present (so the game isn't paused), alice's PeersStrip shows
    // bob's row at his starting count (15 tiles dealt).
    const bobCount = pageA.locator(`[data-peer="${bob.userId}"] [data-count]`)
    await expect(bobCount).toHaveText('15', { timeout: 15000 })

    // Bob places two tiles (hand drops to 13) → alice's strip updates live.
    await saveMonkeygramBoard(bob, game.id, {
      board: 'AB' + '.'.repeat(25 * 25 - 2),
      hand: 'CDEFGHIJKLMNO', // 13 letters
    })
    await expect(bobCount).toHaveText('13')

    await ctxA.close()
    await ctxB.close()
  })
})
