import { test, expect } from '@playwright/test'
import { createSoloClub, createCrosswordsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke test for the CrossPlay (crosswords) coop play loop on screen: the
 * grid renders, clicking a cell + typing fills it, and completing the whole
 * 2×2 grid (answers C A / T S) solves the puzzle → the terminal modal shows.
 * Solo club so the game doesn't presence-pause with a single viewer.
 */
test.describe('crosswords play loop', () => {
  test('grid renders; filling the whole grid solves it', async ({ browser }) => {
    const club = await createSoloClub('xw')
    const [alice] = club.members
    const game = await createCrosswordsGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The 2×2 grid renders all 4 fillable cells.
    await expect(page.locator('[data-xw-cell]')).toHaveCount(4, { timeout: 15000 })

    // Fill the grid: click each cell, type its answer. The window key-capture
    // model means we type on the page keyboard, not into a field.
    const fill = async (row: number, col: number, letter: string) => {
      await page.locator(`[data-xw-cell][data-row="${row}"][data-col="${col}"]`).click()
      await page.keyboard.type(letter)
    }
    await fill(0, 0, 'c')
    await fill(0, 1, 'a')
    await fill(1, 0, 't')
    await fill(1, 1, 's')

    // Solving flips the game terminal → the shared game-over modal appears
    // (its verdict is "Solved!"; the same text also lands in the local pill).
    await expect(page.getByText('Solved!').first()).toBeVisible({ timeout: 10000 })
  })
})
