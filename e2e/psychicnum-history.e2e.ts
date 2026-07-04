import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, createGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Turn-history viewer for psychicnum — the feature added on the (still monolithic)
 * PlayArea. Clicking a turn-log #N replays that turn on the board: the tiles decided
 * up to that turn colored, that turn's guessed tile ringed history-yellow (over its
 * green/red outcome color), the board wearing the yellow frame, and a description
 * banner over the below-board slot. These are real layout/overlay properties jsdom
 * can't see, so this is a browser check — and it pins the shared exit paths
 * (keystroke / a board click / any click) + the no-reflow invariant.
 *
 * A SOLO coop game (one player) so there's no presence-pause to manage.
 */
const boardHeight = async (page: Page): Promise<number> => {
  const box = await page.locator('[data-board]').boundingBox()
  if (!box) throw new Error('board has no bounding box')
  return box.height
}

test.describe('psychicnum turn-history viewer', () => {
  test('clicking a turn replays it (frame + ringed tile + banner), exits, no reflow', async ({
    browser,
  }) => {
    const club = await createSoloClub('psy')
    const game = await createGame(club) // psychicnum_coop, solo
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // Guess one board word: click its tile (sets the pending guess), then the Submit
    // button. Its tile colors green/red and turn #1 logs — the log's #N handle
    // (`[data-turn-number]`) appearing is the robust "the guess landed" signal.
    await page.locator('[data-board] button').first().click()
    await page.getByRole('button', { name: 'Submit' }).click()
    const handle = page.locator('[data-turn-number]')
    await expect(handle).toBeVisible({ timeout: 15000 })
    const liveHeight = await boardHeight(page)

    // ── Open the viewer via the turn's #N handle: the banner appears over the
    // below-board slot; the board must not reflow (the banner overlays a fixed slot).
    await handle.click()
    const banner = page.locator('[title="Click to exit"]')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(Math.abs((await boardHeight(page)) - liveHeight)).toBeLessThan(1)

    // Visual capture — the yellow board frame, the ringed guessed tile, the banner.
    await page.screenshot({
      path: '/private/tmp/claude-501/-Users-joel-src-codenames/ed6e8ac1-4791-48ee-b2cd-8a67974e2f37/scratchpad/psychic-history-viewing.png',
      fullPage: true,
    })

    // ── Exit path A — a keystroke (the entry's capture is frozen while viewing).
    await page.keyboard.press('Space')
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Exit path B — clicking the BOARD returns to live (the framed board is
    // click-through, so the click falls to the viewer's document listener).
    await handle.click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await page.locator('[data-board]').click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Exit path C — a click anywhere else (the "Turns" log heading).
    await handle.click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await page.getByRole('heading', { name: 'Turns' }).click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    await ctx.close()
  })
})
