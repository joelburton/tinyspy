import { test, expect, type Page } from '@playwright/test'
import {
  createSoloClub,
  createConnectionsGame,
  createGame,
  createWaffleGame,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * **A board tile is never a focus target.**
 *
 * The trap this guards, measured on three boards before it was fixed: clicking
 * a tile parks focus on it (a `<button>` takes focus on mousedown), and then the
 * NEXT keystroke promotes it to `:focus-visible` — the browser re-evaluates that
 * on any keyboard interaction, including one it acts on in no other way. The
 * result is a stray focus ring sitting on a tile long after the pointer left,
 * clearable only by clicking somewhere else, because Tab is swallowed on every
 * play surface and so can't move focus away either. Reported on the rank ladder
 * (2026-08-16); the same shape was live on connections, psychicnum and waffle.
 *
 * A focused tile is worse than cosmetic. It answers Space and Enter natively, so
 * it can fire a phantom move — connections carried a `preventDefault` for Enter
 * for exactly that reason, and left Space toggling the focused tile, which would
 * now fight the shuffle key.
 *
 * Two mechanisms, because waffle's tiles DRAG and a `preventDefault` on mousedown
 * stops `dragstart` firing at all (measured):
 *   - connections / psychicnum — `tabIndex={-1}` + `preventDefault` on mousedown,
 *     so the focus never lands;
 *   - waffle — `tabIndex={-1}` + `blur()` in the click/dragend handlers, handing
 *     focus straight back.
 * Either way the assertion is the same, which is why they share this test.
 *
 * Browser-only: jsdom has no `:focus-visible` heuristic and no real focus ring.
 */
async function clickTileThenType(page: Page, tileSel: string) {
  const tile = page.locator(tileSel).first()
  await tile.waitFor({ timeout: 20000 })
  await tile.click()
  // Any key does it — this is not about Tab. Typing a letter to keep playing is
  // enough, which is what made the bug so easy to hit.
  await page.keyboard.press('a')
  await page.waitForTimeout(250)
  // Move the pointer away so a lingering :hover can't be mistaken for focus.
  await page.mouse.move(2, 2)
  await page.waitForTimeout(150)
}

/** What has focus, and is it wearing a ring? */
const focusState = (page: Page, tileSel: string) =>
  page.evaluate((sel) => {
    const a = document.activeElement as HTMLElement | null
    return {
      onTile: a ? a.matches(sel) : false,
      focusVisible: a ? a.matches(':focus-visible') : false,
    }
  }, tileSel)

test('connections: clicking a tile leaves no focus behind, and Space shuffles', async ({
  browser,
}) => {
  const club = await createSoloClub('bfcn')
  const game = await createConnectionsGame(club)
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)

  await clickTileThenType(page, '[data-tile]')
  expect(await focusState(page, '[data-tile]')).toEqual({ onTile: false, focusVisible: false })

  // The tile IS still selected — the click did its job; only the focus went.
  await expect(page.locator('[data-tile][class*="selected"]')).toHaveCount(1)

  // SPACE shuffles: the same sixteen tiles, a new order.
  const order = () => page.$$eval('[data-tile]', (ts) => ts.map((t) => t.textContent).join(''))
  const before = await order()
  for (let i = 0; i < 8 && (await order()) === before; i++) {
    await page.keyboard.press(' ')
    await page.waitForTimeout(120)
  }
  expect(await order()).not.toBe(before)
  // …and shuffling is not a move: the selection survives it.
  await expect(page.locator('[data-tile][class*="selected"]')).toHaveCount(1)

  await ctx.close()
})

test('psychicnum: clicking a tile leaves no focus behind, and Space shuffles', async ({
  browser,
}) => {
  const club = await createSoloClub('bfpn')
  const game = await createGame(club)
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)

  const tiles = '[data-board] button:not([disabled])'
  await clickTileThenType(page, tiles)
  expect(await focusState(page, tiles)).toEqual({ onTile: false, focusVisible: false })

  const order = () => page.$$eval(tiles, (ts) => ts.map((t) => t.textContent).join(''))
  const before = await order()
  for (let i = 0; i < 8 && (await order()) === before; i++) {
    await page.keyboard.press(' ')
    await page.waitForTimeout(120)
  }
  expect(await order()).not.toBe(before)

  await ctx.close()
})

test('waffle: clicking a tile leaves no focus behind, and dragging still works', async ({
  browser,
}) => {
  const club = await createSoloClub('bfwf')
  const game = await createWaffleGame(club)
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)

  const tiles = 'button[class*="tile"]:not([disabled])'
  await clickTileThenType(page, tiles)
  expect(await focusState(page, tiles)).toEqual({ onTile: false, focusVisible: false })

  // The blur must not have cost waffle its drag: `dragstart` still fires. (This
  // is the assertion that stops someone "tidying" the blur into the mousedown
  // guard the other two boards use — that guard silently kills native drag.)
  await page.evaluate(() => {
    ;(window as unknown as { __dragged: boolean }).__dragged = false
    document.querySelectorAll('button[class*="tile"]').forEach((b) =>
      b.addEventListener('dragstart', () => {
        ;(window as unknown as { __dragged: boolean }).__dragged = true
      }),
    )
  })
  const all = page.locator(tiles)
  const a = await all.nth(0).boundingBox()
  const b = await all.nth(1).boundingBox()
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2)
  await page.mouse.down()
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 12 })
  await page.mouse.up()
  expect(await page.evaluate(() => (window as unknown as { __dragged: boolean }).__dragged)).toBe(
    true,
  )

  await ctx.close()
})
