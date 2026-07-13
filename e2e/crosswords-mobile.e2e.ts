import { test, expect } from '@playwright/test'
import { createSoloClub, createCrosswordsGameSized } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * crosswords' mobile layout (docs/mobile.md): the grid + the active-clue bar
 * are the whole main view — grid maximized to the viewport width, the bar
 * (2 reserved lines on a tablet, 3 on a phone) directly under it — and the
 * clue lists + the check/reveal controls live in the off-canvas "Game info"
 * sheet. Keyboard-REQUIRED still holds: entry is typed (Playwright's
 * keyboard stands in for the tablet's attached one). We check the invariants
 * jsdom can't: no page scroll, width-bound grid sizing on a real 15×15
 * board, the bar under the grid, the sheet round-trip, and typed entry.
 */
test.describe('crosswords mobile', () => {
  for (const [w, h, tag, lines] of [
    [768, 1024, 'tablet', 2],
    [390, 844, 'phone', 3],
  ] as const) {
    test(`grid fills, bar under it (${lines} lines), sheet + typing work at ${w}x${h}`, async ({
      browser,
    }) => {
      const club = await createSoloClub(`xwm${tag[0]}`)
      const game = await createCrosswordsGameSized(club, 15)
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        hasTouch: true,
      })
      await signIn(ctx, club.members[0].session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)
      await expect(page.locator('[data-xw-cell]')).toHaveCount(225, { timeout: 20000 })

      // The page never scrolls (docs/ui.md → page fits the viewport).
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        sh: document.documentElement.scrollHeight,
        iw: window.innerWidth,
        ih: window.innerHeight,
      }))
      expect(m.sw).toBeLessThanOrEqual(m.iw + 1)
      expect(m.sh).toBeLessThanOrEqual(m.ih + 1)

      // The grid takes (nearly) the full width — width-bound sizing, no clue
      // columns beside it. Measured cell-edge to cell-edge on the top row.
      const first = (await page
        .locator('[data-xw-cell][data-row="0"][data-col="0"]')
        .boundingBox())!
      const last = (await page
        .locator('[data-xw-cell][data-row="0"][data-col="14"]')
        .boundingBox())!
      const gridWidth = last.x + last.width - first.x
      expect(gridWidth).toBeGreaterThan(w * 0.9)

      // The active-clue bar sits UNDER the grid, showing the cursor's clue
      // (the cursor seeds at 1-Across, whose fixture text is deliberately
      // long), reserved at 2 lines (tablet) / 3 lines (phone).
      const bar = page.locator('[data-active-clue]')
      await expect(bar).toContainText('deliberately long-winded')
      const barBox = (await bar.boundingBox())!
      const lastRow = (await page
        .locator('[data-xw-cell][data-row="14"][data-col="0"]')
        .boundingBox())!
      expect(barBox.y).toBeGreaterThan(lastRow.y + lastRow.height - 1)
      // ~22.7px per line + padding: 2 lines ≈ 50px, 3 ≈ 73px.
      if (lines === 2) expect(barBox.height).toBeLessThan(62)
      else expect(barBox.height).toBeGreaterThan(62)

      // Clue lists + controls: off-canvas until the menu opens the sheet.
      const sheet = page.locator('[data-info-sheet]')
      const xClosed = (await sheet.boundingBox())!.x
      expect(xClosed).toBeGreaterThanOrEqual(w - 5)
      await page.getByRole('button', { name: 'Game menu' }).click()
      await page.getByText('Game info', { exact: true }).click()
      await page.waitForTimeout(300)
      expect((await sheet.boundingBox())!.x).toBeLessThan(xClosed - 100)
      await expect(page.getByText('Across', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Check word' })).toBeVisible()
      await page.getByRole('button', { name: 'Close game info' }).click()
      await page.waitForTimeout(300)
      expect((await sheet.boundingBox())!.x).toBeGreaterThanOrEqual(w - 5)

      // Acting from inside the sheet auto-closes it, so the result lands on the
      // now-visible grid + active-clue bar instead of behind the sheet (M4). The
      // Check pill renders in the active-clue bar, which the full-width sheet
      // otherwise covers. Reopen, tap "Check word" → the sheet slides back off.
      const openSheet = async () => {
        await page.getByRole('button', { name: 'Game menu' }).click()
        await page.getByText('Game info', { exact: true }).click()
        await page.waitForTimeout(300)
        expect((await sheet.boundingBox())!.x).toBeLessThan(xClosed - 100)
      }
      await openSheet()
      await page.getByRole('button', { name: 'Check word' }).click()
      await page.waitForTimeout(300)
      expect((await sheet.boundingBox())!.x).toBeGreaterThanOrEqual(w - 5)

      // Tapping a clue in the sheet likewise closes it, so the moved cursor is
      // visible on the grid (L12). Any clue works — even the active one routes
      // through onClueClick → close.
      await openSheet()
      await sheet.locator('ol li').first().click()
      await page.waitForTimeout(300)
      expect((await sheet.boundingBox())!.x).toBeGreaterThanOrEqual(w - 5)

      // Keyboard entry still works (keyboard-required): click a cell, type.
      await page.locator('[data-xw-cell][data-row="0"][data-col="0"]').click()
      await page.keyboard.type('q')
      await expect(
        page.locator('[data-xw-cell][data-row="0"][data-col="0"]'),
      ).toContainText('Q')

      await ctx.close()
    })
  }
})
