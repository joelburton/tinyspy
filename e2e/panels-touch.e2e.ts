import { test, expect } from '@playwright/test'
import { createClubWithMembers } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Touch/phone behavior of FloatingPanel (docs/mobile.md → "Panels on touch").
 * Two things are unreachable in jsdom (no layout engine, no touch synthesis) and
 * so must be checked in a real browser — the second exception to this suite's
 * "not for UI" scope, alongside codenamesduet's layout guard:
 *
 *   1. On a phone the panel is a FULL-SCREEN sheet, not a floating card.
 *   2. Tapping the header X closes it — the regression guard for the touch bug
 *      where react-draggable's `preventDefault` on the header touchstart killed
 *      the synthesized click, so the X never fired. Forcing panels
 *      non-draggable on a coarse pointer removes the drag binding and fixes it.
 *
 * The chat panel is the reachable FloatingPanel that needs no game — it opens
 * straight from the club page.
 */
test.describe('panels on touch', () => {
  // A phone: narrow width (< the 34rem --phone line) + a real touchscreen, so
  // the coarse-pointer + --phone CSS paths both engage.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('chat opens as a keyboard-reserving sheet and the X closes it on tap', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice] = club.members

    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    // Open chat by tapping its bubble (touch input, no click).
    await page.getByRole('button', { name: 'Open chat', exact: true }).tap()

    // The panel's react-rnd root becomes a full-screen sheet — the @media
    // (--phone) override cancels react-rnd's floating position/size. On desktop
    // this same panel is a centered 340-wide card.
    const panel = page.locator('[class*="_rnd_"]')
    await expect(panel).toBeVisible()
    const box = await panel.boundingBox()
    const viewport = page.viewportSize()!
    expect(box).not.toBeNull()
    // Full-bleed: origin (0,0), spanning the whole viewport (safe-area insets
    // resolve to 0 in headless Chromium).
    expect(box!.x).toBeLessThanOrEqual(1)
    expect(box!.y).toBeLessThanOrEqual(1)
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1)
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 1)

    // The point of `reserveKeyboard`: the sheet fills the screen, but its body is
    // padded up so the INPUT sits a keyboard-height above the bottom, staying
    // above where the on-screen keyboard appears. Assert a substantial gap below
    // the input (qualitative, so tuning var(--keyboard-reserve) doesn't break the
    // test).
    const input = page.getByRole('textbox')
    const inputBox = await input.boundingBox()
    expect(inputBox).not.toBeNull()
    const gapBelowInput = viewport.height - (inputBox!.y + inputBox!.height)
    expect(gapBelowInput).toBeGreaterThan(200) // keyboard-sized reserve is present

    // The chat input's font must be >= 16px on touch, or iOS focus-zooms the page
    // (making the sheet wider than the screen). Guards the regression even though
    // the zoom itself is iOS-only and unobservable headless.
    const fontPx = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(fontPx).toBeGreaterThanOrEqual(16)

    // The bug under guard: tapping the header X (aria-label "Close", distinct
    // from the bubble's "Close chat" toggle) must actually dismiss the panel.
    await page.getByRole('button', { name: 'Close', exact: true }).tap()
    await expect(panel).toBeHidden()

    await ctx.close()
  })
})
