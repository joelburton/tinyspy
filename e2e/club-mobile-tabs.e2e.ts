import { test, expect } from '@playwright/test'
import { createSoloClub } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * ClubPage's mobile view-switcher (docs/mobile.md → club-page tabs). Below the
 * breakpoint the two-column page folds to one column and a toggle bar picks
 * which column shows. These are `aria-pressed` toggle BUTTONS, not an ARIA tabs
 * pattern (see the comment in ClubPage.tsx) — so we assert the honest shape:
 * `role="button"` + `aria-pressed` flipping, and the CSS keyed on `aria-pressed`
 * (the un-pressed toggle takes the surface treatment) still switches the view.
 */
test('club mobile toggle: aria-pressed flips and switches the column', async ({ browser }) => {
  const club = await createSoloClub('cmt')
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/c/${club.handle}`)

  const newBtn = page.getByRole('button', { name: 'New game', exact: true })
  const yoursBtn = page.getByRole('button', { name: 'Your games', exact: true })
  await expect(newBtn).toBeVisible({ timeout: 20000 })

  // Default view is "New game" pressed, "Your games" not.
  await expect(newBtn).toHaveAttribute('aria-pressed', 'true')
  await expect(yoursBtn).toHaveAttribute('aria-pressed', 'false')

  // Tap "Your games" → the pressed state flips both ways.
  await yoursBtn.tap()
  await expect(yoursBtn).toHaveAttribute('aria-pressed', 'true')
  await expect(newBtn).toHaveAttribute('aria-pressed', 'false')

  // The CSS keyed on aria-pressed still distinguishes the two: the un-pressed
  // toggle takes the surface background, the pressed one the accent fill — so
  // their computed backgrounds differ (the view actually switched, visibly).
  const bg = (loc: typeof newBtn) =>
    loc.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await bg(newBtn)).not.toBe(await bg(yoursBtn))

  await ctx.close()
})
