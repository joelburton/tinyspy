// cs-unmet

import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { createClubWithMembers, createWordsyGame, endWordsyRound, startWordsyRound, submitWordsyWord } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { closeContextsAfterEach } from './helpers/contexts'

closeContextsAfterEach()

/**
 * Smoke: wordsy's "Print board (PDF)" menu item generates and downloads a
 * real PDF. jsPDF's runtime is unreachable from the mocked component tests, so
 * this drives the real path in a browser, with a finished round so the totals,
 * the table and the log all print.
 */
test('the Print menu item downloads a non-empty PDF', async ({ browser }) => {
  const club = await createClubWithMembers(['wpa', 'wpb'])
  const [a, b] = club.members
  const game = await createWordsyGame(club)
  await submitWordsyWord(a, game.id, 'cab')
  await submitWordsyWord(b, game.id, 'fable')
  await endWordsyRound(a, game.id)
  await startWordsyRound(a, game.id)
  await startWordsyRound(b, game.id)

  // Both open: the game pauses until everyone is here.
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

  await page.getByRole('button', { name: 'Game menu' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByText('Print board (PDF)').click(),
  ])

  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  const bytes = readFileSync(await download.path())
  expect(bytes.length, 'a real PDF, not an empty file').toBeGreaterThan(1000)
  expect(bytes.subarray(0, 5).toString('latin1'), 'PDF magic bytes').toBe('%PDF-')
})
