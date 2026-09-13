// cs-blessed-simple-page

import { test, expect } from '@playwright/test'
import { createUnclaimedUser } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The claim-handle screen (first sign-in), reached by a signed-in user with NO
 * `common.profiles` row — `createUnclaimedUser`, not `createSoloClub`, since
 * claiming a username is the step under test.
 *
 * What it pins: **typing a username must not move the color selection.** The
 * color is seeded from the suggested handle once, at mount, and is the
 * player's from then on (`src/common/auth/doc.md`). A derivation that re-ran
 * per keystroke would be correct in isolation and still hop the swatch around
 * the palette while the player types in a different control, which is why
 * only a real render can check it.
 */
test('claim screen: typing a username leaves the color selection alone', async ({
  browser,
}) => {
  const { session } = await createUnclaimedUser('claim')

  const ctx = await browser.newContext()
  await signIn(ctx, session)
  const page = await ctx.newPage()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /set you up/i })).toBeVisible({
    timeout: 20000,
  })

  // Index of the pressed swatch (`ColorChoiceField` renders aria-pressed buttons).
  const swatches = page.locator('button[aria-pressed]')
  const selectedColor = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('button[aria-pressed]')].findIndex(
        (b) => b.getAttribute('aria-pressed') === 'true',
      ),
    )

  const before = await selectedColor()
  expect(before).toBeGreaterThanOrEqual(0) // something IS pre-selected

  await page.locator('input[type=text]').first().fill('')
  await page.keyboard.type('zebra')
  expect(await selectedColor()).toBe(before) // …and it didn't budge

  // The player still owns it: clicking a different swatch selects that one.
  const other = (before + 3) % (await swatches.count())
  await swatches.nth(other).click()
  expect(await selectedColor()).toBe(other)
  // …and it survives more typing.
  await page.keyboard.type('x')
  expect(await selectedColor()).toBe(other)

  await ctx.close()
})
