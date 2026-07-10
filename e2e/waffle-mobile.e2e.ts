import { test, expect } from '@playwright/test'
import { createSoloClub, createWaffleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * waffle's mobile layout (docs/mobile.md → the shared info-sheet recipe): the
 * square board fills the screen and the info column moves into an off-canvas
 * sheet. No board divergence — the board is min(--avail-w, --avail-h, cap), so it
 * fits a phone on its own. Input is tap-two-tiles-to-swap; drag (a desktop mouse
 * affordance) is OFF on touch. We check the invariants jsdom can't at a tall AND a
 * short viewport: board fills, page never scrolls, drag disabled, tap-swap works,
 * and the info sheet slides in from the menu and back out.
 */
test.describe('waffle mobile', () => {
  for (const [w, h, tag] of [
    [390, 844, 'tall'],
    [375, 667, 'short'],
  ] as const) {
    test(`board fills, no scroll, info sheet works at ${w}x${h}`, async ({ browser }) => {
      const club = await createSoloClub(`wf${tag[0]}`)
      const game = await createWaffleGame(club) // coop, solo → no presence-pause
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        hasTouch: true,
        isMobile: true,
      })
      await signIn(ctx, club.members[0].session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)
      await expect(page.locator('[role="grid"]')).toBeVisible({ timeout: 20000 })

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
      const grid = (await page.locator('[role="grid"]').boundingBox())!
      expect(grid.width).toBeGreaterThan(w * 0.9)

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

  test('touch input is tap-two-tiles (drag disabled); a swap commits', async ({ browser }) => {
    const club = await createSoloClub('wfswap')
    const game = await createWaffleGame(club)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[role="grid"]')).toBeVisible({ timeout: 20000 })

    // On touch, tiles are NOT draggable — the tap-swap model is the only input.
    const tileA = page.getByRole('button', { name: /^A / })
    const tileB = page.getByRole('button', { name: /^B / })
    expect(await tileA.getAttribute('draggable')).toBe('false')

    // Tap B (picks up — the bold ring) then A (swap). The fixture scramble is
    // "bacdef…" (B,A swapped vs the solution "abcdef…"), so swapping the first two
    // tiles restores A,B — and the swap lands in the log.
    await tileB.tap() // top-left cell holds 'B'
    await expect(tileB).toHaveAttribute('aria-pressed', 'true') // picked up
    await tileA.tap() // second tap → swap

    // The swap committed: open the info sheet and confirm the swap log is no
    // longer empty (the readout lives in the off-canvas sheet on mobile).
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByText('Game info', { exact: true }).click()
    await expect(page.getByText('No swaps yet.')).toBeHidden({ timeout: 10000 })

    await ctx.close()
  })
})
