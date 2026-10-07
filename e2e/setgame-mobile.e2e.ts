// cs-unmet

import { test, expect } from '@playwright/test'
import { createSoloClub, createSetgameGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'
import { closeContextsAfterEach } from './helpers/contexts'

closeContextsAfterEach()

/**
 * setgame on a phone (docs/mobile.md). Three properties that only exist below
 * the breakpoint, and one that has to hold everywhere.
 *
 * The board TRANSPOSES in portrait — three columns growing downwards instead of
 * three rows growing right. That is not decoration: a deal adds a column, and
 * on a ~366px content width a six-column board would leave tiles around 50px.
 * Two games in three deal at least once, so this is the common path.
 *
 * The 18-tile cases are PLANTED. A board only grows when the dealt tiles happen
 * to hold no set (~3% of deals), so a spec that waited for one would test
 * nothing almost every run — and the layout it exercises is exactly the one
 * nobody would notice was broken.
 */
const TILES = 'button[data-tile]'

/** How far the page scrolls past the viewport, in each axis. */
async function overflow(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }))
}

/** Deal `n` tiles onto a live game by replaying its own deck — no invented
 *  state, just a longer opening deal — and rebuild the page blobs, which are
 *  what the page draws. */
async function dealTo(gameId: string, n: number): Promise<void> {
  const { execFileSync } = await import('node:child_process')
  execFileSync('psql', [
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    '-v', 'ON_ERROR_STOP=1', '-c',
    `update setgame.games
        set board = deck[1:${n}], deck_pos = ${n}
      where game_id = '${gameId}';
     select setgame._rebuild_data_cols('${gameId}', true);`,
  ])
}

test.describe('setgame — phone', () => {
  test('portrait: no letters, three columns, and the deal has room reserved', async ({
    browser,
  }) => {
    const club = await createSoloClub('sgm')
    const [alice] = club.members
    const { id, gametype } = await createSetgameGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/g/${gametype}/${id}`)
    await boardReady(page, page.locator(TILES).first())

    // The keyboard addresses come off — there is no keyboard to use them with,
    // and the row they sit in is height the board needs. Counted by whether
    // they OCCUPY SPACE rather than by whether they are in the DOM: the labels
    // are still rendered (the markup is shared with desktop), and it is the
    // reclaimed height that this is really about.
    const visibleLetters = await page.evaluate(() =>
      [...document.querySelectorAll('span')]
        .filter((s) => /^[A-Z]$/.test(s.textContent ?? '') && s.getBoundingClientRect().height > 0)
        .length)
    expect(visibleLetters, 'no letters on a phone').toBe(0)

    const twelve = await page.evaluate((sel) => {
      const tiles = [...document.querySelectorAll(sel)]
      const top = tiles[0].getBoundingClientRect()
      // Three columns means tiles 0,1,2 share a row: same top, rising left.
      return {
        width: Math.round(top.width),
        perRow: tiles.filter((c) => Math.abs(c.getBoundingClientRect().top - top.top) < 2).length,
        scrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollsY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      }
    }, TILES)

    expect(twelve.perRow, 'transposed: three columns, not four').toBe(3)
    expect(twelve.scrollsX, 'the page never scrolls sideways').toBe(false)
    expect(twelve.scrollsY, 'nor down').toBe(false)


    // Now the deal that two games in three reach. The tiles must NOT resize:
    // the space for eighteen is reserved from the start, so a deal adds a row
    // into room that was already there.
    await dealTo(id, 18)
    await expect(page.locator(TILES)).toHaveCount(18, { timeout: 15000 })

    const eighteen = await page.evaluate((sel) => {
      const tiles = [...document.querySelectorAll(sel)]
      const top = tiles[0].getBoundingClientRect()
      return {
        width: Math.round(top.width),
        perRow: tiles.filter((c) => Math.abs(c.getBoundingClientRect().top - top.top) < 2).length,
        scrollsY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      }
    }, TILES)

    expect(eighteen.width, 'a deal does not resize the tiles').toBe(twelve.width)
    expect(eighteen.perRow).toBe(3)
    expect(eighteen.scrollsY, 'eighteen tiles still fit the viewport').toBe(false)
  })

  test('the twenty-one-tile board fits rather than overflowing', async ({ browser }) => {
    // ~1 in a million games, so nobody will ever report this — which is why it
    // is planted. Twenty-one is a HARD ceiling (a set-free collection tops out
    // at 20 tiles), so this is the widest board that can exist; it shrinks its
    // tiles to fit rather than breaking the page's no-scroll invariant.
    const club = await createSoloClub('sg21')
    const [alice] = club.members
    const { id, gametype } = await createSetgameGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)
    await boardReady(page, page.locator(TILES).first())

    await dealTo(id, 21)
    await expect(page.locator(TILES)).toHaveCount(21, { timeout: 15000 })

    // Measured against the SAME page at twelve tiles rather than against zero:
    // every game in the repo overflows by 1px at 900px tall (a rounding
    // artifact in the shared layout, not this board's doing), so an absolute
    // "no overflow" assertion would fail on a page that is fine. What must hold
    // is that the widest board this game can produce adds nothing to it.
    for (const size of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size)
      await page.waitForTimeout(300)

      await dealTo(id, 12)
      await expect(page.locator(TILES)).toHaveCount(12, { timeout: 15000 })
      const base = await overflow(page)

      await dealTo(id, 21)
      await expect(page.locator(TILES)).toHaveCount(21, { timeout: 15000 })
      const big = await overflow(page)

      expect(big.x, `21 tiles add no sideways scroll at ${size.width}px`).toBe(base.x)
      expect(big.y, `21 tiles add no vertical scroll at ${size.height}px`).toBe(base.y)
    }
  })
})
