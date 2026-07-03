import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, createWordleGame, seedWordleGuesses } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Turn-history viewer for wordle — the feature added on the (still monolithic)
 * PlayArea. Clicking a turn-log #N replays that turn on the board: the guess rows up
 * to that turn shown, that turn's row ringed history-yellow (over its g/y/x colors),
 * the board wearing the yellow frame, and a description banner over the below-board
 * region (covering the keyboard). These are real layout/overlay properties jsdom
 * can't see, so this is a browser check — and it pins the shared exit paths
 * (keystroke / a board click / any click) + the no-reflow invariant.
 *
 * A SOLO coop game (one player) so there's no presence-pause to manage, and the log
 * shows my own board (so the #N handles are live). Two guesses are seeded up front
 * (through the real RPC), so the page loads with a populated turn log.
 */
const boardHeight = async (page: Page): Promise<number> => {
  const box = await page.locator('[data-board]').boundingBox()
  if (!box) throw new Error('board has no bounding box')
  return box.height
}

test.describe('wordle turn-history viewer', () => {
  test('clicking a turn replays it (frame + ringed row + banner), exits, no reflow', async ({
    browser,
  }) => {
    const club = await createSoloClub('wrd')
    const game = await createWordleGame(club) // wordle_coop, solo
    // Seed two accepted guesses so the log has two #N handles to open.
    const words = await seedWordleGuesses(club.members[0], game.id, 2)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // Both guesses log a #N handle (`[data-turn-number]`); wait for them to arrive.
    const handles = page.locator('[data-turn-number]')
    await expect(handles).toHaveCount(2, { timeout: 15000 })
    const liveHeight = await boardHeight(page)

    // ── Open the viewer via turn #2's handle: the banner names the turn (its
    // guessed word) and overlays the below-board region; the board must not reflow.
    await handles.nth(1).click()
    const banner = page.locator('[title="Click to exit"]')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner).toContainText(`Guess 2: ${words[1]}`)
    await expect(Math.abs((await boardHeight(page)) - liveHeight)).toBeLessThan(1)

    // Switching turns without leaving the viewer — click #1's handle; the banner
    // re-labels to the first guess (the `data-turn-number` marker keeps the click
    // from being treated as "click away").
    await handles.first().click()
    await expect(banner).toContainText(`Guess 1: ${words[0]}`)

    // Visual capture — the yellow board frame, the ringed guess row, the banner.
    await page.screenshot({
      path: '/private/tmp/claude-501/-Users-joel-src-codenames/ed6e8ac1-4791-48ee-b2cd-8a67974e2f37/scratchpad/wordle-history-viewing.png',
      fullPage: true,
    })

    // ── Exit path A — a keystroke (the board's capture is frozen while viewing, so
    // the key returns to live instead of typing a letter).
    await page.keyboard.press('a')
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Exit path B — clicking the BOARD returns to live (the framed grid is
    // click-through via `pointer-events: none`, so a click on the board area lands
    // on the wrapper behind it and falls to the viewer's document listener). We click
    // that wrapper (the grid's parent) — the element a real click actually hits, since
    // Playwright won't target the pointer-events:none grid itself.
    await handles.first().click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await page.locator('[data-board]').locator('xpath=..').click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Exit path C — a click anywhere else (the "Guesses" log heading).
    await handles.first().click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await page.getByRole('heading', { name: 'Guesses' }).click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    await ctx.close()
  })
})
