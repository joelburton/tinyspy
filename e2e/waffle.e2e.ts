import { test, expect } from '@playwright/test'
import { createSoloClub, createWaffleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * "Restart" (the game menu) restarts the same board from scratch: it
 * clears the turn log and resets all progress on the same game row. Solo club
 * so the game doesn't presence-pause with a single viewer.
 */
test.describe('waffle replay board', () => {
  test('coop: a swap logs a turn; "Restart" clears the log', async ({ browser }) => {
    const club = await createSoloClub('wfrp')
    const [alice] = club.members
    const game = await createWaffleGame(club) // coop by default

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The scramble is `bacdef.g.hijklmn.o.pqrstu`; tiles are buttons labelled
    // "<LETTER> (<color>)". Wait for the board, then make one swap (D↔E) — a
    // non-solving move that leaves the game in play and logs turn #1.
    await expect(page.getByRole('button', { name: /^B \(/ })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /^D \(/ }).click()
    await page.getByRole('button', { name: /^E \(/ }).click()
    await expect(page.getByText('#1', { exact: true })).toBeVisible({ timeout: 8000 })

    // Replay → the turn log clears (and the board resets to the scramble).
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'Restart' }).click()
    // The styled ConfirmDialog (mid-game restart wipes the group's progress).
    await page.getByRole('button', { name: 'Restart', exact: true }).click()
    await expect(page.getByText('#1', { exact: true })).toHaveCount(0, { timeout: 8000 })
  })

  test('menu "New game" starts a FRESH game (new id, same setup) via the edge fn', async ({
    browser,
  }) => {
    const club = await createSoloClub('wfng')
    const game = await createWaffleGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.getByRole('button', { name: /^B \(/ })).toBeVisible({ timeout: 15000 })

    // "New game" → the REAL waffle-build-board edge function builds a fresh
    // board for the same setup band and we land on a DIFFERENT game id.
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'New game' }).click()
    // Mid-play, New game CONFIRMS first (it shelves the game in progress —
    // see NEW_GAME_CONFIRM); say yes and it proceeds.
    await page.getByRole('button', { name: 'Start new game' }).click()
    await expect(page).not.toHaveURL(new RegExp(game.id), { timeout: 20000 })
    await expect(page).toHaveURL(/\/g\/waffle_coop\//)
    // The fresh game renders: a board with an empty swap log (the new board's
    // par — and so its swap budget — is whatever the generator found).
    await expect(page.getByRole('grid', { name: /waffle board/i })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('No swaps yet.')).toBeVisible()
  })

  test('coop: end the game, THEN reveal — the answer fills the info list', async ({
    browser,
  }) => {
    const club = await createSoloClub('wfrv')
    const game = await createWaffleGame(club) // coop → the solution is on the client
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The scramble swaps cells 0,1, so 'A' starts at position 1 (top-left tile is
    // "B (…)"), and the across word a0 reads as an em dash in the info list.
    await expect(page.getByRole('button', { name: /^B \(/ })).toBeVisible({ timeout: 15000 })

    // Reveal is TERMINAL-ONLY now — waffle's mid-game give-up was removed
    // 2026-08-03 so every game has the same order: End, then Reveal. The menu
    // item is present mid-game but inert, matching common.reveal_solution's own
    // server-side gate.
    await page.getByRole('button', { name: 'Game menu' }).click()
    await expect(page.getByRole('menuitem', { name: 'Reveal answer' })).toBeDisabled()
    await page.keyboard.press('Escape')

    // End it for the table (the neutral 'ended' terminal).
    await page.getByRole('button', { name: /^end$/i }).click()
    await page.getByRole('button', { name: 'End game' }).click()
    await expect(page.getByText('Game ended', { exact: true }).first()).toBeVisible({ timeout: 8000 })

    // A manual end is not a win, so the answer stays covered until asked for…
    await expect(page.getByText('ABCDE', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Reveal answer' }).click()
    // …and then the across word a0 (ABCDE) fills the info-column answer list.
    await expect(page.getByText('ABCDE', { exact: true })).toBeVisible({ timeout: 8000 })
  })
})
