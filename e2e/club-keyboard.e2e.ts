// cs-audited-club-page

import { test, expect } from '@playwright/test'
import { createSoloClub, createWaffleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * ClubPage keyboard navigation: Tab toggles between the page's TWO lists
 * (start-a-new-game / "Your games") and nothing else; Up/Down move a
 * per-list cursor (clamped, no wrap); Enter starts (setup dialog) / opens
 * (navigate) the item under the cursor. Everything else is mouse-only,
 * while overlays (chat input, dialogs) keep native keys and the global
 * shortcuts ("/" chat) still work.
 */
test.describe('club page keyboard nav', () => {
  test('tab toggles lists; arrows move; enter starts/opens', async ({ browser }) => {
    const club = await createSoloClub('ckbn')
    // Three games: creating each un-currents the previous, so the club shows
    // one active game — as a callout AND as a row — plus two shelved rows.
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
    expect(await focusedLabel()).toBe('Your games')
    await page.keyboard.press('Tab')
    expect(await focusedLabel()).toBe('Start a new game')

    // The cursor ring (the 2px accent outline) is hidden until a movement key
    // asks; the first arrow reveals it on the resting row and the next one
    // steps (docs/ui.md → Selection lists). ArrowUp past the top clamps (no
    // wrap).
    const ringed = () =>
      page.evaluate(() => {
        const els = [...document.querySelectorAll('[data-testid="list-row"]')]
        const hit = els.find((el) => getComputedStyle(el).outlineWidth === '2px')
        return hit?.textContent ?? null
      })
    expect(await ringed()).toBeNull()
    await page.keyboard.press('ArrowDown') // reveals, on the first row
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
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Start' })).toBeHidden()

    // "/" (a global shortcut) still opens chat; Tab INSIDE the chat input is
    // chat's own step out of its ring (it blurs the field), so the page's
    // list-toggle never sees the press and focus lands on neither list.
    await page.keyboard.press('/')
    const chatInput = page.getByPlaceholder(/message/i)
    await expect(chatInput).toBeVisible()
    await page.keyboard.press('Tab')
    expect(await focusedLabel()).not.toBe('Start a new game')
    expect(await focusedLabel()).not.toBe('Your games')
    // Chat deliberately ignores Escape (closeOnEsc: false) — close via its ✕.
    await page.getByRole('button', { name: 'Chat', exact: true }).click()
    await expect(chatInput).toBeHidden()

    // Tab to the games list; Enter opens the game under the cursor. "Your
    // games" lists ALL the club's games — the current one included, as an
    // ordinary row — so any of the three is a legitimate destination; what
    // matters is that Enter opens the row the RING is on.
    //
    // A SelectionList row is an inert <div> with no href to read — the list
    // navigates on activation (docs/ui.md → Selection lists) — so identify the
    // ringed row by its TITLE and check we land on that game.
    await page.keyboard.press('Tab') // start list
    await page.keyboard.press('Tab') // games list
    expect(await focusedLabel()).toBe('Your games')
    // This list's cursor has never been asked for, and Enter is inert while it
    // is hidden — so one arrow first, to reveal it.
    await page.keyboard.press('ArrowDown')
    const ringedTitle = await page.evaluate(
      () =>
        [...document.querySelectorAll('[aria-label="Your games"] [data-testid="list-row"]')]
          .find((el) => getComputedStyle(el).outlineWidth === '2px')
          ?.textContent ?? null,
    )
    expect(ringedTitle).not.toBeNull()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/g\/waffle_coop\//, { timeout: 10000 })
    const landedOn = page.url().split('/').pop()!
    expect([g1.id, g2.id, g3.id]).toContain(landedOn)
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

    // The list container holds focus on load and paints NO ring: the cursor is
    // hidden until a key asks for it, and nothing else may wear one either.
    expect(await listFocused()).toBe(true)
    expect(await rings()).toEqual([])

    // CLICKING a game must not move focus onto the button: the container is the
    // tab stop, and a focused button would paint a stray focus ring that Enter
    // doesn't act on. A click sets the cursor without revealing it.
    const cancel = page.getByRole('button', { name: /^cancel$/i })
    await page.locator('[aria-label="Start a new game"] [data-testid="list-row"]').first().click()
    await expect(cancel).toBeVisible({ timeout: 5000 })
    expect(await listFocused()).toBe(true)
    expect(await rings()).toEqual([])

    // ...and canceling hands focus back, so Up/Down work immediately — no Tab
    // needed to re-enter the list — and the ring the arrow reveals is the
    // INSET keyboard cursor, exactly one of it.
    await cancel.click()
    await expect(cancel).toBeHidden()
    expect(await listFocused()).toBe(true)
    expect(await rings()).toEqual([])
    await page.keyboard.press('ArrowDown')
    expect(await rings()).toEqual(['-2px'])

    await ctx.close()
  })

  /**
   * A CLICK selects, the same as an arrow key does. Without this the ring stayed
   * wherever it had been, so canceling a clicked game's setup dialog left the
   * mouse and the keyboard disagreeing about "the selected item" — and the next
   * arrow key jumped somewhere unrelated.
   */
  test('clicking a start button moves the cursor to it', async ({ browser }) => {
    const club = await createSoloClub('ckbc')
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await expect(page.getByText('Start a new game')).toBeVisible({ timeout: 15000 })

    const buttons = page.locator('[aria-label="Start a new game"] [data-testid="list-row"]')
    /** Index of the start button wearing the cursor ring, or -1. */
    const ringed = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[aria-label="Start a new game"] [data-testid="list-row"]')].findIndex(
          (el) => getComputedStyle(el).outlineWidth === '2px',
        ),
      )

    // The ring is hidden until a key asks for it.
    expect(await ringed()).toBe(-1)

    // Click the THIRD game, then cancel its setup dialog: the click set the
    // cursor there without revealing it (a mouse user has no use for the ring)...
    const cancel = page.getByRole('button', { name: /^cancel$/i })
    await buttons.nth(2).click()
    await expect(cancel).toBeVisible({ timeout: 5000 })
    expect(await ringed()).toBe(-1)
    await cancel.click()
    await expect(cancel).toBeHidden()
    expect(await ringed()).toBe(-1)

    // ...so the first arrow reveals it ON the game we clicked, not at 0, and
    // the next steps from there.
    await page.keyboard.press('ArrowDown')
    expect(await ringed()).toBe(2)
    await page.keyboard.press('ArrowDown')
    expect(await ringed()).toBe(3)

    await ctx.close()
  })

  /**
   * ⇧< → Back to home, the club-list page. The keyboard twin of the menu item
   * that already existed, and the same key the GAME page uses for "Back to
   * club" — one key meaning "up a level from wherever I am".
   */
  test('shift-< goes back to the club list', async ({ browser }) => {
    const club = await createSoloClub('ckbh')
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await expect(page.getByText('Start a new game')).toBeVisible({ timeout: 15000 })

    await page.keyboard.press('<')
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })

    await ctx.close()
  })
})
