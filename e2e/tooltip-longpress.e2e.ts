import { test, expect } from '@playwright/test'
import { createSoloClub, createWordleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * Long-press an icon-only button on touch to see what it does.
 *
 * Icon-only buttons carry their names in hover tooltips, and a touch device has
 * no hover — so a phone had no way to ask what a glyph meant. Holding one now
 * opens the same bubble.
 *
 * The assertion that matters is the SECOND one: lifting after a long press
 * still fires a click, so without swallowing it, holding a button to learn that
 * it says "Restart" would restart the game. A jsdom unit test covers the logic;
 * this covers the real thing — a browser synthesising its own click from a real
 * touch sequence, which is the part jsdom can only imitate.
 *
 * Playwright's `tap()` can't hold, so the press is dispatched over CDP.
 */
test('long-press names an icon-only button without pressing it', async ({ browser }) => {
  test.setTimeout(180_000)
  const club = await createSoloClub('lpress')
  const game = await createWordleGame(club, 'coop')
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await boardReady(page, page.locator('[data-board]').first())

  // On a phone the icon-only action row lives in the off-canvas info sheet, so
  // that's where the gesture actually happens — open it first.
  await page.getByRole('button', { name: 'Game info' }).click()
  await page.waitForTimeout(400)

  // "End game" — icon-only here, tooltipped, and the loudest possible detector:
  // a leaked click opens the end-game confirm.
  const target = page.locator('[data-tooltip="End game"]').first()
  await expect(target).toBeVisible({ timeout: 15000 })
  const label = 'End game'
  const box = (await target.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  // Press, hold past the threshold, release — the full gesture.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] })
  await page.waitForTimeout(700)
  await expect(page.getByText(label!, { exact: true })).toBeVisible({ timeout: 5000 })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  // …and the button it named did NOT fire: no end-game confirm opened.
  await page.waitForTimeout(500)
  await expect(
    page.getByText('This ends the game for everyone'),
    'holding End game must not try to end the game',
  ).toHaveCount(0)

  await ctx.close()
})
