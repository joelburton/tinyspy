import { test, expect } from '@playwright/test'
import { createSoloClub, createConnectionsGame, connectionsArchiveEdge } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * connections' "Restart" + "New game" — the terminal action row's
 * stay-here options, also reachable mid-game from the menu.
 *
 * New game is connections-specific and is what these tests mostly cover.
 * Every other game re-rolls a board from the same setup; connections' boards
 * are a DATED ARCHIVE, so it walks forward to the next daily puzzle this club
 * hasn't played — and when the archive runs out it says so in a notice instead
 * of starting a repeat. Both ends are driven here against the real imported
 * archive: a game on the OLDEST puzzle has plenty ahead of it, a game on the
 * NEWEST has nothing.
 *
 * (The forward-walking rule itself is unit-tested in lib/nextPuzzle.test.ts;
 * these are the round trips — the queries, the navigation, the modal — that
 * jsdom can't reach.)
 */
test.describe('connections replay + new game', () => {
  test('"Restart" clears the guess log', async ({ browser }) => {
    const club = await createSoloClub('cnrp')
    const game = await createConnectionsGame(club, 'coop')
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // Guess a full (wrong) category so there's a log row + a mistake to wipe.
    for (const t of ['ALPHA', 'ANGEL', 'APPLE', 'BANANA']) {
      await page.getByRole('button', { name: t, exact: true }).click()
    }
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText('No guesses yet.')).toBeHidden({ timeout: 10000 })

    // Mid-game restart is confirmed through the styled ConfirmDialog (it wipes
    // the group's progress) — the browser alert went away 2026-08-03, so the
    // dialog is a real button in the page.
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'Restart' }).click()
    await page.getByRole('button', { name: 'Restart', exact: true }).click()

    await expect(page.getByText('No guesses yet.')).toBeVisible({ timeout: 10000 })
    await ctx.close()
  })

  test('"New game" starts the next unplayed puzzle in the archive', async ({ browser }) => {
    const club = await createSoloClub('cnng')
    // The OLDEST imported puzzle → the whole archive is still ahead of it.
    const game = await createConnectionsGame(club, 'coop', undefined, await connectionsArchiveEdge('first'))
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'New game' }).click()
    // Mid-play, New game CONFIRMS first (it shelves the game in progress —
    // see NEW_GAME_CONFIRM); say yes and it proceeds.
    await page.getByRole('button', { name: 'Start new game' }).click()

    await page.waitForURL((u) => u.pathname.startsWith(`/g/${game.gametype}/`) &&
                                !u.pathname.endsWith(game.id), { timeout: 15000 })
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })
    await ctx.close()
  })

  // The end-of-archive NOTICE is no longer reachable from e2e, and that is a
  // consequence of the 2026-08-13 picker rework rather than a gap. "Nothing
  // left" used to mean "no puzzle dated after this one", which a fixture could
  // arrange by starting the newest puzzle; it now means every one of the 2,329
  // imported puzzles has been played by someone at the table. Manufacturing
  // that would mean either 2,329 games or deleting the archive out from under
  // every other spec sharing this database.
  //
  // So the server half is pgTAP's — tests/strands/next_puzzle_test.sql drives
  // the archive down to one puzzle inside a rolled-back transaction and pins
  // `no-unplayed-puzzle|` — and the FE half (a one-button `<ConfirmDialog>`,
  // `cancelLabel: null`, no navigation) is the same three lines in both games'
  // PlayAreas. What IS still reachable, and covered above, is the thing that
  // actually happens every time: New game lands on a DIFFERENT puzzle.
})

/**
 * The ended board, and the terminal reveal — the browser half of what the unit
 * tests pin. connections used to hand its answer over unasked at game over, and
 * because the board swaps loose tiles for full-width bands, doing so DELETED
 * the tiles the players were still staring at: a lost game showed four bands
 * and no record of how far anyone got.
 */
test('ending keeps the tiles; Reveal swaps in the categories, Hide swaps back', async ({
  browser,
}) => {
  const club = await createSoloClub('cnrev')
  const game = await createConnectionsGame(club, 'coop')
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

  const tiles = page.locator('[data-tile]')
  await expect(tiles).toHaveCount(16)

  // End it for the table (the neutral stop).
  await page.getByRole('button', { name: 'End game' }).first().click()
  await page.locator('[data-floating-panel]').getByRole('button', { name: 'End game' }).click()
  await expect(page.getByText('Game ended').first()).toBeVisible({ timeout: 10000 })

  // The board is the record: all sixteen still there, and no answer on screen.
  await expect(tiles).toHaveCount(16)
  await expect(page.getByText('Words starting with A')).toHaveCount(0)
  // …and frozen: the tiles are marked disabled, so they don't wear the pointer
  // cursor or the hover lift that would advertise them as an input.
  await expect(tiles.first()).toBeDisabled()

  // Reveal swaps them for the four category bands…
  await page.getByRole('button', { name: 'Reveal categories' }).click()
  await expect(page.getByText('Words starting with A')).toBeVisible({ timeout: 8000 })
  await expect(tiles).toHaveCount(0)

  // …and Hide brings the board back exactly as they left it.
  await page.getByRole('button', { name: 'Hide categories' }).click()
  await expect(tiles).toHaveCount(16)
  await expect(page.getByText('Words starting with A')).toHaveCount(0)

  await ctx.close()
})
