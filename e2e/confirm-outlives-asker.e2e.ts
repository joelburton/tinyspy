// cs-unmet

import { test, expect, type Page } from '@playwright/test'
import { asUser, createClubWithMembers, createWordwheelGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * A question whose asker has gone does not stay up to be answered.
 *
 * The confirmation is drawn by one host above every route, so it used to
 * outlive the page that asked it: bea opens "Restart this game?", ada suspends
 * the game from her tab, ada's broadcast moves bea to the club page — and the
 * question stayed there, where pressing Restart fired `replay_board` on the
 * game bea had just left, wiping it for everyone. The binding that asked now
 * takes its question back when it unmounts (common/actions → useBoundAction).
 *
 * The found word bea submits first is what a stray Restart would have wiped, so
 * reading it back at the end is the proof the board survived.
 */
test.describe('a confirmation question outlives its asker', () => {
  test("a peer's suspend takes the Restart question down with the game page", async ({ browser }) => {
    const club = await createClubWithMembers(['ada', 'bea'])
    const [ada, bea] = club.members
    const game = await createWordwheelGame(club)

    const open = async (session: typeof ada.session): Promise<Page> => {
      const ctx = await browser.newContext()
      await signIn(ctx, session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)
      return page
    }
    const adaPage = await open(ada.session)
    const beaPage = await open(bea.session)
    // Only now wait for the wheels: a lone player is paused, so neither board
    // renders until presence has seen both tabs.
    await boardReady(adaPage, adaPage.locator('[data-wheel]'), 15000)
    await boardReady(beaPage, beaPage.locator('[data-wheel]'), 15000)

    // A found word, so there is something for a stray Restart to wipe.
    await beaPage.keyboard.type('bead')
    await beaPage.keyboard.press('Enter')
    await expect(beaPage.locator('[data-word="bead"]')).toBeVisible({ timeout: 10000 })

    // Bea asks to restart, and leaves the question up.
    await beaPage.getByRole('button', { name: 'Game menu' }).click()
    await beaPage.getByRole('menuitem', { name: 'Restart' }).click()
    await expect(beaPage.getByText('Restart this game?')).toBeVisible({ timeout: 5000 })

    // Ada suspends the game; her broadcast brings bea back to the club too.
    await adaPage.getByRole('button', { name: 'Game menu' }).click()
    await adaPage.getByRole('menuitem', { name: /back to club/i }).click()
    await adaPage.locator('[data-floating-panel]').getByRole('button', { name: 'Suspend' }).click()
    await expect(adaPage).toHaveURL(/\/c\//, { timeout: 10000 })
    await expect(beaPage).toHaveURL(/\/c\//, { timeout: 10000 })

    // The question went with the page that asked it — nothing left to answer.
    await expect(beaPage.getByText('Restart this game?')).toBeHidden()
    expect(await beaPage.locator('[data-floating-panel]').getByRole('button', { name: 'Restart' }).count()).toBe(0)

    // And the board is as bea left it: her word is still on it.
    const { data, error } = await asUser(bea.session.access_token)
      .schema('wordwheel')
      .from('found_words')
      .select('word')
      .eq('game_id', game.id)
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.word)).toEqual(['bead'])
  })
})
