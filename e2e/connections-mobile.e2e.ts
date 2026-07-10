import { test, expect } from '@playwright/test'
import { createSoloClub, createConnectionsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * connections's mobile layout (docs/mobile.md → the shared info-sheet recipe): the
 * board fills the screen and the info column moves into an off-canvas sheet. Input
 * is tap-a-tile (touch-native); no keyboard, no drag. The one below-board control
 * row (mistakes readout + Clear/Submit) goes phone-tight: icon-only buttons + a
 * shortened "Mistakes" label. We check the invariants jsdom can't at a tall AND a
 * short viewport: board fills, page never scrolls, the sheet works, and a tapped
 * 4-tile guess commits.
 *
 * The fixture puzzle's rank-0 category is the four A-words ALPHA/ANGEL/APPLE/ARROW,
 * so tapping those + Submit is a known-correct guess.
 */
test.describe('connections mobile', () => {
  for (const [w, h, tag] of [
    [390, 844, 'tall'],
    [375, 667, 'short'],
  ] as const) {
    test(`board fills, no scroll, info sheet works at ${w}x${h}`, async ({ browser }) => {
      const club = await createSoloClub(`cn${tag[0]}`)
      const game = await createConnectionsGame(club) // coop, solo → no presence-pause
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        hasTouch: true,
        isMobile: true,
      })
      await signIn(ctx, club.members[0].session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)
      await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

      // The page never scrolls (docs/ui.md → page fits the viewport).
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        sh: document.documentElement.scrollHeight,
        iw: window.innerWidth,
        ih: window.innerHeight,
      }))
      expect(m.sw).toBeLessThanOrEqual(m.iw + 1)
      expect(m.sh).toBeLessThanOrEqual(m.ih + 1)

      // Board fills most of the width (no info column beside it on mobile).
      const board = (await page.locator('[data-board]').boundingBox())!
      expect(board.width).toBeGreaterThan(w * 0.9)

      // Info sheet: collapsed off the right edge → slides in from the menu → back
      // out on the ✕.
      const wrap = page.locator('[data-info-sheet]')
      const xClosed = (await wrap.boundingBox())!.x
      await page.getByRole('button', { name: 'Game menu' }).click()
      await page.getByText('Game info', { exact: true }).click()
      await page.waitForTimeout(300)
      const xOpen = (await wrap.boundingBox())!.x
      expect(xOpen).toBeLessThan(xClosed - 100)
      await page.getByRole('button', { name: 'Close game info' }).click()
      await page.waitForTimeout(300)
      expect((await wrap.boundingBox())!.x).toBeGreaterThan(xOpen + 100)

      await ctx.close()
    })
  }

  test('tap four tiles + Submit commits a guess', async ({ browser }) => {
    const club = await createSoloClub('cnguess')
    const game = await createConnectionsGame(club)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // Tap the four A-words (the rank-0 category), then the icon-only Submit.
    for (const w of ['ALPHA', 'ANGEL', 'APPLE', 'ARROW']) {
      await page.getByRole('button', { name: w, exact: true }).tap()
    }
    await page.getByRole('button', { name: 'Submit' }).tap()

    // A correct guess resolves the category into a full-width band on the board.
    // (Scope to the board — the name also appears in the sheet's turn log.)
    await expect(
      page.locator('[data-board]').getByText('Words starting with A'),
    ).toBeVisible({ timeout: 10000 })

    await ctx.close()
  })
})
