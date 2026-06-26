import { test, expect } from '@playwright/test'
import {
  createSoloClub,
  createClubWithMembers,
  createBananagramsGame,
  saveBananagramsBoard,
  getBananagramsTiles,
  drainBananagramsPool,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke test for the bananagrams play surface actually rendering ON SCREEN.
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
test.describe('bananagrams renders', () => {
  test('the dealt hand and the board are both on screen', async ({ browser }) => {
    // alice's own solo club + a solo game: only she's a player, so it won't
    // presence-pause when she's the sole viewer.
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createBananagramsGame(club)

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
 * bananagrams.save_player_board → reload → useGame restore).
 */
test.describe('bananagrams persistence', () => {
  test('a placed tile survives a reload', async ({ browser }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createBananagramsGame(club)

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
 * Peel — win path: with an empty hand and a dry bunch, peeling goes out and
 * wins (peel → is_terminal flip → useTerminalModal). We empty the hand by
 * placing alice's REAL tiles (the FE derives the hand by letter) and drain the
 * bunch so the peel can't refill.
 */
test.describe('bananagrams win', () => {
  test('peeling a dry bunch with an empty hand wins', async ({ browser }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createBananagramsGame(club)

    const tiles = await getBananagramsTiles(alice, game.id)
    await saveBananagramsBoard(alice, game.id, tiles + '.'.repeat(25 * 25 - tiles.length))
    drainBananagramsPool(game.id)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    const peel = page.getByRole('button', { name: /Peel/ })
    await expect(peel).toBeEnabled({ timeout: 15000 })
    await peel.click()

    // The terminal modal appears with the Bananas win verdict.
    await expect(page.getByText('Bananas! You went out first')).toBeVisible({ timeout: 15000 })

    await ctx.close()
  })
})

/**
 * Peel — continue path: with a full bunch, peeling deals a tile to EVERY
 * player. From the peeler's view their own hand gains a tile (live `tiles`
 * subscription) and a peer's count ticks up (progress realtime).
 */
test.describe('bananagrams peel draw', () => {
  test('peeling deals a tile to every player', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createBananagramsGame(club, [alice.userId, bob.userId])

    // Empty alice's hand by placing all her real tiles.
    const aliceTiles = await getBananagramsTiles(alice, game.id)
    await saveBananagramsBoard(alice, game.id, aliceTiles + '.'.repeat(25 * 25 - aliceTiles.length))

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

    // Both present (no pause). alice's hand is empty; bob shows 15 unplaced.
    const bobCount = pageA.locator(`[data-peer="${bob.userId}"] [data-count]`)
    await expect(bobCount).toHaveText('15', { timeout: 15000 })
    await expect(pageA.locator('[data-hand-tile]')).toHaveCount(0)

    // alice peels → everyone draws 1.
    await pageA.getByRole('button', { name: /Peel/ }).click()

    // alice's own hand gains the drawn tile; bob's count ticks 15 → 16.
    await expect(pageA.locator('[data-hand-tile]')).toHaveCount(1)
    await expect(bobCount).toHaveText('16')

    await ctxA.close()
    await ctxB.close()
  })
})

/**
 * Dump: dragging a hand tile onto the dump slot swaps it for DUMP_COUNT (3)
 * from the bunch — a net +2 to the hand, −2 to the bunch. Exercises the
 * drag-to-dump gesture + the dump RPC + the live re-derive of the hand.
 */
test.describe('bananagrams dump', () => {
  test('dumping a tile swaps it for three from the bunch', async ({ browser }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createBananagramsGame(club) // hand_size 15

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // Full hand (15); the bunch holds 144 − 15 = 129.
    await expect(page.locator('[data-hand-tile]')).toHaveCount(15, { timeout: 15000 })
    await expect(page.getByText('129 in bunch')).toBeVisible()

    // Drag the first hand tile onto the dump slot.
    const tile = page.locator('[data-hand-tile]').first()
    const dump = page.locator('[data-zone="dump"]')
    const t = await tile.boundingBox()
    const d = await dump.boundingBox()
    if (!t || !d) throw new Error('no bounding box for tile/dump')
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2)
    await page.mouse.down()
    await page.mouse.move(t.x + t.width / 2 + 12, t.y + t.height / 2 + 12) // pass drag threshold
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2) // over the dump slot
    await page.mouse.up()

    // Net +2 tiles in hand, −2 in the bunch.
    await expect(page.locator('[data-hand-tile]')).toHaveCount(17)
    await expect(page.getByText('127 in bunch')).toBeVisible()

    await ctx.close()
  })
})

/**
 * The Phase 3 realtime signal: a peer's tiles-left count updating live in the
 * PeersStrip. A 2-player game presence-pauses unless both players are present,
 * so both browsers stay open; one player's board snapshot must tick the other's
 * peer count down.
 */
test.describe('bananagrams peer counts', () => {
  test("a peer's tiles-left count updates live", async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createBananagramsGame(club, [alice.userId, bob.userId])

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

    // Bob places two tiles (15 held − 2 placed = 13 left) → alice's strip
    // updates live.
    await saveBananagramsBoard(bob, game.id, 'AB' + '.'.repeat(25 * 25 - 2))
    await expect(bobCount).toHaveText('13')

    await ctxA.close()
    await ctxB.close()
  })
})
