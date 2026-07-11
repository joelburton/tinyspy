import { test, expect, type Browser, type Page } from '@playwright/test'
import {
  createClubWithMembers,
  createSoloClub,
  createBoggleGame,
  createCrosswordsGame,
  createWaffleGame,
  type E2EClub,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The in-game confirm MODALS (docs/ui.md → Modals):
 *
 *   - Suspend-back-to-club: shown ONLY for a non-terminal MULTIPLAYER game
 *     (the confirm exists because suspending drags peers back to the club).
 *     A solo game suspends directly, no dialog; a terminal game navigates
 *     directly, no dialog and no peer kick. The dialog is a true modal —
 *     backdrop-blocked board, dialog-owned keyboard (Enter confirms on the
 *     autofocused button, Esc cancels, Tab is trapped; regression for the
 *     word games' window key-capture eating Enter/Tab — useGlobalKeyHandler
 *     and crosswords' own useGridKeyboard bail inside [data-floating-panel]).
 *
 *   - End-game: ALWAYS the shared ConfirmDialog (never window.confirm),
 *     even solo/coop — ending is terminal for the whole group.
 *
 * Boggle is used for the keyboard tests precisely because it HAS a window
 * key-capture; multiplayer cases run two signed-in pages so presence-pause
 * doesn't cover the board.
 */
test.describe('confirm modals — suspend + end game', () => {
  /** Two members, both viewing the same game (no presence-pause). */
  async function twoUp(browser: Browser, makeGame: (club: E2EClub) => Promise<{ id: string; gametype: string }>) {
    const club = await createClubWithMembers(['ada', 'bea'])
    const game = await makeGame(club)
    const pages: Page[] = []
    for (const m of club.members) {
      const ctx = await browser.newContext()
      await signIn(ctx, m.session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)
      pages.push(page)
    }
    return { club, game, alice: pages[0], bob: pages[1] }
  }

  const openSuspendDialog = async (page: Page) => {
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: /back to club/i }).click()
    await expect(page.getByText('Suspend this game?')).toBeVisible({ timeout: 5000 })
  }

  test('solo game: Back-to-club suspends directly — no dialog', async ({ browser }) => {
    const club = await createSoloClub('sdns')
    const game = await createBoggleGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await page.locator('[data-boggle-tile]').first().waitFor({ timeout: 15000 })

    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: /back to club/i }).click()
    // Straight to the club — the confirm exists to warn about kicking peers,
    // and a solo game has none.
    await expect(page).toHaveURL(/\/c\//, { timeout: 10000 })
    expect(await page.getByText('Suspend this game?').count()).toBe(0)
    await ctx.close()
  })

  test('multiplayer: modal blocks the board; Esc cancels; Enter confirms; the peer is returned too', async ({
    browser,
  }) => {
    const { alice, bob } = await twoUp(browser, (club) => createBoggleGame(club))
    // Waiting for a tile absorbs presence-sync — a paused board renders the
    // overlay instead of the tiles, so this un-pauses first.
    await alice.locator('[data-boggle-tile]').first().waitFor({ timeout: 15000 })
    await bob.locator('[data-boggle-tile]').first().waitFor({ timeout: 15000 })

    // Esc cancels: the dialog closes, still on the game page.
    await openSuspendDialog(alice)
    await alice.keyboard.press('Escape')
    await expect(alice.getByText('Suspend this game?')).toBeHidden()
    await expect(alice).toHaveURL(/\/g\//)

    // The backdrop consumes outside clicks: a click on the board region
    // neither closes the dialog nor reaches the tile underneath.
    await openSuspendDialog(alice)
    const box = (await alice.locator('[data-boggle-tile]').first().boundingBox())!
    await alice.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(alice.getByText('Suspend this game?')).toBeVisible()
    await alice.keyboard.press('Escape') // close (the backdrop click blurred the button)

    // Enter (on the freshly-autofocused Suspend button) confirms → BOTH players
    // land on the club.
    await openSuspendDialog(alice)
    await alice.keyboard.press('Enter')
    await expect(alice).toHaveURL(/\/c\//, { timeout: 10000 })
    await expect(bob).toHaveURL(/\/c\//, { timeout: 10000 })
  })

  test('multiplayer: Tab cycles within the dialog and does not escape to the page', async ({ browser }) => {
    const { alice, bob } = await twoUp(browser, (club) => createBoggleGame(club))
    await alice.locator('[data-boggle-tile]').first().waitFor({ timeout: 15000 })
    await bob.locator('[data-boggle-tile]').first().waitFor({ timeout: 15000 })
    await openSuspendDialog(alice)

    const label = () =>
      alice.evaluate(() => {
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
      await alice.keyboard.press('Tab')
    }
    expect(seen).toContain('Suspend')
    expect(seen).toContain('Keep playing')
  })

  // crosswords has its OWN window keydown listener (useGridKeyboard) rather
  // than the shared useGlobalKeyHandler, so it needs the same
  // `[data-floating-panel]` bail — regression for the grid handler eating the
  // dialog's Enter/Tab.
  test('crosswords (own keyboard handler): Enter confirms, Tab stays in the dialog', async ({ browser }) => {
    const { alice, bob } = await twoUp(browser, (club) =>
      createCrosswordsGame(club, 'coop', club.members.map((m) => m.userId)),
    )
    await alice.locator('[data-xw-cell]').first().waitFor({ timeout: 15000 })
    await bob.locator('[data-xw-cell]').first().waitFor({ timeout: 15000 })

    await openSuspendDialog(alice)
    for (let i = 0; i < 3; i++) {
      const inPanel = await alice.evaluate(
        () => !!(document.activeElement as HTMLElement | null)?.closest('[data-floating-panel]'),
      )
      expect(inPanel).toBe(true)
      await alice.keyboard.press('Tab')
    }
    await alice.keyboard.press('Escape')
    await expect(alice.getByText('Suspend this game?')).toBeHidden()

    await openSuspendDialog(alice)
    await alice.keyboard.press('Enter')
    await expect(alice).toHaveURL(/\/c\//, { timeout: 10000 })
  })

  test('end game is always the styled modal — even in a SOLO game', async ({ browser }) => {
    // The critical case: no window.confirm — a solo page has no dialog handler
    // installed, so a native confirm would auto-dismiss and the game would
    // never end. The styled modal must appear, and Cancel must be a no-op.
    const club = await createSoloClub('sden')
    const game = await createWaffleGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.getByRole('button', { name: 'End' })).toBeVisible({ timeout: 15000 })

    // Cancel is a no-op — still playing.
    await page.getByRole('button', { name: 'End' }).click()
    await expect(page.getByText('End this game?')).toBeVisible()
    await page.getByRole('button', { name: 'Keep playing' }).click()
    await expect(page.getByText('End this game?')).toBeHidden()
    await expect(page.getByRole('button', { name: 'End' })).toBeVisible() // not ended

    // Confirm → the game ends.
    await page.getByRole('button', { name: 'End' }).click()
    await page.getByRole('button', { name: 'End game' }).click()
    await expect(page.getByText('Game ended', { exact: false }).first()).toBeVisible({ timeout: 10000 })
    await ctx.close()
  })

  test('back-to-club from an ENDED game: no dialog, and peers are NOT kicked', async ({ browser }) => {
    const { alice, bob, club } = await twoUp(browser, (c) => createWaffleGame(c))
    // Wait for alice's board to render — it only exists when un-paused (the
    // pause overlay replaces PlayArea), so this absorbs presence-sync. `End`
    // must be `exact` — otherwise it substring-matches the pause overlay's
    // "Susp[end] and return to club" escape hatch. Bob needn't be un-paused
    // first: ending short-circuits pause on his side too.
    await alice.getByRole('grid', { name: /waffle board/i }).waitFor({ timeout: 15000 })

    // Alice ends the game (through the modal) → terminal for both.
    await alice.getByRole('button', { name: 'End', exact: true }).click()
    await alice.getByRole('button', { name: 'End game' }).click()
    await expect(alice.getByText('Game ended', { exact: false }).first()).toBeVisible({ timeout: 10000 })
    await expect(bob.getByText('Game ended', { exact: false }).first()).toBeVisible({ timeout: 10000 })

    // Back-to-club from the ENDED game: direct navigation, no suspend dialog —
    // and bob stays right where he is (no peer kick, since nothing broadcasts).
    await alice.getByRole('button', { name: 'Game menu' }).click()
    await alice.getByRole('menuitem', { name: /back to club/i }).click()
    await expect(alice).toHaveURL(new RegExp(`/c/${club.handle}`), { timeout: 10000 })
    expect(await alice.getByText('Suspend this game?').count()).toBe(0)
    await bob.waitForTimeout(1500) // give a wrongful kick time to land
    await expect(bob).toHaveURL(/\/g\/waffle_coop\//)
  })
})
