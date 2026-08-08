import { test, expect } from '@playwright/test'
import { createSoloClub } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The ⌥` anagram finder, end to end: the REAL chord (Alt+Backquote — the
 * binding matches e.code, so this exercises the mac dead-key path the unit
 * tests can only simulate), the real `common.anagrams` RPC against the
 * imported dictionary, and the pin semantics from the feature's own spec:
 * "Acer" finds ACER and ACRE but never RACE.
 */
test('open with the chord, pin a letter, scroll a long list', async ({ browser }) => {
  const club = await createSoloClub('anagram')
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/c/${club.handle}`)

  // The chord races the shortcut listener's effect-time attach (the same
  // paint-vs-listening gap as typing races useCaptureKeys) — press until
  // the dialog demonstrably answers.
  const input = page.getByLabel('Letters to anagram')
  await expect(async () => {
    await page.keyboard.press('Alt+Backquote')
    await expect(input).toBeVisible({ timeout: 300 })
  }).toPass({ timeout: 10_000 })

  // The pinned example: capital A fixes position 1. fill() is atomic, so no
  // keystroke races, and case must survive to the RPC (pins mean case).
  await input.fill('Acer')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-word="acer"]')).toBeVisible()
  await expect(page.locator('[data-word="acre"]')).toBeVisible()
  await expect(page.locator('[data-word="race"]')).toHaveCount(0)

  // A wide query returns far more than the panel can show — the LIST must
  // scroll inside the fixed panel (not grow it).
  await input.fill('aeinrst')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-word="nastier"]')).toBeVisible()
  const list = page.locator('ul', { has: page.locator('[data-word="nastier"]') })
  const scrolls = await list.evaluate((el) => el.scrollHeight > el.clientHeight)
  expect(scrolls, 'the result list scrolls inside the panel').toBe(true)
  await page.screenshot({
    path: '/private/tmp/claude-501/-Users-joel-src-codenames/b3c9f78e-ea70-41c3-8229-a833b2334401/scratchpad/anagram-finder.png',
  })

  // Focus sits in the dialog's input — a non-game field — so the chord is
  // deliberately ignored there (it would type into a field elsewhere too);
  // Escape is the in-field close. The chord-as-toggle path is unit-tested.
  await page.keyboard.press('Escape')
  await expect(input).toHaveCount(0)

  await ctx.close()
})
