import { test, expect } from '@playwright/test'
import { createSoloClub, createWordleGame, seedWordleGuesses } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * wordle's mobile layout (docs/mobile.md → the psychicnum recipe): below the
 * breakpoint the board + on-screen keyboard fill the screen and the info column
 * moves into an off-canvas sheet opened from the "Game info" menu item.
 *
 * A browser test because the invariants are layout ones jsdom can't see, and the
 * binding case is a SHORT phone: wordle's board column is board + keyboard (no
 * other v3 game stacks a keyboard under the board), so the board must cap its
 * height or it pushes the keyboard off-screen. We assert at a tall AND a short
 * viewport that (a) the page never scrolls and (b) the whole keyboard stays on
 * screen, plus that the info sheet slides in from the menu and back out on close.
 */
test.describe('wordle mobile', () => {
  for (const [w, h, tag] of [
    [390, 844, 'tall'],
    [375, 667, 'short'],
  ] as const) {
    test(`board + keyboard fit and the info sheet works at ${w}x${h}`, async ({
      browser,
    }) => {
      const club = await createSoloClub(`wm${tag[0]}`)
      const game = await createWordleGame(club)
      await seedWordleGuesses(club.members[0], game.id, 2)
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        hasTouch: true,
        isMobile: true,
      })
      await signIn(ctx, club.members[0].session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)

      await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })
      const kb = page.getByLabel('Keyboard')
      await expect(kb).toBeVisible()

      // The page never scrolls (docs/ui.md → page fits the viewport) …
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        sh: document.documentElement.scrollHeight,
        iw: window.innerWidth,
        ih: window.innerHeight,
      }))
      expect(m.sw).toBeLessThanOrEqual(m.iw + 1)
      expect(m.sh).toBeLessThanOrEqual(m.ih + 1)
      // … and the whole keyboard is on-screen (the short-phone binding case).
      const kbBox = (await kb.boundingBox())!
      expect(kbBox.y + kbBox.height).toBeLessThanOrEqual(m.ih + 1)

      // Info sheet: closed = off the right edge; opening from the menu slides it
      // in; the X slides it back off.
      const wrap = page.locator('[class*="infoWrap"]')
      const xClosed = (await wrap.boundingBox())!.x
      await page.getByRole('button', { name: 'Game menu' }).click()
      await page.getByText('Game info', { exact: true }).click()
      await page.waitForTimeout(300) // the 160ms slide-in
      const xOpen = (await wrap.boundingBox())!.x
      expect(xOpen).toBeLessThan(xClosed - 100)
      await page.getByRole('button', { name: 'Close game info' }).click()
      await page.waitForTimeout(300)
      expect((await wrap.boundingBox())!.x).toBeGreaterThan(xOpen + 100)

      await ctx.close()
    })
  }
})
