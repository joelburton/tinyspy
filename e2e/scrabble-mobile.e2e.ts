import { test, expect } from '@playwright/test'
import { createSoloClub, createScrabbleGame, setScrabbleRack } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * scrabble's mobile layout (docs/mobile.md → the psychicnum recipe, crosswords'
 * keyboard-required flavor): below the breakpoint the board fills the width and
 * the info column moves into an off-canvas sheet opened from the "Game info"
 * menu item. There is NO touch-entry mode — play stays on the keyboard cursor
 * (tap a square, type), so this is a layout for keyboard-attached devices.
 *
 * A browser test because the invariants are layout ones jsdom can't see. The
 * binding case is the PHONE, where the rack + controls can't share one line
 * (the rack bottoms out at 206px; the controls need ≈205px) and wrap to two
 * rows — the below-board reserve and --avail-h grow together, and the page
 * must still not scroll. Tablet portrait keeps the one-line row; we assert the
 * fit invariants at both widths, plus the info-sheet slide round-trip.
 */
test.describe('scrabble mobile', () => {
  for (const [w, h, tag] of [
    [375, 667, 'phone'],
    [820, 1180, 'tablet'],
  ] as const) {
    test(`board + rack + controls fit and the info sheet works at ${w}x${h} (${tag})`, async ({
      browser,
    }) => {
      const club = await createSoloClub(`sm${tag[0]}`)
      const game = await createScrabbleGame(club, 'coop')
      setScrabbleRack(game.id, ['C', 'A', 'T', 'S', 'E', 'R', 'O'])

      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        hasTouch: true,
        isMobile: true,
      })
      await signIn(ctx, club.members[0].session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)

      await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })
      const rack = page.locator('[data-zone="rack"]')
      await expect(rack).toBeVisible()

      // The page never scrolls (docs/ui.md → page fits the viewport) …
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        sh: document.documentElement.scrollHeight,
        iw: window.innerWidth,
        ih: window.innerHeight,
      }))
      expect(m.sw).toBeLessThanOrEqual(m.iw + 1)
      expect(m.sh).toBeLessThanOrEqual(m.ih + 1)

      // … and the board + the whole rack/controls block are on-screen. The
      // Submit button is the bottom-right of the controls row (its own second
      // row on the phone), so it's the binding below-board corner.
      const boardBox = (await page.locator('[data-board]').boundingBox())!
      expect(boardBox.x + boardBox.width).toBeLessThanOrEqual(m.iw + 1)
      const rackBox = (await rack.boundingBox())!
      expect(rackBox.y + rackBox.height).toBeLessThanOrEqual(m.ih + 1)
      const submit = page.getByRole('button', { name: 'Submit' })
      const submitBox = (await submit.boundingBox())!
      expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(m.ih + 1)

      // Info sheet: closed = off the right edge; opening from the menu slides it
      // in; the X slides it back off.
      const wrap = page.locator('[data-info-sheet]')
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
