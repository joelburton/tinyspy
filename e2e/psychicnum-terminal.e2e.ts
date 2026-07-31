import { test, expect } from '@playwright/test'
import { createSoloClub, createGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * psychicnum's terminal reveal: the board IS the answer key.
 *
 * At game over the server exposes `secrets` (the `psychicnum.games_view` terminal
 * gate), and every secret's tile gets a bright-green ring — over whatever
 * background it already had, so "was it found?" still reads. This replaced a text
 * list in the below-board pill ("The words were APPLE, RIVER, STONE"), which had
 * no room on a phone and made the player map words back to tiles by eye; the pill
 * now carries the terse verdict like every other game.
 *
 * Browser-only: the ring is CSS (`outline` on a tile), which jsdom can't see, and
 * the "background unchanged" half is only checkable by reading computed styles.
 */
test('terminal: secret tiles are ringed and the pill carries the verdict', async ({
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

  // Exactly the three secrets are ringed…
  await expect.poll(async () => (await ringed()).length, { timeout: 8000 }).toBe(3)
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
