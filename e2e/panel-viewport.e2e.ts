// cs-unmet

import { test, expect, type Page } from '@playwright/test'
import { createClubWithMembers, createBoggleGame } from './helpers/fixtures'
import { startGameRow } from './helpers/clubPage'
import { signIn } from './helpers/session'

/**
 * A floating panel must stay REACHABLE when the viewport changes under it —
 * the window is resized, a tablet rotates (`useReclampOnResize`;
 * plans/areas/floating-panels.md → `ephemeral-panels-dont-reclamp`).
 *
 * This existed for the panels that PERSIST their rect and for no others, which
 * put the protection on the ones needing it least: chat and the scratchpad were
 * watched, while every dialog and modal clamped once on mount and then stopped
 * listening. There is no recovery from a panel you cannot reach except reloading.
 *
 * ⚠️ The first case must use a panel with NO `persistKey` — a blocking modal —
 * or it tests the path that already worked. And note it does not need to be
 * dragged anywhere: a centered panel is off-screen the moment the window is
 * narrower than the panel, which is why "it clamped once on mount" was never the
 * same claim as "it is on screen".
 *
 * The rule the cases below pin: **a resize re-centers a floating panel unless it
 * REMEMBERS where you put it.** So both modal families re-center — including
 * `modal-normal`, which you CAN drag, because it always opens centered and never
 * saves a position, so shoving one aside is a transient act rather than a
 * placement — while a companion, which does remember, stays exactly where you
 * left it.
 */
test.describe('floating panels and the viewport', () => {
  const panel = (page: Page) => page.locator('[data-floating-panel]').first()

  test('an EPHEMERAL panel is pulled back when the window shrinks', async ({ browser }) => {
    const club = await createClubWithMembers(['ada', 'bea'])
    const game = await createBoggleGame(club)
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    await page.getByRole('button', { name: 'End game' }).first().click()
    await panel(page).waitFor({ timeout: 8000 })

    await page.setViewportSize({ width: 600, height: 500 })
    await page.waitForTimeout(400)

    const b = (await panel(page).boundingBox())!
    // Measured without the listener: x stays 390 and the right edge lands at
    // 810 on a 600px viewport — 210px of a modal you cannot reach.
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.y).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(600)
    expect(b.y + b.height).toBeLessThanOrEqual(500)

    // And it is RE-CENTERED, not merely shoved inside. This panel cannot be
    // dragged, so its position was never anyone's choice — clamping put a modal
    // whose whole identity is "centered" flush against the right margin (x=172
    // where centered is 90).
    expect(b.x).toBeCloseTo((600 - b.width) / 2, 0)
  })

  test('a modal-normal re-centers even though you CAN drag it', async ({ browser }) => {
    const club = await createClubWithMembers(['ada', 'bea'])
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await startGameRow(page, /MothCubes/i).click()
    await panel(page).waitFor({ timeout: 8000 })
    await page.waitForTimeout(700)

    const bar = (await page.locator('[data-floating-panel] > div').first().boundingBox())!
    await page.mouse.move(bar.x + 60, bar.y + 10)
    await page.mouse.down()
    await page.mouse.move(bar.x + 260, bar.y + 120, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(300)

    await page.setViewportSize({ width: 1000, height: 800 })
    await page.waitForTimeout(400)
    const after = (await panel(page).boundingBox())!
    // Dragged to 560 on a 1200 viewport; back to dead center at 1000.
    expect(after.x).toBeCloseTo((1000 - after.width) / 2, 0)
  })

  test('a panel that REMEMBERS keeps where you put it', async ({ browser }) => {
    const club = await createClubWithMembers(['ada', 'bea'])
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await page.getByRole('button', { name: /^Open chat/ }).first().click()
    await panel(page).waitFor({ timeout: 8000 })

    const bar = (await page.locator('[data-floating-panel] > div').first().boundingBox())!
    await page.mouse.move(bar.x + 60, bar.y + 10)
    await page.mouse.down()
    await page.mouse.move(bar.x + 300, bar.y + 40, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    const moved = (await panel(page).boundingBox())!

    // Shrink to a size this panel STILL FITS in, on BOTH axes, computed from
    // where the drag actually landed. Hard-coding either dimension makes the
    // test depend on where the drag happened to end: a fixed 800 wide overflowed
    // it horizontally, and then a fixed 700 tall overflowed it vertically — the
    // clamp did its job correctly both times and the test failed anyway.
    // Nothing should move it here: chat REMEMBERS its rect, which is the half of
    // the rule that re-centering excludes.
    await page.setViewportSize({
      width: Math.ceil(moved.x + moved.width + 40),
      height: Math.ceil(moved.y + moved.height + 40),
    })
    await page.waitForTimeout(400)
    const after = (await panel(page).boundingBox())!
    expect(after.x).toBeCloseTo(moved.x, 0)
    expect(after.y).toBeCloseTo(moved.y, 0)
  })

  test('a deliberate move is still remembered', async ({ browser }) => {
    const club = await createClubWithMembers(['ada', 'bea'])
    const game = await createBoggleGame(club)
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await page.getByRole('button', { name: /^Open chat/ }).first().click()
    await panel(page).waitFor({ timeout: 8000 })

    // Drag by the titlebar. A user's move goes through the SOFT clamp and is
    // written; the viewport re-clamp is a different call and must not disturb it.
    const bar = (await page.locator('[data-floating-panel] > div').first().boundingBox())!
    await page.mouse.move(bar.x + 60, bar.y + 10)
    await page.mouse.down()
    await page.mouse.move(bar.x + 260, bar.y + 180, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(300)

    const moved = (await panel(page).boundingBox())!
    const stored = JSON.parse(
      (await page.evaluate(() => localStorage.getItem('puzpuzpuz:chat:rect')))!,
    )
    expect(stored.x).toBeCloseTo(moved.x, 0)
    expect(stored.y).toBeCloseTo(moved.y, 0)
  })
})
