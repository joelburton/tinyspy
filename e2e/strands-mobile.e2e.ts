import { test, expect } from '@playwright/test'
import { createSoloClub, createStrandsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * strands' mobile layout (docs/mobile.md → the shared info-sheet recipe): the
 * board fills the screen and the info column moves into an off-canvas sheet.
 * Input is tap-the-letters (touch-native); no keyboard, no drag.
 *
 * strands has the roster's **tallest board** — a portrait 6 wide × 8 tall — so
 * the thing worth guarding is the height budget, and specifically that the
 * board's FRAME is inside it. `.board` is `box-sizing: content-box` with
 * `0.9rem` of padding and a 2px border, so its outer box is ~2rem larger than
 * the size `--board-h` names; before `--board-frame` existed the sizing formula
 * budgeted only the inner box and a 390px phone got a 415px-wide board, i.e.
 * the page scrolled BOTH ways. That is exactly the class of bug jsdom cannot
 * see, so it's checked here at a tall AND a short viewport.
 *
 * The second spec covers the sheet with a LONG log — the recipe's own failure
 * mode is a flex child that won't shrink, which makes the whole sheet scroll
 * instead of the turn log's box.
 */
test.describe('strands mobile', () => {
  for (const [w, h, tag] of [
    [390, 844, 'tall'],
    [375, 667, 'short'],
  ] as const) {
    test(`board fills, no scroll, info sheet works at ${w}x${h}`, async ({ browser }) => {
      const club = await createSoloClub(`st${tag[0]}`)
      const game = await createStrandsGame(club) // coop, solo → no presence-pause
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        hasTouch: true,
        isMobile: true,
      })
      await signIn(ctx, club.members[0].session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)
      await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

      // The page never scrolls, in EITHER axis (docs/ui.md → page fits the
      // viewport). The width check is the one that caught the frame bug.
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        sh: document.documentElement.scrollHeight,
        iw: window.innerWidth,
        ih: window.innerHeight,
      }))
      expect(m.sw).toBeLessThanOrEqual(m.iw + 1)
      expect(m.sh).toBeLessThanOrEqual(m.ih + 1)

      // The board's OUTER box — frame included — is what has to fit, so measure
      // the bounding rect rather than the styled width.
      const board = (await page.locator('[data-board]').boundingBox())!
      expect(board.width).toBeLessThanOrEqual(w)
      // …and it should still be worth looking at: width-bound on a phone, so it
      // takes nearly all of it.
      expect(board.width).toBeGreaterThan(w * 0.85)

      // Info sheet: collapsed off the right edge → slides in from the menu →
      // back out on the ✕.
      const wrap = page.locator('[data-info-sheet]')
      const xClosed = (await wrap.boundingBox())!.x
      // Straight to the header's page-switch button — no game-menu detour.
      // "Game info" used to be a MENU ITEM and was folded into this one header
      // control (GamePage: "consolidating the old Game info menu item and the
      // sheet's ✕ into one control"), so opening the menu first only laid its
      // popover BACKDROP over the button this line wants. A race that bit under
      // full-suite load — waffle-mobile lost it on 2026-08-16.
      await page.getByRole('button', { name: 'Game info' }).click()
      await page.waitForTimeout(300)
      const xOpen = (await wrap.boundingBox())!.x
      expect(xOpen).toBeLessThan(xClosed - 100)
      await page.getByRole('button', { name: 'Back to board' }).click()
      await page.waitForTimeout(300)
      expect((await wrap.boundingBox())!.x).toBeGreaterThan(xOpen + 100)

      await ctx.close()
    })
  }

  test('a tapped trace commits, and a long log scrolls INSIDE the sheet', async ({ browser }) => {
    const club = await createSoloClub('stlog')
    const game = await createStrandsGame(club)
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    /** Tap a path, then submit with the move row's button.
     *
     *  Re-tapping the last letter used to submit and no longer does
     *  (2026-08-14) — it takes that letter back, like tapping any other tile
     *  in the trace. On a phone the Submit button is the only route, since
     *  there's no Enter key, which is most of why the button exists. */
    const trace = async (cs: ReadonlyArray<readonly [number, number]>) => {
      for (const [r, c] of cs) await page.locator(`[data-cell="${r},${c}"]`).tap()
      await page.getByRole('button', { name: 'Submit' }).tap()
      await page.waitForTimeout(80)
    }

    // Pad the log past what any sheet can show. Junk traces FIRST, while no tile
    // is consumed — a consumed tile ignores taps, by design (lib/trace.ts).
    for (let i = 0; i < 20; i++) await trace([[0, 0], [1, 1], [0, 2], [1, 3]])

    // Then a real find, all but the last word so the game stays in play (a solve
    // pops the celebration dialog over the menu).
    const traced = game.words.slice(0, -1)
    for (const word of traced) await trace(word.coords)
    // The verdict pill shows the LATEST submission, so assert on the last one.
    const last = traced[traced.length - 1].word.toUpperCase()
    await expect(page.getByText(`${last} — theme`)).toBeVisible()

    // Straight to the header's page-switch button — no game-menu detour.
    // "Game info" used to be a MENU ITEM and was folded into this one header
    // control (GamePage: "consolidating the old Game info menu item and the
    // sheet's ✕ into one control"), so opening the menu first only laid its
    // popover BACKDROP over the button this line wants. A race that bit under
    // full-suite load — waffle-mobile lost it on 2026-08-16.
    await page.getByRole('button', { name: 'Game info' }).click()
    await page.waitForTimeout(400)

    // The recipe's failure mode: a flex child that won't shrink makes the SHEET
    // scroll. It must be the turn log's own box that takes the overflow.
    const scroll = await page.evaluate(() => {
      const sheet = document.querySelector('[role="dialog"]') as HTMLElement
      const inner = [...sheet.querySelectorAll('*')].some(
        (n) => n.scrollHeight > n.clientHeight + 4 && getComputedStyle(n).overflowY !== 'visible',
      )
      return { sheetScrolls: sheet.scrollHeight > sheet.clientHeight + 4, inner }
    })
    expect(scroll.sheetScrolls).toBe(false)
    expect(scroll.inner).toBe(true)

    await ctx.close()
  })
})
