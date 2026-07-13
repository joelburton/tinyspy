import { test, expect } from '@playwright/test'
import { createSoloClub, createBoggleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Boggle (MothCubes) mobile layout (docs/mobile.md → the shared info-sheet recipe): the
 * board fills the screen and the info column moves into an off-canvas sheet.
 * These layout invariants are exactly what jsdom can't see, so we check them at a
 * tall AND a short viewport: the board fills, the page never scrolls, and the info
 * sheet slides in from the menu and back out. A SOLO coop game — no presence-pause.
 */
test.describe('boggle mobile', () => {
  for (const [w, h, tag] of [
    [390, 844, 'tall'],
    [375, 667, 'short'],
  ] as const) {
    test(`board fills, no scroll, info sheet works at ${w}x${h}`, async ({ browser }) => {
      const club = await createSoloClub(`bg${tag[0]}`)
      const game = await createBoggleGame(club) // coop, solo
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
})
