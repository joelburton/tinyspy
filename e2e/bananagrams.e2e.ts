import { execFileSync } from 'node:child_process'
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
    const center = page.locator('[data-cell][data-x="12"][data-y="12"]')
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
    const centerCell = page.locator('[data-cell][data-x="12"][data-y="12"]')
    await centerCell.click()
    await page.keyboard.type(letter)
    await expect(centerCell).toContainText(letter)

    // Wait out the debounced autosave, then reload — the tile must still be there.
    await page.waitForTimeout(1500)
    expect(saves.length, 'save_player_board was called').toBeGreaterThan(0)
    expect(saves.every((s) => s < 400), `save responses ok (${saves})`).toBe(true)

    await page.reload()
    await expect(
      page.locator('[data-cell][data-x="12"][data-y="12"]'),
      'tile survived the reload',
    ).toContainText(letter, { timeout: 15000 })

    await ctx.close()
  })
})

/**
 * Peel — win path: with an empty hand and a dry bunch, peeling goes out and
 * wins (peel → is_terminal flip → the terminal verdict + celebration). We empty the hand by
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

    // The win verdict appears in the below-board pill…
    await expect(page.getByText('Bananas! You went out first').first()).toBeVisible({ timeout: 15000 })
    // …and the WINNER gets the celebration instead of the old game-over modal.
    // This is the one test that drives a REAL win, so it's the only place the
    // false→true flip `useCelebration` needs actually happens (a test that renders
    // straight into a finished game sees nothing, by design).
    await expect(page.getByRole('dialog', { name: 'Bananas! 🍌' })).toBeVisible({ timeout: 15000 })

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
    await expect(page.getByText('Bunch: 129')).toBeVisible()

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
    await expect(page.getByText('Bunch: 127')).toBeVisible()

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
    // Alice's [rt] console trail (realtimeDiag). This test is the original
    // lost-event suspect (docs/realtime-lost-events.md) and has only ever
    // failed inside full-suite runs — where nobody can rerun it under a
    // debugger — so it carries its own evidence: on failure, the trail says
    // whether the CDC event arrived (UI-side bug) or never did (lost after
    // attach — the still-unexplained route the deaf-window fix doesn't cover).
    const rtLines: string[] = []
    pageA.on('console', (m) => {
      const t = m.text()
      if (t.startsWith('[rt ')) rtLines.push(t)
    })
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
    // updates live. THROUGH HIS PAGE, not an RPC behind it: bob's open client
    // one-shot-autosaves its own (empty) board ~800ms after load
    // (usePlayerBoard's post-load setBoard re-fires the autosave effect), so
    // a server-side write races that flush and loses to bob's own empty
    // snapshot — which was exactly this test's long-standing "realtime"
    // flake. Placing via the UI is also simply what the test claims to test.
    const bobTiles = pageB.locator('[data-zone="hand"] > *')
    await expect(bobTiles.first()).toBeVisible({ timeout: 15000 })
    const l1 = (await bobTiles.nth(0).textContent())!.trim()
    const l2 = (await bobTiles.nth(1).textContent())!.trim()
    const cellA = pageB.locator('[data-cell][data-x="12"][data-y="12"]')
    const cellB = pageB.locator('[data-cell][data-x="13"][data-y="12"]')
    await cellA.click()
    await pageB.keyboard.type(l1)
    await expect(cellA).toContainText(l1) // echo-verified before moving on
    await cellB.click()
    await pageB.keyboard.type(l2)
    await expect(cellB).toContainText(l2)
    // Wall-clock of the placement, for aligning with the [rt] stamps — any
    // progress event delivered before this moment was page-mount noise.
    const savedAt = new Date().toTimeString().slice(0, 8) + '.' + String(Date.now() % 1000).padStart(3, '0')
    try {
      await expect(bobCount).toHaveText('13')
    } catch (err) {
      // Evidence dump before failing (this is the original lost-event
      // suspect; it fails too rarely to debug live, so the failure must
      // convict itself):
      //  - the server's row AT FAILURE TIME, read via psql before teardown —
      //    bob's page overwrites the board with its own empty snapshot on
      //    unmount, so a post-test read is contaminated;
      //  - the save's completion time;
      //  - alice's [rt] trail. An `event … bananagrams.progress` line AFTER
      //    savedAt means delivery worked and the UI is at fault; none means
      //    the event was LOST on a live channel.
      const serverRow = execFileSync(
        'psql',
        ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-tAX', '-c',
         `select user_id, unplaced from bananagrams.progress where game_id = '${game.id}';`],
        { encoding: 'utf8' },
      ).trim()
      console.log(`save committed at ${savedAt}; server progress rows AT FAILURE:\n${serverRow}`)
      console.log(`[rt] trail from alice's page at failure:\n${rtLines.join('\n')}`)
      throw err
    }

    await ctxA.close()
    await ctxB.close()
  })
})

/**
 * "New game" — the terminal action row's one stay-here option, also reachable
 * mid-game from the menu. Deals a FRESH bunch with this game's setup + roster
 * on a NEW row and navigates to it.
 *
 * There is deliberately no "Restart" twin: bananagrams has no puzzle to
 * re-run — the bunch is dealt at random and the whole game is the race to
 * consume it, so "again" can only mean a fresh deal.
 */
test.describe('bananagrams new game', () => {
  test('menu "New game" starts a FRESH game (new id, same setup)', async ({ browser }) => {
    const club = await createSoloClub('bgng')
    const game = await createBananagramsGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.getByRole('button', { name: /Peel/ })).toBeVisible({ timeout: 20000 })

    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'New game' }).click()
    // Mid-play, New game CONFIRMS first (it shelves the game in progress —
    // see NEW_GAME_CONFIRM); say yes and it proceeds.
    await page.getByRole('button', { name: 'Start new game' }).click()

    await page.waitForURL((u) => u.pathname.startsWith(`/g/${game.gametype}/`) &&
                                !u.pathname.endsWith(game.id), { timeout: 15000 })
    await expect(page.getByRole('button', { name: /Peel/ })).toBeVisible({ timeout: 20000 })
    await ctx.close()
  })
})

/**
 * The whole-table End — bananagrams' second exit, added alongside per-player
 * Concede in the 2026-08-01 status-line pass. The two are deliberately
 * different acts: conceding is a LOSS on your record and it takes every player
 * doing it to close a game the group has simply lost interest in; ending is the
 * table agreeing there's no result.
 *
 * Asserted through the UI rather than the RPC because the wiring is the part
 * that was missing (`buildGameMenu` offered End in coop only, and bananagrams
 * is compete — it needs the opt-in `offerEndInCompete`).
 */
test.describe('bananagrams end game', () => {
  test('the menu offers End alongside Concede, and it ends the table neutrally', async ({ browser }) => {
    const club = await createSoloClub('bgend')
    const game = await createBananagramsGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.getByRole('button', { name: /Peel/ })).toBeVisible({ timeout: 20000 })

    // Both exits present — the compete tail used to be Concede alone.
    await page.getByRole('button', { name: 'Game menu' }).click()
    await expect(page.getByRole('menuitem', { name: 'Concede game' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'End game' }).click()

    // Irreversible, so it asks first (the shared END_GAME_CONFIRM modal).
    await page.locator('[data-floating-panel]').getByRole('button', { name: 'End game' }).click()

    // Neutral terminal: the row offers New game + Back to club, and Peel is gone.
    await expect(page.getByRole('button', { name: /New game/ })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /Peel/ })).toBeHidden()
    await ctx.close()
  })
})
