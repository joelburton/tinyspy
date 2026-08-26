// cs-audited

import { test, expect, type Page } from '@playwright/test'
import { createClubWithMembers, createBoggleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { startGameRow } from './helpers/clubPage'

/**
 * Escape, for floating panels: **what you're IN, else what's on TOP**
 * (`usePanelEscape`; plans/areas/floating-panels.md → F16
 * `esc-closes-every-panel`).
 *
 * This exists because the old behavior was one window-level listener PER PANEL,
 * so a single Escape fired all of them at once: open a game's setup, open Help
 * from its footer "?", press Escape, and the setup form you were filling in went
 * with it. Nothing caught that — the bug is invisible to any test that opens one
 * panel at a time, which is every other spec we have.
 *
 * So each case here opens TWO panels. That is the whole point; a one-panel
 * assertion would pass against the bug.
 *
 * ⚠️ TWO TRAPS, both of which made an earlier version of this file pass against
 * a deliberately broken build:
 *
 *   1. **Clicking outside a modal does NOT move focus.** A scrim
 *      `preventDefault()`s its own mousedown on purpose, so the click cannot
 *      blur the panel's focused control. A test that clicks the page and thinks
 *      it has reached the "what's on TOP" branch is still in the "what you're
 *      IN" branch. Blur programmatically instead.
 *   2. **The pairing has to be one the ranking can get WRONG.** Chat ranks at
 *      its family (2000) rather than where it paints (3100) — but against a
 *      blocking modal at 5000 both answers agree, so that pairing proves
 *      nothing. It has to be paired with a `modal-normal` at 2200, which is
 *      the only place the two orderings disagree.
 */
test.describe('escape and the panel stack', () => {
  const panels = (page: Page) => page.locator('[data-floating-panel]')
  // The title SPAN, not the titlebar and not a tag name. This read
  // `[data-floating-panel] header` until the titlebar stopped being a `<header>`
  // (there is no drag handle to be a header FOR on a card family), at which
  // point it silently matched nothing and both assertions compared against "".
  const titles = (page: Page) =>
    page.locator('[data-floating-panel] span[class*="_title_"]').allInnerTexts()

  test('Help over setup: one Escape closes Help and leaves the form', async ({ browser }) => {
    const club = await createClubWithMembers(['ada', 'bea'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()

    await page.goto(`/c/${club.handle}`)
    await startGameRow(page, /MothCubes|Boggle/i).click()
    await panels(page).first().waitFor({ timeout: 8000 })
    // The setup footer's "?" opens Help ABOVE the setup modal.
    await panels(page).getByRole('button', { name: /^\?$|help/i }).first().click()
    await expect(panels(page)).toHaveCount(2)

    // Drop focus OUT of every panel, which is the only way to reach the
    // "what's on TOP" branch (see trap 1 above). Help paints at --z-help (2300)
    // above setup's --z-modal-normal (2200) and RANKS there too, so it is the
    // one that goes — while the form you opened the rules FOR survives.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Escape')
    // The regression: this used to go to zero.
    await expect(panels(page)).toHaveCount(1)
    expect((await titles(page)).join()).toMatch(/Start/i)

    await page.keyboard.press('Escape')
    await expect(panels(page)).toHaveCount(0)
  })

  test('chat is ranked by its FAMILY, so a modal-normal takes Escape first', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['ada', 'bea'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()

    await page.goto(`/c/${club.handle}`)
    // Park chat in a corner via its persisted rect — the supported way — so it
    // isn't covering the row this test has to click.
    await page.evaluate(() =>
      localStorage.setItem(
        'puzpuzpuz:chat:rect',
        JSON.stringify({ x: 8, y: 420, width: 260, height: 200 }),
      ),
    )
    await page.reload()
    await page.getByRole('button', { name: /^Open chat/ }).first().click()
    await expect(panels(page)).toHaveCount(1)
    await startGameRow(page, /MothCubes|Boggle/i).click()
    await expect(panels(page)).toHaveCount(2)

    // THE discriminating pairing: chat PAINTS at --z-chat (3100), above setup's
    // --z-modal-normal (2200), but RANKS at its family (2000) — so ranking by
    // paint and ranking by family give opposite answers here, and only here.
    // The form you just opened takes Escape; the conversation you have kept
    // open all game survives.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Escape')
    await expect(panels(page)).toHaveCount(1)
    expect((await titles(page)).join()).toMatch(/Chat/i)
  })

  test('a fault SWALLOWS Escape — it closes nothing, not even the panel below', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['ada', 'bea'])
    const game = await createBoggleGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()

    await page.goto(`/g/${game.gametype}/${game.id}`)
    await page.evaluate(() =>
      localStorage.setItem(
        'puzpuzpuz:chat:rect',
        JSON.stringify({ x: 8, y: 380, width: 280, height: 220 }),
      ),
    )
    await page.reload()
    await page.getByRole('button', { name: /^Open chat/ }).first().click()
    await expect(panels(page)).toHaveCount(1)
    await page.evaluate(() =>
      (window as unknown as { pupfault: (s?: string) => void }).pupfault(),
    )
    await expect(panels(page)).toHaveCount(2)

    // Focus is on the fault's Close button (it autoFocuses), so the "what you're
    // IN" branch applies — and the fault's answer is to consume the key. Both
    // halves matter: the error must not vanish by reflex, and Escape must not
    // fall through to close the chat underneath it either.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await expect(panels(page)).toHaveCount(2)
  })
})
