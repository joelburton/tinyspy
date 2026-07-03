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
