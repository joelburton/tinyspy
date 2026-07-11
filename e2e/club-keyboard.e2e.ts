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
})
