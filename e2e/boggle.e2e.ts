import { test, expect } from '@playwright/test'
import { createSoloClub, createBoggleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke test for the MothCubes (boggle) play loop on screen: the board renders,
 * a typed required word lands in the found-words list, and an off-board word is
 * rejected. Solo club so the game doesn't presence-pause with a single viewer.
 * The board (fixed in the fixture) spells "cat" across its top row.
 */
test.describe('boggle play loop', () => {
  test('board renders; a required word lands and an off-board word is rejected', async ({
    browser,
  }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createBoggleGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The 4×4 board renders all 16 tiles.
    await expect(page.locator('[data-boggle-tile]')).toHaveCount(16, { timeout: 15000 })

    // v3 move entry is the shared CAPTURE model (window key-capture + a
    // chrome-less <EntryBox> display — no <input>), so type on the page keyboard
    // rather than filling a field.
    // Type the required word "cat" and submit → it lands in the list (rows are
    // role=button, rendered uppercase).
    await page.keyboard.type('cat')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'CAT' })).toBeVisible({ timeout: 10000 })

    // An off-board word ("zzz" — no Z on the board) is rejected: never listed.
    await page.keyboard.type('zzz')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'ZZZ' })).toHaveCount(0)

    await ctx.close()
  })

  // Tap-to-trace (mobile-first, but works with a mouse too): build a word by
  // tapping tiles along a Boggle path. The fixture board is `C A T R` across the
  // top row (indices 0/1/2/3), so tapping tiles 0→1→2 traces "CAT".
  test('tap-tracing a path builds and submits a word; adjacency + backtrack hold', async ({
    browser,
  }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createBoggleGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    const tiles = page.locator('[data-boggle-tile]')
    await expect(tiles).toHaveCount(16, { timeout: 15000 })
    // Highlighted path tiles carry the (hashed) `.selected` class.
    const selected = page.locator('[data-boggle-tile][class*="selected"]')

    // Trace C(0) → A(1) → T(2): three adjacent tiles along the top row.
    await tiles.nth(0).click()
    await tiles.nth(1).click()
    await tiles.nth(2).click()
    await expect(selected).toHaveCount(3)

    // Adjacency guard: tile 6 (row 1, col 2) is NOT king-adjacent to T at (0,2)
    // via (0,1)… actually T→(1,2) IS adjacent; use a clearly-distant tile instead.
    // Tile 15 (bottom-right corner) is far from the top row — tapping it is ignored.
    await tiles.nth(15).click()
    await expect(selected).toHaveCount(3)

    // Backtrack: re-tapping an on-path tile drops it and everything after. Tapping
    // T (the last, tile 2) steps back to just C→A.
    await tiles.nth(2).click()
    await expect(selected).toHaveCount(2)

    // Re-extend and submit: tap T again → C A T, then the icon-only Submit button
    // (a tap user's commit path — pressing Enter here would land on the focused
    // tile's own key handler, not the word submit). The word lands; path clears.
    await tiles.nth(2).click()
    await expect(selected).toHaveCount(3)
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByRole('button', { name: 'CAT' })).toBeVisible({ timeout: 10000 })
    await expect(selected).toHaveCount(0)

    await ctx.close()
  })
})
