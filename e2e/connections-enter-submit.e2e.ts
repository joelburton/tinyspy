import { test, expect } from '@playwright/test'
import { createSoloClub, createConnectionsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Enter submits the current selection. The guess used to be bound to Enter only
 * on a *focused tile*, but macOS doesn't focus a <button> on click — so after
 * selecting tiles with the mouse, Return did nothing. A window-level handler now
 * fires the guess regardless of focus. We select the 4 A-words of the fixture
 * puzzle (a correct category) and press Enter *without* touching the Submit
 * button — the turn logging is the "the keystroke submitted" signal.
 */
test('connections: Enter submits the selected guess (no Submit-button click)', async ({
  browser,
}) => {
  const club = await createSoloClub('cent')
  const game = await createConnectionsGame(club, 'coop') // solo coop; fixture A/B/C/D puzzle
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

  for (const word of ['ALPHA', 'ANGEL', 'APPLE', 'ARROW']) {
    await page.getByRole('button', { name: word }).click()
  }
  // Move focus off any tile (onto a neutral info-column heading, away from the
  // board so we don't toggle a 5th tile), then submit purely with the keyboard —
  // this is the macOS scenario where no tile holds focus.
  await page.getByRole('heading', { name: 'Guesses' }).click()
  await page.keyboard.press('Enter')

  // The turn logs → the guess landed. (A correct guess also collapses the four
  // A-words into a band, but the log handle is the crisp signal.)
  await expect(page.locator('[data-turn-number]')).toBeVisible({ timeout: 15000 })
})
