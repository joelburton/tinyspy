import { test, expect } from '@playwright/test'
import { createSoloClub, createLetterboxedGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke test for letterboxed (SnakeBox), covering the two input paths the game
 * offers and the realtime path a move takes to the board.
 *
 * The board is the synthetic `abcdefghijkl` (sides `abc | def | ghi | jkl`), so
 * ADG is legal — a→d→g crosses a side boundary at every step — and the next
 * word must then start with G.
 *
 * Solo club so it doesn't presence-pause with one viewer.
 */
test.describe('letterboxed', () => {
  test('typing a word plays it, and the next word is seeded with the tail letter', async ({
    browser,
  }) => {
    const club = await createSoloClub('lbx')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The board renders all twelve letters.
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('svg text')).toHaveCount(12)

    // Nothing covered yet.
    await expect(page.getByText('No words yet')).toBeVisible()

    await page.keyboard.type('adg')
    await page.keyboard.press('Enter')

    // THE REALTIME PATH: the chain list is driven by the players postgres-changes
    // event, so the word appearing there without a reload can only come through
    // the live channel.
    await expect(page.getByRole('listitem').filter({ hasText: /^ADG$/ }).first())
      .toBeVisible({ timeout: 10000 })

    // …and the entry re-seeds ITSELF with the letter the next word must start
    // with — so the box now holds "g", not a placeholder telling you to type
    // one. The seed is derived from the chain rather than typed, which is what
    // lets Backspace stop at it instead of clearing it.
    await expect(page.getByTestId('entry-value')).toHaveText('g', { timeout: 10000 })
  })

  test('clicking letters builds a word; clicking the last one again submits it', async ({
    browser,
  }) => {
    const club = await createSoloClub('lbx2')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })

    const letter = (ch: string) => page.locator('svg g').filter({ hasText: new RegExp(`^${ch}$`) })

    await letter('A').click()
    await letter('D').click()
    await letter('G').click()
    // The second click on the word's LAST letter submits — unambiguous because
    // a word can never repeat a letter back-to-back (same letter = same side).
    await letter('G').click()

    await expect(page.getByRole('listitem').filter({ hasText: /^ADG$/ }).first())
      .toBeVisible({ timeout: 10000 })
  })
})
