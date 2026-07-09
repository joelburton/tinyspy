import { test, expect } from '@playwright/test'
import { createClubWithMembers } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Touch/phone behavior of FloatingPanel (docs/mobile.md → "Panels on touch").
 * These need a real browser — jsdom has no layout engine, no touch synthesis,
 * and no visualViewport — so this is the second exception to the suite's "not
 * for UI" scope, alongside codenamesduet's layout guard. Covered:
 *
 *   1. On a phone the panel is a FULL-SCREEN sheet, not a floating card.
 *   2. Tapping the header X closes it (regression guard for the touch bug where
 *      react-draggable's preventDefault on the header touchstart killed the
 *      synthesized click — fixed by forcing panels non-draggable on coarse).
 *   3. The chat input's font is >= 16px (else iOS focus-zooms the page wider).
 *   4. `reserveKeyboard` sizes the sheet to the visual viewport, so it stays
 *      clear of the on-screen keyboard (verified by mocking a shrunk viewport).
 *
 * The chat panel is the reachable FloatingPanel that needs no game — it opens
 * straight from the club page.
 */
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

test.describe('panels on touch', () => {
  // A phone: narrow width (< the 34rem --phone line) + a real touchscreen, so
  // the coarse-pointer + --phone CSS paths both engage.
  test.use(PHONE)

  test('chat opens as a full-screen sheet; input meets the 16px floor; X closes it', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice] = club.members

    const ctx = await browser.newContext(PHONE)
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
    // Full-bleed with no keyboard: origin (0,0), spanning the whole viewport
    // (safe-area insets resolve to 0 in headless; visual viewport == layout).
    expect(box!.x).toBeLessThanOrEqual(1)
    expect(box!.y).toBeLessThanOrEqual(1)
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1)
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 1)

    // No static keyboard reserve any more: with no keyboard the input sits near
    // the very bottom of the sheet (not floated up by a reserved strip).
    const input = page.getByRole('textbox')
    const inputBox = await input.boundingBox()
    expect(inputBox).not.toBeNull()
    expect(viewport.height - (inputBox!.y + inputBox!.height)).toBeLessThan(100)

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

  test('chat sheet clamps to the visual viewport (stays clear of the keyboard)', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice] = club.members

    const ctx = await browser.newContext(PHONE)
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()

    // Simulate an open keyboard: force `window.visualViewport` to report a
    // shrunk visible region (as iOS does when the keyboard is up). Installed
    // before any app script runs, so the panel reads the shrunk height.
    const VISIBLE = 480 // of the 844 tall viewport → a ~360px "keyboard"
    await page.addInitScript((visible) => {
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: {
          height: visible,
          width: window.innerWidth,
          offsetTop: 0,
          offsetLeft: 0,
          pageTop: 0,
          pageLeft: 0,
          scale: 1,
          addEventListener() {},
          removeEventListener() {},
        },
      })
    }, VISIBLE)

    await page.goto(`/c/${club.handle}`)
    await page.getByRole('button', { name: 'Open chat', exact: true }).tap()

    const panel = page.locator('[class*="_rnd_"]')
    await expect(panel).toBeVisible()
    const box = await panel.boundingBox()
    expect(box).not.toBeNull()
    // The sheet is clamped to the visible region, NOT the full 844 layout height.
    expect(box!.height).toBeLessThanOrEqual(VISIBLE + 1)
    expect(box!.height).toBeGreaterThan(VISIBLE - 60) // filled it (minus header chrome)

    // The input must sit within the visible region — never behind the keyboard.
    const inputBox = await page.getByRole('textbox').boundingBox()
    expect(inputBox).not.toBeNull()
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(VISIBLE + 1)

    await ctx.close()
  })
})
