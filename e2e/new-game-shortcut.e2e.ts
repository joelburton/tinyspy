import { test, expect } from '@playwright/test'
import { createSoloClub, createBoggleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The `+` shortcut for New game, and the confirm that guards it mid-play.
 *
 * `+` dispatches through the MENU ITEM (`NEW_GAME_ID`), the same way ⌥⌫ fires
 * End/Concede — so it works on any game that offers New game at all, including
 * one whose only affordance is the menu, with no per-game wiring.
 *
 * Starting a new game doesn't END the current one: `create_game` clears the
 * club's current-view flag and the old game stays resumable from the club page.
 * The confirm exists so an accidental `+` doesn't read as "I just lost my
 * game" — which is why its copy says *shelved*, not ended.
 */
test('“+” starts a new game, after confirming mid-play', async ({ browser }) => {
  const club = await createSoloClub('ngsc')
  const game = await createBoggleGame(club)

  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-boggle-tile]')).toHaveCount(16, { timeout: 20000 })
  const originalUrl = page.url()

  // Wait for the game to have PUSHED its menu sections before pressing the key:
  // `+` resolves through the menu item, so until `setGameSections` has run there
  // is nothing for it to find. Opening the menu and seeing "New game" is the
  // deterministic signal (and doubles as the "it's in the menu" assertion).
  await page.getByRole('button', { name: /game menu/i }).click()
  await expect(page.getByRole('menuitem', { name: /New game/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem', { name: /New game/ })).toBeHidden()

  // `+` mid-play asks first — and the copy reassures rather than warns.
  await page.keyboard.press('+')
  await expect(page.getByText('Start a new game?')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(/shelved, not lost/)).toBeVisible()

  // "Keep playing" backs out: same game, nothing created.
  await page.getByRole('button', { name: 'Keep playing' }).click()
  await expect(page.getByText('Start a new game?')).toBeHidden()
  expect(page.url()).toBe(originalUrl)

  // Confirming starts a fresh game — a new id under the same gametype.
  await page.keyboard.press('+')
  await expect(page.getByText('Start a new game?')).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Start new game' }).click()
  // Poll for the URL to CHANGE — asserting the pattern alone would pass
  // instantly, since the game we're leaving matches it too.
  await expect.poll(() => page.url(), { timeout: 20000 }).not.toBe(originalUrl)
  await expect(page).toHaveURL(/\/g\/boggle_coop\/[0-9a-f-]{36}$/)

  await ctx.close()
})

/**
 * ⌥+ — "new game from setup": the same fresh game, but stopping at the setup
 * dialog so you can change the options first (plain `+` reuses this game's setup
 * verbatim). Deliberately NOT a menu item — it's the power-user variant of one.
 *
 * The setup dialog lives on ClubPage, so the shortcut hands off via
 * `?new=<gametype>` — the same route crosswords' own New game uses — and
 * cancelling simply leaves you on the club page.
 */
test('“⌥+” confirms, then opens the setup dialog on the club page', async ({ browser }) => {
  const club = await createSoloClub('ngsp')
  const game = await createBoggleGame(club)

  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-boggle-tile]')).toHaveCount(16, { timeout: 20000 })

  // Mid-play it asks the same question `+` does — an accidental chord shouldn't
  // move you off the board either.
  await page.keyboard.press('Alt+Equal')
  await expect(page.getByText('Start a new game?')).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Keep playing' }).click()
  await expect(page).toHaveURL(new RegExp(game.id))

  // Confirming lands on the CLUB page with the setup dialog already open on this
  // gametype — the game isn't created until you press Start in there.
  await page.keyboard.press('Alt+Equal')
  await expect(page.getByText('Start a new game?')).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Start new game' }).click()
  await expect(page).toHaveURL(new RegExp(`/c/${club.handle}`), { timeout: 20000 })
  await expect(page.getByRole('button', { name: /^Start / })).toBeVisible({ timeout: 10000 })

  // Backing out of setup just leaves you on the club page, as usual.
  await page.getByRole('button', { name: /^cancel$/i }).click()
  await expect(page.getByRole('button', { name: /^cancel$/i })).toBeHidden()
  await expect(page.getByText('Start a new game')).toBeVisible()

  await ctx.close()
})
