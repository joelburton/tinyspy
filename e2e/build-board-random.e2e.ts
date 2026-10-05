// cs-unmet

import { test, expect } from '@playwright/test'
import { createSoloClub } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'
import { startGameRow } from './helpers/clubPage'
import { closeContextsAfterEach } from './helpers/contexts'

closeContextsAfterEach()

/**
 * The RANDOM path of each `<game>-build-board` edge function — the one a player
 * takes by keeping the setup defaults and pressing Start. The other specs build
 * these games with `create_game` directly or through the custom-letters branch,
 * so neither reaches the random path's reads of the club's earlier games.
 *
 * Each case builds two games in one club: the first from the setup dialog,
 * when the club has no earlier game of that kind, and the second from the
 * menu's New game, when it has one. Only the second reads a previous board.
 *
 * letterboxed's random path is covered in `letterboxed.e2e.ts`, and waffle's
 * in `waffle.e2e.ts`.
 */
const GAMES = [
  { codename: 'spellingbee', brand: /FreeBee/, board: '[data-board]' },
  { codename: 'wordwheel', brand: /MooseWheel/, board: '[data-board]' },
  { codename: 'wordiply', brand: /WordWire/, board: '[data-board]' },
  { codename: 'boggle', brand: /MothCubes/, board: '[data-tile]' },
]

for (const { codename, brand, board } of GAMES) {
  test(`${codename}: a random board builds, and New game builds another`, async ({ browser }) => {
    const club = await createSoloClub(`rb${codename.slice(0, 4)}`)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    // Coop is the enabled button in a solo club; the defaults are left alone.
    await startGameRow(page, brand).click()
    await page.getByRole('button', { name: 'Start' }).click()
    const gamePath = new RegExp(`/g/${codename}_coop/[0-9a-f-]{36}$`)
    await expect(page).toHaveURL(gamePath, { timeout: 20000 })
    await boardReady(page, page.locator(board).first(), 20000)
    const firstUrl = page.url()

    // New game confirms mid-play, then builds a fresh game with this setup.
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'New game' }).click()
    await page.getByRole('button', { name: 'Start new game' }).click()
    await expect(page).not.toHaveURL(firstUrl, { timeout: 20000 })
    await expect(page).toHaveURL(gamePath)
    await boardReady(page, page.locator(board).first(), 20000)
  })
}
