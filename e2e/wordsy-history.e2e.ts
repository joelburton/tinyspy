// cs-unmet

import { test, expect, type Page } from '@playwright/test'
import {
  createClubWithMembers,
  createWordsyGame,
  endWordsyRound,
  startWordsyRound,
  submitWordsyWord,
  WORDSY_TABLE_LETTERS,
} from './helpers/fixtures'
import { signIn } from './helpers/session'
import { closeContextsAfterEach } from './helpers/contexts'

closeContextsAfterEach()

/**
 * The turn-history viewer for wordsy: a log row's `#N` is its round, and
 * clicking it puts that round's table on the board with the viewer's banner.
 * Round 1 is the planted table; round 2 slides its first four cards right and
 * deals four new ones, so the two boards differ and the spec can tell which
 * is shown. The shared exits are pinned by the other games' history specs;
 * this checks a keystroke leaves.
 */

/** The board's eight letters, in slot order. */
async function boardLetters(page: Page): Promise<string> {
  const letters = await page.getByTestId('board').locator('[class*="letter"]').allInnerTexts()
  return letters.join('').toUpperCase()
}

test('#1 opens round 1\'s table; a key returns to the live round', async ({ browser }) => {
  const club = await createClubWithMembers(['wha', 'whb'])
  const [a, b] = club.members
  const game = await createWordsyGame(club)
  await submitWordsyWord(a, game.id, 'cab')
  await submitWordsyWord(b, game.id, 'elf')
  await endWordsyRound(a, game.id)
  await startWordsyRound(a, game.id)
  await startWordsyRound(b, game.id)

  const pages: Page[] = []
  for (const member of club.members) {
    const ctx = await browser.newContext()
    await signIn(ctx, member.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    pages.push(page)
  }
  const page = pages[0]!
  await expect(page.getByTestId('board')).toBeVisible({ timeout: 25000 })
  const live = await boardLetters(page)
  expect(live, 'round 2 is not round 1').not.toBe(WORDSY_TABLE_LETTERS)

  await page.locator('[data-history-handle]').first().click()
  const banner = page.locator('[data-history-banner]')
  await expect(banner).toBeVisible({ timeout: 10000 })
  await expect(banner).toContainText('Round 1 of 7')
  expect(await boardLetters(page)).toBe(WORDSY_TABLE_LETTERS)

  await page.keyboard.press('a')
  await expect(banner).toBeHidden({ timeout: 10000 })
  expect(await boardLetters(page)).toBe(live)
})
