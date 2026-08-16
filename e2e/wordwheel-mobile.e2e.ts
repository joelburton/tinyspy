import { test, expect } from '@playwright/test'
import { createSoloClub, createWordwheelGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Word Wheel (MooseWheel) mobile layout (docs/mobile.md → the shared info-sheet recipe): the
 * board fills the screen and the info column moves into an off-canvas sheet.
 * These layout invariants are exactly what jsdom can't see, so we check them at a
 * tall AND a short viewport: the board fills, the page never scrolls, and the info
 * sheet slides in from the menu and back out. A SOLO coop game — no presence-pause.
 */
test.describe('wordwheel mobile', () => {
  for (const [w, h, tag] of [
    [390, 844, 'tall'],
    [375, 667, 'short'],
  ] as const) {
    test(`board fills, no scroll, info sheet works at ${w}x${h}`, async ({ browser }) => {
      const club = await createSoloClub(`ww${tag[0]}`)
      const game = await createWordwheelGame(club) // coop, solo
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        hasTouch: true,
        isMobile: true,
      })
      await signIn(ctx, club.members[0].session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)
      await expect(page.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })

      // The page never scrolls (docs/ui.md → page fits the viewport).
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        sh: document.documentElement.scrollHeight,
        iw: window.innerWidth,
        ih: window.innerHeight,
      }))
      expect(m.sw).toBeLessThanOrEqual(m.iw + 1)
      expect(m.sh).toBeLessThanOrEqual(m.ih + 1)

      // The info column is off-canvas here, so the state unit (RankBar + Stats) is
      // mirrored ABOVE the wheel by the shared <MobileStatusBar> — the same two
      // components the sheet renders, so they can't drift. Its height is already
      // subtracted from the wheel's --avail-h, which is why the no-scroll
      // assertions above still hold.
      const statusBar = page.locator('[data-mobile-status]')
      // (The labels render uppercase via CSS; the DOM text is "Score" / "Words".)
      await expect(statusBar).toContainText('Score')
      await expect(statusBar).toContainText('Words')
      const barBox = (await statusBar.boundingBox())!
      // `_board_` (with the trailing underscore) is Wheel's own root — `_boardCol_`
      // is the column that CONTAINS the status bar, so a loose match would compare
      // the bar against its own parent.
      const wheelBox = (await page.locator('[class*="_board_"]').first().boundingBox())!
      expect(barBox.y + barBox.height).toBeLessThanOrEqual(wheelBox.y + 1)

      // Info sheet: collapsed off the right edge → slides in from the menu → back
      // out on the ✕.
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
})
