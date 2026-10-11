// cs-unmet

import { test, expect } from '@playwright/test'
import {
  createSoloClub,
  createWordsyCoopGame,
  plantWordsyWord,
  startWordsyRound,
  submitWordsyWord,
  wordsyTableLetters,
} from './helpers/fixtures'
import { signIn } from './helpers/session'
import { closeContextsAfterEach } from './helpers/contexts'

closeContextsAfterEach()

/**
 * A FlipWord solo game, the rulebook's card — the part only a browser shows:
 * the clock runs from the deal, the solo card sits beside the entry with its
 * border on green 1, a word in before the clock worth 15 or more earns the
 * card's bonus and under 20 moves the border down to amber 2, the next round
 * waits for Start, and after seven rounds the ending names the title.
 *
 * Round 1's table is the planted one (`createWordsyCoopGame`), so FABLED is
 * 18. The other six rounds are played through the RPCs on a planted word made
 * of each round's whole table (`wordsyTableLetters`, `plantWordsyWord`): 28 or
 * more every time, before the clock, so each earns the higher bonus and the
 * timer climbs back to 1 and stays. The best five are those words alone, well
 * past 120 before the bonuses — a Wordmaster, whatever the deal dealt.
 */
test('solo: the card moves with the word, and seven rounds earn a title', async ({ browser }) => {
  const club = await createSoloClub('wcs')
  const [me] = club.members
  const game = await createWordsyCoopGame(club)

  const ctx = await browser.newContext()
  await signIn(ctx, me.session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.getByTestId('board')).toBeVisible({ timeout: 25000 })

  // ── The clock runs from the deal; the card's border is on green 1.
  await expect.poll(async () => (await page.locator('header').first().innerText()).match(/\b\d:\d\d\b/)?.[0],
    { timeout: 10000 }).toMatch(/^0:[0-3]\d$/)
  const card = page.getByTestId('solo-card')
  await expect(card.getByTestId('band-1')).toHaveClass(/current/)

  // ── FABLED, 18, before the clock: the higher bonus (+2 in round 1), and
  // under 20 the border moves to amber 2. The round ends at once.
  await page.keyboard.type('fabled')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('round-scoresheet')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('round-scoresheet')).toContainText('+2')
  await expect(page.getByTestId('round-scoresheet').getByTestId('beat-clock')).toBeVisible()
  const log = page.getByRole('table').last()
  await expect(log).toContainText('fabled', { timeout: 10000 })
  await expect(log).toContainText('+2')

  // ── Round 2 waits for Start, which has focus: ↵ presses it. The card under
  // the new table's entry shows the move to 2.
  await expect(page.getByRole('button', { name: 'Start round 2' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('board')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('solo-card').getByTestId('band-2')).toHaveClass(/current/)

  // ── Rounds 2–7 through the RPCs: the whole table, before the clock, each
  // time. The padding keeps each word's root its own.
  for (let round = 2; round <= 7; round++) {
    const word = `${wordsyTableLetters(game.id)}${'a'.repeat(round)}`
    plantWordsyWord(word)
    await submitWordsyWord(me, game.id, word)
    if (round < 7) await startWordsyRound(me, game.id)
  }

  // ── The ending: the last round's sheet first, then the game's, headed by
  // the title; the pill and the info column say it.
  await expect(page.getByRole('button', { name: 'Show final scores' })).toBeFocused({ timeout: 15000 })
  await page.keyboard.press('Enter')
  const sheet = page.getByTestId('game-scoresheet')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Wordmaster')
  await expect(page.getByTestId('solo-card').getByTestId('band-1')).toHaveCount(0)
  await expect(page.getByText('Won (Wordmaster)')).toBeVisible()
})
