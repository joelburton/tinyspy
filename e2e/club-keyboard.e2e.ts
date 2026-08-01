import { test, expect } from '@playwright/test'
import { createSoloClub, createWaffleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * ClubPage keyboard navigation: Tab toggles between the page's TWO lists
 * (start-a-new-game / completed-shelved) and nothing else; Up/Down move a
 * per-list cursor (clamped, no wrap); Enter starts (setup dialog) / opens
 * (navigate) the item under the cursor. Everything else is mouse-only,
 * while overlays (chat input, dialogs) keep native keys and the global
 * shortcuts ("/" chat) still work.
 */
test.describe('club page keyboard nav', () => {
  test('tab toggles lists; arrows move; enter starts/opens', async ({ browser }) => {
    const club = await createSoloClub('ckbn')
    // Three games: creating each un-currents the previous, so the club shows
    // one active game + TWO completed/shelved rows.
    const g1 = await createWaffleGame(club)
    const g2 = await createWaffleGame(club)
    const g3 = await createWaffleGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await expect(page.getByText('Start a new game')).toBeVisible({ timeout: 15000 })

    const focusedLabel = () =>
      page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)

    // Focus STARTS on the start list (no Tab needed); Tab toggles to the
    // games list and back — never anything else.
    expect(await focusedLabel()).toBe('Start a new game')
    await page.keyboard.press('Tab')
    expect(await focusedLabel()).toBe('Completed and shelved games')
    await page.keyboard.press('Tab')
    expect(await focusedLabel()).toBe('Start a new game')

    // Arrows move the cursor ring (the 2px accent outline) down the start
    // buttons; ArrowUp past the top clamps (no wrap).
    const ringed = () =>
      page.evaluate(() => {
        const els = [...document.querySelectorAll('button, a')]
        const hit = els.find((el) => getComputedStyle(el).outlineWidth === '2px')
        return hit?.textContent ?? null
      })
    const first = await ringed()
    expect(first).toBeTruthy()
    await page.keyboard.press('ArrowDown')
    const second = await ringed()
    expect(second).not.toBe(first)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp') // clamp at the top — no wrap
    expect(await ringed()).toBe(first)

    // Enter on a start item opens the setup dialog; Escape closes it.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: /^Start / })).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /^Start / })).toBeHidden()

    // "/" (a global shortcut) still opens chat; typing Tab INSIDE the chat
    // input keeps native behavior (the list-toggle doesn't hijack overlays).
    await page.keyboard.press('/')
    const chatInput = page.getByPlaceholder(/message/i)
    await expect(chatInput).toBeVisible()
    await page.keyboard.press('Tab')
    expect(await focusedLabel()).not.toBe('Start a new game')
    expect(await focusedLabel()).not.toBe('Completed and shelved games')
    // Chat deliberately ignores Escape (closeOnEsc: false) — close via its ✕.
    await page.getByRole('button', { name: 'Close chat' }).click()
    await expect(chatInput).toBeHidden()

    // Tab to the games list; Enter opens the game under the cursor — one of
    // the two SHELVED games (never the active g3; that card is mouse-only).
    await page.keyboard.press('Tab') // start list
    await page.keyboard.press('Tab') // games list
    expect(await focusedLabel()).toBe('Completed and shelved games')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/g\/waffle_coop\//, { timeout: 10000 })
    expect(page.url()).not.toContain(g3.id)
    expect([g1.id, g2.id].some((id) => page.url().includes(id))).toBe(true)
  })

  test('a mouse click on a start button leaves no focus ring and keeps the cursor', async ({
    browser,
  }) => {
    const club = await createSoloClub('ckbm')
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await expect(page.getByText('Start a new game')).toBeVisible({ timeout: 15000 })

    /** Every element painting a 2px ring, with its outline-offset. The keyboard
     *  cursor is INSET (-2px); a stray focus ring sat OUTSIDE (+2px), so the
     *  offset is what tells the two apart. */
    const rings = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('button, a, div')]
          .filter((el) => getComputedStyle(el).outlineWidth === '2px')
          .map((el) => getComputedStyle(el).outlineOffset),
      )
    const listFocused = () =>
      page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') === 'Start a new game',
      )

    // The list container holds focus on load and shows exactly one cursor.
    expect(await listFocused()).toBe(true)
    expect(await rings()).toEqual(['-2px'])

    // CLICKING a game must not move focus onto the button: the container is the
    // tab stop, and a focused button would blank the cursor while painting a
    // second, look-alike ring that Enter doesn't act on.
    const cancel = page.getByRole('button', { name: /^cancel$/i })
    await page.locator('[class*="_button_"]').first().click()
    await expect(cancel).toBeVisible({ timeout: 5000 })
    expect(await listFocused()).toBe(true)
    expect(await rings()).toEqual(['-2px'])

    // ...and cancelling hands focus back, so Up/Down work immediately — no Tab
    // needed to re-enter the list.
    await cancel.click()
    await expect(cancel).toBeHidden()
    expect(await listFocused()).toBe(true)
    expect(await rings()).toEqual(['-2px'])

    await ctx.close()
  })
})
