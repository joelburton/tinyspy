import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, createStrandsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * strands typed input + the move row.
 *
 * The point of the feature is that a keystroke names a CELL, so the cases that
 * matter are about *how many cells a letter could mean* — which is a property of
 * one specific board. `createStrandsGame` pins the puzzle by date (2025-06-15),
 * so the grid below is frozen and these coordinates stay true:
 *
 *        col  0 1 2 3 4 5
 *     row 0   A R C P A P
 *         1   W D Z A R A
 *         2   A D Z I C H
 *         3   A T H A L A
 *         4   F P E P U Y
 *         5   P O R S D A
 *         6   S E O C P O
 *         7   I C L R N P
 *
 * e2e rather than unit because `typeLetter`'s rules are already exhaustively
 * unit-tested (lib/trace.test.ts); what only a browser can show is the three
 * halves meeting — the key handler, the red rings the board draws, and the
 * shared move row.
 */

const cell = (page: Page, [r, c]: [number, number]) => page.locator(`[data-cell="${r},${c}"]`)
/** The traced word, as the EntryBox renders it. */
const entry = (page: Page) => page.getByTestId('entry-value')
/** Cells ringed red because a typed letter matched more than one of them. */
const rings = (page: Page) => page.locator('circle[class*="discAmbiguous"]')

async function openGame(browser: import('@playwright/test').Browser, handle: string) {
  const club = await createSoloClub(handle)
  const game = await createStrandsGame(club)
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })
  return { ctx, page }
}

test.describe('strands typed input', () => {
  test('a unique letter extends; an ambiguous one rings red and waits for a click', async ({
    browser,
  }) => {
    const { ctx, page } = await openGame(browser, 'pptype')

    // Anchor on C[2,4] — a word's first letter is a click, since the same letter
    // is scattered all over the board.
    await cell(page, [2, 4]).click()
    await expect(entry(page)).toHaveText('C')

    // 'h' — the only H among [2,4]'s eight neighbours is [2,5]. Types straight in.
    await page.keyboard.press('h')
    await expect(entry(page)).toHaveText('CH')

    // 'a' — TWO A's neighbour [2,5]: [1,5] and [3,5]. So nothing is appended,
    // both ring red, and no pill appears (the rings are the message; a pill here
    // would cover the very word being built).
    await page.keyboard.press('a')
    await expect(rings(page)).toHaveCount(2)
    await expect(entry(page)).toHaveText('CH')

    // Clicking one resolves it — and the rings go at once rather than sitting
    // there pointing at a choice already made.
    await cell(page, [3, 5]).click()
    await expect(entry(page)).toHaveText('CHA')
    await expect(rings(page)).toHaveCount(0)

    await ctx.close()
  })

  test('a letter that matches nothing says so, and says which nothing', async ({ browser }) => {
    const { ctx, page } = await openGame(browser, 'ppnone')

    // From cold, the whole board is in scope — and it holds no Q at all.
    await page.keyboard.press('q')
    await expect(page.getByText(/No “Q” left on the board/)).toBeVisible()

    // Mid-word the scope is the neighbours, so the same key means something
    // narrower — and the message says so rather than repeating itself.
    await cell(page, [2, 4]).click()
    await page.keyboard.press('q')
    await expect(page.getByText(/No “Q” next to that letter/)).toBeVisible()

    await ctx.close()
  })

  test('the move row’s buttons take back a letter and submit', async ({ browser }) => {
    const { ctx, page } = await openGame(browser, 'ppbtn')

    const del = page.getByRole('button', { name: 'Delete' })
    const submit = page.getByRole('button', { name: 'Submit' })

    await cell(page, [2, 4]).click()
    await page.keyboard.press('h')
    await expect(entry(page)).toHaveText('CH')

    // ⌫ button — the pointer twin of Backspace.
    await del.click()
    await expect(entry(page)).toHaveText('C')

    // Submit button — the pointer twin of Enter, and the only way to submit on a
    // phone that doesn't mean re-clicking the last letter. Two cells is under
    // the 4-letter floor, so the answer is "too short" — which is a real commit,
    // and what this is checking.
    await page.keyboard.press('h')
    await submit.click()
    await expect(page.getByText(/too short/i)).toBeVisible({ timeout: 10000 })

    await ctx.close()
  })
})
