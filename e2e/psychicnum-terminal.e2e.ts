import { test, expect } from '@playwright/test'
import { createSoloClub, createGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * psychicnum's terminal reveal: the board becomes the answer key — but only when
 * asked, and only for the asker. The server exposes `secrets` at game over (the
 * `psychicnum.games_view` terminal gate), and the FE holds them back until this
 * viewer presses Reveal — never on its own, a win included, because
 * `replay_board` hunts the SAME three secrets again (docs/ui.md → Terminal
 * results). Pressing Reveal turns every secret's tile GREEN — the same green a
 * found one wears — and pressing Hide turns them back.
 *
 * REVEALING IS A STATE CHANGE, NOT A MARK (docs/tile-feedback.md). This spec used
 * to look for a neon-green ring in a token of its own, which is what psychicnum
 * drew until its tile-feedback conversion (2026-08-17) retired the whole
 * answer-key channel: a game's state colours say what is TRUE about a piece, and
 * asking to see the answer changes what you know rather than what the board is.
 * Reveal being personal and reversible is what pays for it — one toggle separates
 * "we found it" from "I am peeking", so the board doesn't have to. And where a
 * board shows WHO decided a tile, the distinction survives anyway: a found tile
 * carries its guesser's dot, a revealed one has nobody to name.
 *
 * (The spec went red at that conversion and stayed red until the palette sweep
 * ran the e2e suite — nothing else had.)
 *
 * Browser-only: the fills are CSS, which jsdom can't see.
 */
test('terminal: secrets stay hidden until Reveal, ring the tiles, then un-ring', async ({
  browser,
}) => {
  const club = await createSoloClub('pnterm')
  const game = await createGame(club) // coop, solo → no presence-pause
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

  // Mid-game: nothing is green (the secrets aren't even on the client yet).
  // `--outcome-won-fill-color`, the green a decided-and-correct tile wears.
  const GREEN = 'rgb(102, 187, 106)'
  const ringed = () =>
    page.evaluate((green) =>
      [...document.querySelectorAll('[data-board] [data-tile]')]
        .filter((b) => getComputedStyle(b).backgroundColor === green)
        .map((b) => b.textContent),
    GREEN)
  expect(await ringed()).toHaveLength(0)

  // End the game (the neutral 'ended' terminal) — that flips is_terminal, and the
  // secrets arrive on the next realtime refetch.
  await page.getByRole('button', { name: 'End game' }).first().click()
  await page.locator('[data-floating-panel]').getByRole('button', { name: 'End game' }).click()

  // The terminal row is up, and the secrets are STILL not shown: a manual end
  // isn't a win, and Restart re-hunts this very board.
  const reveal = page.getByRole('button', { name: /^reveal/i })
  await expect(reveal).toBeVisible({ timeout: 8000 })
  expect(await ringed()).toHaveLength(0)

  // Asking for them turns exactly the three secrets green…
  await reveal.click()
  await expect.poll(async () => (await ringed()).length, { timeout: 8000 }).toBe(3)
  // …and nothing else moved: the other tiles keep the plain resting fill, since
  // this game was ended without a single guess.
  const others = await page.evaluate(
    (green) =>
      new Set(
        [...document.querySelectorAll('[data-board] [data-tile]')]
          .map((b) => getComputedStyle(b).backgroundColor)
          .filter((bg) => bg !== green),
      ).size,
    GREEN,
  )
  expect(others).toBe(1)

  // The same button, now wearing its Hide face, takes the green back off — the
  // board as the players actually left it.
  await page.getByRole('button', { name: /^hide/i }).click()
  await expect.poll(async () => (await ringed()).length, { timeout: 8000 }).toBe(0)
  await expect(reveal).toBeVisible()

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

    // Mid-game restart is confirmed through the styled ConfirmDialog (it wipes
    // the group's progress) — the browser alert went away 2026-08-03, so the
    // dialog is a real button in the page.
    await page.getByRole('button', { name: 'Game menu' }).click()
    await page.getByRole('menuitem', { name: 'Restart' }).click()
    await page.getByRole('button', { name: 'Restart', exact: true }).click()

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
