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
 */
test.describe('escape and the panel stack', () => {
  const panels = (page: Page) => page.locator('[data-floating-panel]')
  const titles = (page: Page) => page.locator('[data-floating-panel] header').allInnerTexts()

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

    await page.keyboard.press('Escape')
    // The regression: this used to go to zero.
    await expect(panels(page)).toHaveCount(1)
    expect((await titles(page)).join()).toMatch(/Start/i)

    await page.keyboard.press('Escape')
    await expect(panels(page)).toHaveCount(0)
  })

  test('chat is ranked by its FAMILY, so a modal takes Escape first', async ({ browser }) => {
    const club = await createClubWithMembers(['ada', 'bea'])
    const game = await createBoggleGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()

    await page.goto(`/g/${game.gametype}/${game.id}`)
    // Park chat off the middle so it isn't covering the controls we click. Its
    // persisted rect is the supported way to do that.
    await page.evaluate(() =>
      localStorage.setItem(
        'puzpuzpuz:chat:rect',
        JSON.stringify({ x: 8, y: 380, width: 280, height: 220 }),
      ),
    )
    await page.reload()
    await page.getByRole('button', { name: /^Open chat/ }).first().click()
    await expect(panels(page)).toHaveCount(1)
    await page.getByRole('button', { name: 'End game' }).first().click()
    await expect(panels(page)).toHaveCount(2)

    // Focus outside both panels, so the TOP one answers rather than the one
    // focus is in. Chat PAINTS above every modal (it lives at the chat tier) but
    // is CLASSED a companion — and Escape ranks by family, so the confirmation
    // wins and the conversation you have kept open all game survives.
    await page.locator('body').click({ position: { x: 3, y: 3 } })
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
