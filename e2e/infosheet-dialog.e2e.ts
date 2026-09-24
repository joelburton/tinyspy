// cs-unmet

import { test, expect } from '@playwright/test'
import { createSoloClub, createGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The shared info-sheet's dialog semantics (docs/mobile.md → The info-sheet
 * recipe; the "cheap half" of dialog behavior): when open on
 * mobile the sheet is a `role="dialog"` and Escape dismisses it. Focus-trap /
 * tap-outside are deliberately NOT done, so we don't assert them. psychicnum is
 * the reference recipe game.
 */
test('open info sheet is a dialog and closes on Escape', async ({ browser }) => {
  const club = await createSoloClub('shdlg')
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

  // Open the sheet → slides in AND becomes a dialog.
  // Straight to the header's page-switch button — no game-menu detour.
  // There is no "Game info" menu item: the header's switch button
  // (InfoSwitchButton) is the one way between the two mobile pages, so opening
  // the menu first only laid its popover BACKDROP over the button this line
  // wants. A race that bit under full-suite load — waffle-mobile lost it on
  // 2026-08-16.
  await page.getByRole('button', { name: 'Game info' }).click()
  await page.waitForTimeout(300)
  const xOpen = (await wrap.boundingBox())!.x
  expect(xOpen).toBeLessThan(xClosed - 100)
  await expect(wrap).toHaveAttribute('role', 'dialog')
  await expect(wrap).toHaveAttribute('aria-modal', 'true')

  // Escape dismisses it — back off-canvas.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  expect((await wrap.boundingBox())!.x).toBeGreaterThan(xOpen + 100)

  await ctx.close()
})
