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

    // Mid-game replay confirms — arm the handler BEFORE the click, or
    // Playwright's default auto-dismiss cancels it.
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'Restart' }).click()

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

    await page.waitForURL((u) => u.pathname.startsWith(`/g/${game.gametype}/`) &&
                                !u.pathname.endsWith(game.id), { timeout: 15000 })
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })
    await ctx.close()
  })

  test('"New game" at the end of the archive shows a notice, not a repeat', async ({ browser }) => {
    const club = await createSoloClub('cnend')
    // The NEWEST imported puzzle → nothing dated after it.
    const game = await createConnectionsGame(club, 'coop', undefined, await connectionsArchiveEdge('last'))
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'New game' }).click()

    // The notice, and NO navigation away from this game.
    await expect(page.getByText('No more puzzles')).toBeVisible({ timeout: 10000 })
    // One button, not a question: "Got it" with no Cancel beside it.
    await expect(page.getByRole('button', { name: 'Got it' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Got it' }).click()
    expect(page.url()).toContain(game.id)

    await ctx.close()
  })
})
