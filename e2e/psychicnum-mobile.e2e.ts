import { test, expect } from '@playwright/test'
import { createSoloClub, createGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * psychicnum's mobile layout — the REFERENCE implementation the shared info-sheet
 * recipe (docs/mobile.md → "the psychicnum recipe") is named after, so a
 * regression in the shared pieces (`useInfoSheet` / `<InfoSheet>` /
 * `.mobileFill`) shows up here first. Every other converted game has a
 * `*-mobile.e2e.ts`; this closes the gap that the baseline game itself didn't.
 *
 * Input is tap-a-tile (touch-native): tapping a word tile picks it, and Submit
 * commits — no keyboard. We check, at a tall AND a short viewport, the invariants
 * jsdom can't: the board fills, the page never scrolls, the info sheet slides in
 * from the menu and back, and a touch-only guess (`.tap()`, no keystroke) locks
 * the tapped tile. That last step is the "psychicnum tap-tile → Submit locks the
 * tile" claim mobile.md makes.
 */
test.describe('psychicnum mobile', () => {
  for (const [w, h, tag] of [
    [390, 844, 'tall'],
    [375, 667, 'short'],
  ] as const) {
    test(`board fills, no scroll, info sheet + tap-to-guess at ${w}x${h}`, async ({ browser }) => {
      const club = await createSoloClub(`pn${tag[0]}`)
      const game = await createGame(club) // coop, solo → no presence-pause
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

      // Tap-to-guess, touch only: tap a tile to pick it, tap Submit to commit.
      // The tapped tile then locks (guessed → `disabled`, colored green/red) —
      // whether or not it was a secret, a committed guess disables its tile.
      const tile = page.locator('[data-board] button').first()
      await expect(tile).toBeEnabled()
      await tile.tap()
      await page.getByRole('button', { name: 'Submit' }).tap()
      await expect(tile).toBeDisabled()

      await ctx.close()
    })
  }
})
