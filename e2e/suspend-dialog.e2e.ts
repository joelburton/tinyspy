import { test, expect } from '@playwright/test'
import { createSoloClub, createBoggleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The "Suspend this game?" confirm (shown on Back-to-club from a non-terminal
 * game) must be fully keyboard-operable. Regression for a subtle bug: a word
 * game's window-level key capture (useCaptureKeys) `preventDefault()`s Enter and
 * Tab, which — while the modal was open over the game — deadened the modal's own
 * Enter-to-confirm and Tab-between-buttons. `useGlobalKeyHandler` now bails for
 * events whose focus is inside `[data-floating-panel]`, and a focus trap keeps Tab
 * inside the dialog. Run on boggle precisely because it HAS that capture keyboard.
 *
 * Solo club so navigating away doesn't presence-pause a second viewer.
 */
test.describe('suspend confirm dialog — keyboard', () => {
  async function openSuspendDialog(page: import('@playwright/test').Page, game: { id: string; gametype: string }) {
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await page.locator('[data-boggle-tile]').first().waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: /back to club/i }).click()
    await expect(page.getByText('Suspend this game?')).toBeVisible({ timeout: 5000 })
  }

  test('Enter confirms, Esc cancels', async ({ browser }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createBoggleGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()

    // Esc cancels: the dialog closes and we stay on the game page.
    await openSuspendDialog(page, game)
    await page.keyboard.press('Escape')
    await expect(page.getByText('Suspend this game?')).toBeHidden()
    await expect(page).toHaveURL(/\/g\//)

    // Enter (on the autofocused Suspend button) confirms → navigate to the club.
    await openSuspendDialog(page, game)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/c\//, { timeout: 10000 })

    await ctx.close()
  })

  test('Tab cycles within the dialog and does not escape to the page', async ({ browser }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createBoggleGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await openSuspendDialog(page, game)

    // Every control the Tab ring lands on must live inside the panel — never a
    // control on the page behind it.
    const label = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        return {
          text: (el?.getAttribute('aria-label') || el?.textContent || '').trim().slice(0, 20),
          inPanel: !!el?.closest('[data-floating-panel]'),
        }
      })

    const seen: string[] = []
    for (let i = 0; i < 5; i++) {
      const { text, inPanel } = await label()
      seen.push(text)
      expect(inPanel).toBe(true)
      await page.keyboard.press('Tab')
    }
    // The ring includes both action buttons (proves Tab moves between them).
    expect(seen).toContain('Suspend')
    expect(seen).toContain('Keep playing')

    await ctx.close()
  })
})
