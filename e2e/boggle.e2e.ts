import { test, expect } from '@playwright/test'
import { createSoloClub, createBoggleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { settled } from './helpers/ready'

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
    // …and is LISTENING, not merely mounted (see helpers/ready).
    await settled(page)

    // v3 move entry is the shared CAPTURE model (window key-capture + a
    // chrome-less <EntryBox> display — no <input>), so type on the page keyboard
    // rather than filling a field.
    // Type the required word "cat" and submit → it lands in the list (rows are
    // role=button, rendered uppercase).
    await page.keyboard.type('cat')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-word="cat"]')).toBeVisible({ timeout: 10000 })

    // An off-board word ("zzz" — no Z on the board) is rejected: never listed.
    await page.keyboard.type('zzz')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-word="zzz"]')).toHaveCount(0)

    // The recap names the board — and this game's board was NOT hand-picked,
    // which is the half of the rule worth pinning: the `Letters` row is there
    // either way, so the letters can always be copied into a next game
    // (setupRows.ts → the board-identity exception).
    await page.getByText('Setup options').click()
    await expect(page.getByText('Letters: CATR XXXX XXXX XXXX')).toBeVisible()

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
    // …and is LISTENING, not merely mounted (see helpers/ready).
    await settled(page)
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

    // Backspace is the keyboard twin of that backtrack: it deletes the last letter
    // AND de-selects the tile that contributed it, leaving a shorter REAL path
    // (it used to drop the whole highlight, so the surviving text had no path).
    await page.keyboard.press('Backspace')
    await expect(selected).toHaveCount(1)

    // Re-extend and submit: tap A then T → C A T, then the icon-only Submit button
    // (a tap user's commit path — pressing Enter here would land on the focused
    // tile's own key handler, not the word submit). The word lands; path clears.
    await tiles.nth(1).click()
    await tiles.nth(2).click()
    await expect(selected).toHaveCount(3)
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.locator('[data-word="cat"]')).toBeVisible({ timeout: 10000 })
    await expect(selected).toHaveCount(0)

    await ctx.close()
  })

  // Regression: after tapping a word, the last-tapped tile must NOT keep keyboard
  // focus — otherwise the player's next Enter (submitting a TYPED word) is hijacked
  // by that tile's key handler, which traces the tile onto the word. The classic
  // symptom was: tap C-A-T, submit; then type another word and press Enter, and the
  // game submits just the stray "T" ("too short"). A pointer tap must leave focus
  // alone (onMouseDown preventDefault), so Enter reaches the word-submit.
  test('a tapped tile does not steal focus: a later typed word + Enter submits that word', async ({
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
    // …and is LISTENING, not merely mounted (see helpers/ready).
    await settled(page)

    // Word 1: trace C(0) A(1) T(2) and submit via the button → lands.
    await tiles.nth(0).click()
    await tiles.nth(1).click()
    await tiles.nth(2).click()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.locator('[data-word="cat"]')).toBeVisible({ timeout: 10000 })

    // Word 2: TYPE "cat" and press Enter. Before the fix, the still-focused T tile
    // grabbed Enter and traced "T", so the submit saw "T — too short". Now Enter
    // submits the typed word: "cat" is a duplicate → "already found", never "too short".
    await page.keyboard.type('cat')
    await page.keyboard.press('Enter')
    const pill = page.locator('[class*="belowBoard"]').first()
    await expect(pill).toContainText(/already found/i, { timeout: 10000 })
    await expect(pill).not.toContainText(/too short/i)

    await ctx.close()
  })
})

/**
 * Custom board (setup) + the `Letters` recap row — the round trip that is the
 * whole point of the feature: you read a board off one game and type it into
 * the next. Drives the real setup dialog through the real
 * `boggle-build-board` edge function (custom branch: no rolling, no
 * constraints), then reads the board back off the info column in the same
 * written form it was typed in.
 *
 * The board is chosen for words, not for edge cases: CATS/AREA/TILE/NEST has
 * "cat", "eat", "tile" and plenty more, so it clears the ≥1 required-word floor
 * comfortably at the default band.
 */
test.describe('boggle custom board', () => {
  const CUSTOM_BOARD = 'CATS AREA TILE NEST'

  test('a typed board is the board you play, and the recap reads it back', async ({
    browser,
  }) => {
    const club = await createSoloClub('bgcb')
    const [alice] = club.members
    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    // Open the MothCubes coop setup dialog (coop is the enabled button in a
    // solo club; compete needs a second player).
    await page.getByRole('button', { name: /MothCubes/ }).first().click()

    // The custom board lives behind a collapsed disclosure — expand it, then
    // type the tiles exactly as a recap would print them.
    await page.getByText('Custom board (optional)').click()
    await page.getByRole('textbox', { name: 'Custom board' }).fill(CUSTOM_BOARD)

    // Start → the edge function solves exactly this board and lands us on it.
    await page.getByRole('button', { name: /^Start MothCubes/ }).click()

    const tiles = page.locator('[data-boggle-tile]')
    await expect(tiles).toHaveCount(16, { timeout: 20000 })
    // The tiles ARE the typed board, in row-major order.
    expect((await tiles.allInnerTexts()).join('')).toBe(CUSTOM_BOARD.replace(/ /g, ''))

    // And the recap prints it back in the form the dialog takes — the round
    // trip a friend actually uses (docs/games/boggle.md → Custom board).
    await page.getByText('Setup options').click()
    await expect(page.getByText(`Letters: ${CUSTOM_BOARD}`)).toBeVisible()

    await ctx.close()
  })
})
