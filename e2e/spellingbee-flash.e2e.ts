import { test, expect } from '@playwright/test'
import { createSoloClub, createSpellingbeeGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

test('spellingbee tile flash on click', async ({ browser }) => {
  const club = await createSoloClub('sbf')
  const game = await createSpellingbeeGame(club)
  const ctx = await browser.newContext({ viewport: { width: 500, height: 700 }, hasTouch: true })
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })
  // No flash overlay before any click.
  expect(await page.locator('[class*="hexFlash"]').count()).toBe(0)
  // Tap a hex (the center gold one), then the flash overlay should exist.
  const centerHex = page.getByRole('button', { name: /center letter/i })
  await centerHex.tap()
  expect(await page.locator('[class*="hexFlash"]').count()).toBe(1)
  await ctx.close()
})
