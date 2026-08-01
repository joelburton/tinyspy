import { test, expect } from '@playwright/test'
import { createSoloClub, createScrabbleGame, setScrabbleRack } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Full-turn smoke for scrabble: type a word at the center and Submit, then check it
 * committed and the rack refilled. This drives the whole turn machine — staging via
 * the keyboard cursor, submit → play_word RPC, the optimistic hold that keeps the
 * played tiles on the board, and the version-reset that clears staging + rebuilds
 * the rack — which the component tests (mocked useGame/db) can't reach.
 *
 * It's the before/after gate for the BoardCol decomposition
 * (docs/playarea-decomposition-plan.md): run it green on the current tree, then
 * decompose, then run it again.
 *
 * Solo coop club so the game doesn't presence-pause; the shared rack is pinned
 * (setScrabbleRack) so CAT is a deterministic, dictionary-valid first move.
 */
test.describe('scrabble — play a turn', () => {
  test('type a word at the center, submit; it commits and the rack refills', async ({ browser }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createScrabbleGame(club, 'coop')
    setScrabbleRack(game.id, ['C', 'A', 'T', 'S', 'E', 'R', 'O'])

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The pinned rack renders its 7 tiles.
    const rackTiles = page.locator('[data-zone="rack"] [data-rack-tile]')
    await expect(rackTiles).toHaveCount(7, { timeout: 15000 })

    // Type CAT from the center star (7,7). Clicking the cell sets the keyboard
    // cursor; it advances right, so C→(7,7) A→(8,7) T→(9,7) — a legal first move.
    const center = page.locator('[data-cell][data-x="7"][data-y="7"]')
    await center.click()
    await page.keyboard.type('CAT')
    await expect(center, 'C staged at the center').toContainText('C')

    // Enter submits the staged word.
    await page.keyboard.press('Enter')

    // Success shows as the "CAT +<score>" own-move pill (a rejected word would read
    // "No: CAT", which has no "+score" — so this asserts acceptance, not just the
    // letters). The commit → realtime refetch is what drives it.
    await expect(page.getByText(/CAT \+\d/i), 'accepted with a score').toBeVisible({ timeout: 10000 })

    // The version-reset rebuilt the rack (back to 7) and the played tile held on the
    // board through the commit (optimistic — it never blinked off).
    await expect(rackTiles).toHaveCount(7)
    await expect(center, 'C stayed committed on the board').toContainText('C')

    await ctx.close()
  })
})

/**
 * "Restart" + "New game" — the terminal action row's stay-here options,
 * also reachable mid-game from the menu.
 *
 * scrabble's 15×15 grid is the standard layout, not a generated puzzle, so a
 * replay RE-DEALS (fresh bag, new racks, empty grid) rather than restoring a
 * board. Both are round trips a unit test can't reach: the re-deal arrives back
 * over the realtime refetch, and New game is a navigation to a different id.
 */
test.describe('scrabble replay + new game', () => {
  test('a committed word is wiped by "Restart" (the grid re-deals)', async ({ browser }) => {
    const club = await createSoloClub('screp')
    const game = await createScrabbleGame(club, 'coop')
    setScrabbleRack(game.id, ['C', 'A', 'T', 'S', 'E', 'R', 'O'])
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // Play CAT at the centre so there's a committed tile + a log row to wipe.
    const center = page.locator('[data-cell][data-x="7"][data-y="7"]')
    await center.click()
    await page.keyboard.type('CAT')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/CAT \+\d/i)).toBeVisible({ timeout: 10000 })
    await expect(center).toContainText('C')

    // Mid-game replay confirms — arm the handler BEFORE the click, or
    // Playwright's default auto-dismiss cancels it.
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'Restart' }).click()

    // The centre square is empty again — the re-deal landed.
    await expect(center).not.toContainText('C', { timeout: 10000 })
    await ctx.close()
  })

  test('menu "New game" starts a FRESH game (new id, same setup)', async ({ browser }) => {
    const club = await createSoloClub('scng')
    const game = await createScrabbleGame(club, 'coop')
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
})
