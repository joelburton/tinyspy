import { test, expect } from '@playwright/test'
import {
  createClubWithMembers,
  createCrosswordsGame,
  createCrosswordsGameFromLibrary,
  createSoloClub,
} from './helpers/fixtures'
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

  test('check flags a wrong letter; reveal writes the answer', async ({ browser }) => {
    const club = await createSoloClub('xwcr')
    const [alice] = club.members
    const game = await createCrosswordsGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-xw-cell]')).toHaveCount(4, { timeout: 15000 })

    const cell00 = page.locator('[data-xw-cell][data-row="0"][data-col="0"]')

    // Type a wrong letter (answer is C); typing advances the cursor, so
    // re-focus (0,0) before "Check letter" (which checks the cursor cell).
    await cell00.click()
    await page.keyboard.type('z')
    await cell00.click()
    await page.getByRole('button', { name: 'Check letter' }).click()
    await expect(cell00).toHaveAttribute('data-wrong', '', { timeout: 8000 })

    // Reveal the letter → the canonical answer lands + the cell is revealed.
    await cell00.click()
    await page.getByRole('button', { name: 'Reveal letter' }).click()
    await expect(cell00).toHaveAttribute('data-fill', 'C', { timeout: 8000 })
    await expect(cell00).toHaveAttribute('data-revealed', '')

    // Give up (coop End) → the terminal grid fills its blanks with the
    // revealed answers (A / T / S), greyed.
    await page.getByRole('button', { name: /^End$/ }).click()
    await expect(page.locator('[data-xw-cell][data-row="1"][data-col="1"]')).toHaveAttribute(
      'data-fill',
      'S',
      { timeout: 8000 },
    )
  })

  test('compete: finishing your own grid first wins', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createCrosswordsGame(club, 'compete')

    // Both players must be present or the game presence-pauses. bob just
    // watches; alice races her own private grid.
    const bobCtx = await browser.newContext()
    await signIn(bobCtx, bob.session)
    const bobPage = await bobCtx.newPage()
    await bobPage.goto(`/g/${game.gametype}/${game.id}`)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-xw-cell]')).toHaveCount(4, { timeout: 15000 })

    const fill = async (row: number, col: number, letter: string) => {
      await page.locator(`[data-xw-cell][data-row="${row}"][data-col="${col}"]`).click()
      await page.keyboard.type(letter)
    }
    await fill(0, 0, 'c')
    await fill(0, 1, 'a')
    await fill(1, 0, 't')
    await fill(1, 1, 's')

    // First to a correct grid wins outright.
    await expect(page.getByText('You solved it first!').first()).toBeVisible({ timeout: 10000 })
  })

  test('print board produces a PDF download', async ({ browser }) => {
    const club = await createSoloClub('xwpdf')
    const [alice] = club.members
    const game = await createCrosswordsGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-xw-cell]')).toHaveCount(4, { timeout: 15000 })

    await page.getByRole('button', { name: 'Game menu' }).click()
    const download = page.waitForEvent('download')
    await page.getByText('Print board (PDF)').click()
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
  })

  test('coop peer cursors: a teammate sees where you are', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createCrosswordsGame(club, 'coop')

    const aCtx = await browser.newContext()
    await signIn(aCtx, alice.session)
    const a = await aCtx.newPage()
    await a.goto(`/g/${game.gametype}/${game.id}`)

    const bCtx = await browser.newContext()
    await signIn(bCtx, bob.session)
    const b = await bCtx.newPage()
    await b.goto(`/g/${game.gametype}/${game.id}`)

    await expect(a.locator('[data-xw-cell]')).toHaveCount(4, { timeout: 15000 })
    await expect(b.locator('[data-xw-cell]')).toHaveCount(4, { timeout: 15000 })

    // Bob clicks cell (1,1) → Alice sees his cursor frame there.
    await b.locator('[data-xw-cell][data-row="1"][data-col="1"]').click()
    await expect(a.locator('[data-xw-cell][data-row="1"][data-col="1"][data-peer]')).toBeVisible({
      timeout: 10000,
    })

    // ...and the headline coop behavior: a letter Alice types syncs to Bob's
    // shared grid via the useCells direct-apply CDC path. Alice fills (0,0);
    // Bob sees the 'C' land in his own render of the same shared grid.
    await a.locator('[data-xw-cell][data-row="0"][data-col="0"]').click()
    await a.keyboard.type('c')
    await expect(b.locator('[data-xw-cell][data-row="0"][data-col="0"]')).toHaveAttribute(
      'data-fill',
      'C',
      { timeout: 10000 },
    )
  })

  // Compete privacy is enforced on the FE (the useCells `isMine` drop), NOT by
  // Realtime withholding rows — the opponent's CDC payload arrives on the wire
  // regardless, and the hook must drop it. Two compete clients: Alice fills her
  // grid; Bob's private grid must never show her letter.
  test('compete: an opponent never sees your letters', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createCrosswordsGame(club, 'compete')

    const bCtx = await browser.newContext()
    await signIn(bCtx, bob.session)
    const b = await bCtx.newPage()
    await b.goto(`/g/${game.gametype}/${game.id}`)

    const aCtx = await browser.newContext()
    await signIn(aCtx, alice.session)
    const a = await aCtx.newPage()
    await a.goto(`/g/${game.gametype}/${game.id}`)

    await expect(a.locator('[data-xw-cell]')).toHaveCount(4, { timeout: 15000 })
    await expect(b.locator('[data-xw-cell]')).toHaveCount(4, { timeout: 15000 })

    // Alice fills (0,0) on her own private grid.
    await a.locator('[data-xw-cell][data-row="0"][data-col="0"]').click()
    await a.keyboard.type('c')
    // Alice sees her own letter (sanity: the write really happened + synced).
    await expect(a.locator('[data-xw-cell][data-row="0"][data-col="0"]')).toHaveAttribute(
      'data-fill',
      'C',
      { timeout: 10000 },
    )

    // Give any leaked CDC ample time to (wrongly) arrive, then assert Bob's
    // corresponding cell is still empty. `data-fill` renders as '' when blank.
    await b.waitForTimeout(1500)
    await expect(b.locator('[data-xw-cell][data-row="0"][data-col="0"]')).toHaveAttribute(
      'data-fill',
      '',
    )
  })

  // Regression guard for the layout exception: a full-size grid must fit the
  // viewport — the board fills, the clue lists scroll INTERNALLY, and the
  // page itself never scrolls. (Needs a seeded library; skips if empty.)
  test('a full-size puzzle fits the viewport without scrolling the page', async ({ browser }) => {
    const club = await createSoloClub('xwfit')
    const [alice] = club.members
    let game: { id: string; gametype: string; width: number }
    try {
      game = await createCrosswordsGameFromLibrary(club)
    } catch {
      test.skip(true, 'no library puzzles imported')
      return
    }
    test.skip(game.width < 10, 'need a real full-size puzzle to test scrolling')

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-xw-cell]').first()).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(400)

    const s = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement
      return { scrollH: el.scrollHeight, clientH: el.clientHeight }
    })
    expect(s.scrollH).toBeLessThanOrEqual(s.clientH + 2)
  })
})
