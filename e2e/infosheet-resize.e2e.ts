import { test, expect } from '@playwright/test'
import { createSoloClub, createGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The shared info-sheet's breakpoint-reset (useInfoSheet, docs/mobile.md): a
 * sheet opened on mobile must NOT come back already-open after a round trip up
 * to desktop width and back. The `isOpen` bit is closed on the mobile→desktop
 * crossing; this guards that, which only a real cross-900px viewport resize can
 * exercise (jsdom has no matchMedia). psychicnum is the reference recipe game.
 */
test('info sheet closes when the viewport crosses to desktop and back', async ({ browser }) => {
  const club = await createSoloClub('shrs')
  const game = await createGame(club) // psychicnum coop, solo → no presence-pause
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

  const wrap = page.locator('[data-info-sheet]')
  const xClosed = (await wrap.boundingBox())!.x

  // Open the sheet on mobile — slides in from the right (x drops toward 0).
  await page.getByRole('button', { name: 'Game menu' }).click()
  await page.getByText('Game info', { exact: true }).click()
  await page.waitForTimeout(300)
  const xOpen = (await wrap.boundingBox())!.x
  expect(xOpen).toBeLessThan(xClosed - 100)

  // Widen past the 900px breakpoint (desktop: the info column shows inline; the
  // wrapper is `display: contents`), then narrow back to the same phone size.
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(300)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400) // matchMedia re-render + the 160ms slide

  // The sheet is closed again — back off-canvas, NOT stuck open from before.
  expect((await wrap.boundingBox())!.x).toBeGreaterThan(xOpen + 100)

  await ctx.close()
})
