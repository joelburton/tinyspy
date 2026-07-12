import { test, expect } from '@playwright/test'
import { createSoloClub, createWordiplyGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Live-update smoke test for wordiply (WordWire). Guards the load-bearing
 * realtime-publication invariant (BOTH wordiply.games AND wordiply.guesses
 * must be in supabase_realtime — see the migration + the shared memory): a
 * submitted guess must land on the BOARD via the postgres-changes event, not
 * a refetch. The board rows come from useGame's realtime `guesses` (the
 * optimistic own-move pill is separate), so a guess appearing in the board
 * without a reload can only happen through the live channel.
 *
 * Solo club so it doesn't presence-pause with one viewer.
 */
test.describe('wordiply live updates', () => {
  test('a submitted guess lands on the board + advances the count without a refresh', async ({
    browser,
  }) => {
    const club = await createSoloClub('wply')
    const [alice] = club.members
    const game = await createWordiplyGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The base 'ar' is shown plainly at the top of the board.
    await expect(page.getByText('AR', { exact: true })).toBeVisible({ timeout: 15000 })
    // Starts with no guesses spent.
    await expect(page.getByText(/0 \/ 5 guesses/)).toBeVisible()

    await page.keyboard.type('hangars')
    await page.keyboard.press('Enter')

    // THE REALTIME PATH: the guess must appear on the board (the first <ol>) —
    // that row is driven by the guesses postgres-changes event, not a reload.
    await expect(page.locator('ol').first()).toContainText('HANGARS', { timeout: 10000 })
    // And the guess count advances (also derived from the realtime rows).
    await expect(page.getByText(/1 \/ 5 guesses/)).toBeVisible({ timeout: 10000 })

    await ctx.close()
  })
})
