// cs-unmet

import { test, expect, type Page } from '@playwright/test'
import { createClubWithMembers, createWordsyGame, endWordsyRound, startWordsyRound } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { closeContextsAfterEach } from './helpers/contexts'

closeContextsAfterEach()

/**
 * A FlipWord round across two clients — the part only a browser can show: the
 * first word in starts the header's 30-second clock on BOTH pages, the caution
 * frame lands on the other player's board while the submitter's dims, the
 * other player may submit again and their last word stands, and the reveal
 * reaches both pages when the round ends: the round's scoresheet in the
 * board's place, and both logs. Round 2 waits for both to press Start, and
 * arrives on both boards in the yellow frame.
 *
 * The table is the planted one (`createWordsyGame`), so CAB and ELF score 9
 * and BOLD 12. The round is ended by `endWordsyRound` rather than by waiting
 * out the clock: the timeout is the same RPC every page fires at zero.
 */

/** The header's clock, as M:SS, or null when none is shown. */
async function clockOf(page: Page): Promise<string | null> {
  const text = await page.locator('header').first().innerText()
  return text.match(/\b\d:\d\d\b/)?.[0] ?? null
}

test('the first word starts the clock on both pages; the last word stands; the reveal reaches both', async ({
  browser,
}) => {
  const club = await createClubWithMembers(['wra', 'wrb'])
  const [a, b] = club.members
  const game = await createWordsyGame(club)

  // Both open before either waits: the game pauses until everyone is here.
  async function open(member: typeof a) {
    const ctx = await browser.newContext()
    await signIn(ctx, member.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    return page
  }
  const pageA = await open(a)
  const pageB = await open(b)
  await expect(pageA.getByTestId('board')).toBeVisible({ timeout: 25000 })
  await expect(pageB.getByTestId('board')).toBeVisible({ timeout: 25000 })
  expect(await clockOf(pageA), 'no clock before anyone submits').toBeNull()

  // ── A's word is the first in: the clock starts on both pages.
  await pageA.keyboard.type('cab')
  await pageA.keyboard.press('Enter')
  await expect(pageA.getByText('Your word is in:')).toBeVisible({ timeout: 10000 })
  await expect.poll(() => clockOf(pageA), { timeout: 10000 }).toMatch(/^0:[0-3]\d$/)
  await expect.poll(() => clockOf(pageB), { timeout: 10000 }).toMatch(/^0:[0-3]\d$/)

  // The caution frame on B's board, never on A's, whose board dims instead:
  // A's word is in. B's header names A.
  await expect(pageB.getByTestId('board')).toHaveClass(/clockStartFlash/, { timeout: 10000 })
  await expect(pageA.getByTestId('board')).not.toHaveClass(/clockStartFlash/)
  await expect(pageA.getByTestId('board')).toHaveClass(/dimNotYourTurn/)
  await expect(pageB.locator('header').getByText('submitted — 30 seconds')).toBeVisible()

  // ── B submits twice; the second word stands.
  await pageB.keyboard.type('elf')
  await pageB.keyboard.press('Enter')
  await expect(pageB.getByText('Your word:')).toBeVisible({ timeout: 10000 })
  await pageB.keyboard.type('bold')
  await pageB.keyboard.press('Enter')
  await expect(pageB.getByText('Your word:').locator('..')).toContainText('bold', { timeout: 10000 })

  // ── The round ends: the scoresheet in the board's place, both logs fill,
  // and the clock is put away.
  await endWordsyRound(a, game.id)
  for (const page of [pageA, pageB]) {
    await expect(page.getByTestId('round-scoresheet')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('board')).toHaveCount(0)
    // The log is the page's last table: the scoresheet's comes first.
    const log = page.getByRole('table').last()
    await expect(log.locator('tr')).toHaveCount(2, { timeout: 15000 })
    await expect(log).toContainText('cab')
    await expect(log).toContainText('bold')
    // BOLD (12) beat the Fastest's CAB (9) in round 1: +1.
    await expect(log).toContainText('+1')
    await expect.poll(() => clockOf(page), { timeout: 10000 }).toBeNull()
  }

  // ── Round 2 waits: A's press reads Waiting for others; B's deals it.
  await pageA.getByRole('button', { name: 'Start round 2' }).click()
  await expect(pageA.getByRole('button', { name: 'Waiting for others' })).toBeDisabled({ timeout: 10000 })
  await expect(pageB.getByTestId('round-scoresheet')).toBeVisible()
  await startWordsyRound(b, game.id)
  for (const page of [pageA, pageB]) {
    await expect(page.getByTestId('board')).toHaveClass(/yourTurnFlash/, { timeout: 10000 })
  }
})
