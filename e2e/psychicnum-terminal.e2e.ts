import { test, expect } from '@playwright/test'
import { createSoloClub, createGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * psychicnum's terminal reveal: the board becomes the answer key — but only when
 * asked. The server exposes `secrets` at game over (the `psychicnum.games_view`
 * terminal gate), and the FE holds them back on anything but a clean win, because
 * `replay_board` hunts the SAME three secrets again (docs/ui.md → Terminal
 * results). Pressing Reveal rings every secret's tile bright green — over
 * whatever background it already had, so "was it found?" still reads.
 *
 * The ring replaced a text list in the below-board pill ("The words were APPLE,
 * RIVER, STONE"), which had no room on a phone and made the player map words back
 * to tiles by eye; the pill now carries the terse verdict like every other game.
 *
 * Browser-only: the ring is CSS (`outline` on a tile), which jsdom can't see, and
 * the "background unchanged" half is only checkable by reading computed styles.
 */
test('terminal: secrets stay hidden until Reveal, then ring the tiles', async ({
  browser,
}) => {
  const club = await createSoloClub('pnterm')
  const game = await createGame(club) // coop, solo → no presence-pause
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

  // Mid-game: nothing is ringed (the secrets aren't even on the client yet).
  const ringed = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-board] button')]
        .filter((b) => getComputedStyle(b).outlineColor === 'rgb(0, 230, 118)')
        .map((b) => b.textContent),
    )
  expect(await ringed()).toHaveLength(0)

  // End the game (the neutral 'ended' terminal) — that flips is_terminal, and the
  // secrets arrive on the next realtime refetch.
  await page.getByRole('button', { name: /^end$/i }).click()
  await page.getByRole('button', { name: 'End game' }).click()

  // The terminal row is up, and the secrets are STILL not ringed: a manual end
  // isn't a win, and Restart re-hunts this very board.
  const reveal = page.getByRole('button', { name: /^reveal/i })
  await expect(reveal).toBeVisible({ timeout: 8000 })
  expect(await ringed()).toHaveLength(0)

  // Asking for them rings exactly the three secrets…
  await reveal.click()
  await expect.poll(async () => (await ringed()).length, { timeout: 8000 }).toBe(3)
  // …the control self-disables once they're on screen…
  await expect(reveal).toBeDisabled()
  // …and their BACKGROUNDS are untouched by the ring: this game was ended without
  // a single guess, so every tile — secrets included — still wears the plain tile
  // fill, not a result color.
  const bgs = await page.evaluate(() =>
    [...document.querySelectorAll('[data-board] button')]
      .filter((b) => getComputedStyle(b).outlineColor === 'rgb(0, 230, 118)')
      .map((b) => getComputedStyle(b).backgroundColor),
  )
  const plain = await page.evaluate(
    () =>
      getComputedStyle(
        [...document.querySelectorAll('[data-board] button')].find(
          (b) => getComputedStyle(b).outlineColor !== 'rgb(0, 230, 118)',
        )!,
      ).backgroundColor,
  )
  expect(new Set(bgs)).toEqual(new Set([plain]))

  // The below-board pill carries the verdict (the shared neutral end copy), not a
  // word list.
  await expect(page.getByText('Game ended', { exact: true })).toBeVisible()

  await ctx.close()
})

/**
 * "Restart" + "New game" — the terminal action row's stay-here options,
 * also reachable mid-game from the menu. Replay hunts THIS board's same three
 * secrets again (guesses cleared, budgets restored); New game deals a fresh
 * board + secrets on a NEW row and navigates to it.
 *
 * A browser test because both are round trips: the reset arrives back over the
 * realtime refetch, and New game is a navigation to a different id.
 */
test.describe('psychicnum replay + new game', () => {
  test('a guess is wiped by "Restart" (same board, budget restored)', async ({ browser }) => {
    const club = await createSoloClub('pnrp')
    const game = await createGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // Guess the first board word → a turn-log row appears and the budget ticks.
    await page.locator('[data-board] button').first().click()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText('No turns yet.')).toBeHidden({ timeout: 10000 })

    // Mid-game replay confirms — arm the handler BEFORE the click, or
    // Playwright's default auto-dismiss cancels it.
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'Restart' }).click()

    await expect(page.getByText('No turns yet.')).toBeVisible({ timeout: 10000 })
    await ctx.close()
  })

  test('menu "New game" starts a FRESH game (new id, same setup)', async ({ browser }) => {
    const club = await createSoloClub('pnng')
    const game = await createGame(club)
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
})
