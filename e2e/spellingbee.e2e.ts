import { test, expect } from '@playwright/test'
import { createSoloClub, createSpellingbeeGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke test for the FreeBee (spellingbee) play loop on screen, after the
 * trusting-commit refactor: both word lists ship to the FE, which validates +
 * scores every guess locally (shared `useWordSubmit`) and commits optimistically.
 * Confirms end-to-end that:
 *   - a required word lands in the found list (via realtime) + advances the score;
 *   - a bonus word shows the trailing `•` in its own-move pill;
 *   - a pangram shows the "Pangram!" flourish;
 *   - a non-legal word is rejected with the right reason (bad letters / missing
 *     center) and never lands.
 * Solo club so the game doesn't presence-pause with a single viewer.
 */
test.describe('spellingbee play loop', () => {
  test('required lands; bonus shows the dot; pangram flourishes; rejects explain why', async ({
    browser,
  }) => {
    const club = await createSoloClub('alice')
    const [alice] = club.members
    const game = await createSpellingbeeGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // Wait for the board to render + the capture keyboard to attach before
    // typing (the honeycomb group appears once the game header has loaded).
    await expect(page.getByRole('group', { name: 'Letter honeycomb' })).toBeVisible({
      timeout: 15000,
    })

    // v3 move entry is the shared CAPTURE model (window key-capture + a
    // chrome-less <EntryBox>), so type on the page keyboard.
    const submit = async (w: string) => {
      await page.keyboard.type(w)
      await page.keyboard.press('Enter')
    }
    const pill = () => page.locator('[class*="pill"]').first()

    // Required word → optimistic "BEAD — +1", then it lands in the list via
    // realtime and the score advances. (The shared `WORD — …` format, identical
    // to boggle.)
    await submit('bead')
    await expect(pill()).toContainText('BEAD — +1')
    await expect(page.getByRole('button', { name: 'BEAD' })).toBeVisible({ timeout: 10000 })

    // Bonus word → the dot right after the word ("BCDFGE • — +6").
    await submit('bcdfge')
    await expect(pill()).toContainText('BCDFGE • — +6')

    // Pangram → the "pangram +N" body.
    await submit('abcdefg')
    await expect(pill()).toContainText(/pangram \+17/)

    // Non-legal words are rejected client-side with the specific reason, and
    // never appear in the list.
    await submit('zzzz')
    await expect(pill()).toContainText(/bad letters/)
    await submit('bcdf') // valid letters but no center 'e'
    await expect(pill()).toContainText(/missing center letter/)
    await expect(page.getByRole('button', { name: 'ZZZZ' })).toHaveCount(0)

    await ctx.close()
  })
})

/**
 * Custom letters (setup): entering a center + six other letters builds a board
 * from exactly those letters via the real `spellingbee-build-board` edge function
 * (not a random seed). Drives the actual setup dialog end to end. Uses the
 * CHARIOT letters (center A + CHIROT) — a real pangramable set with plenty of
 * words, so it clears the ≥1 required-word floor comfortably.
 */
test.describe('spellingbee custom letters', () => {
  test('a custom center + letters builds a board from exactly those letters', async ({
    browser,
  }) => {
    const club = await createSoloClub('sbcl')
    const [alice] = club.members
    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    // Open the FreeBee coop setup dialog (coop is the enabled button in a solo
    // club; compete needs a second player).
    await page.getByRole('button', { name: /FreeBee/ }).first().click()

    // Custom letters live behind a collapsed disclosure — expand it, then enter
    // our own letters: center A + the six others C H I R O T.
    await page.getByText('Custom letters (optional)').click()
    await page.getByRole('textbox', { name: 'Center letter' }).fill('a')
    await page.getByRole('textbox', { name: 'Six other letters' }).fill('chirot')

    // Start → the edge function builds the board + lands us on the game.
    await page.getByRole('button', { name: /^Start FreeBee/ }).click()

    // The honeycomb renders with EXACTLY our letters: center A, outers C/H/I/R/O/T.
    await expect(page.getByRole('button', { name: 'A (center letter)' })).toBeVisible({
      timeout: 20000,
    })
    for (const letter of ['C', 'H', 'I', 'R', 'O', 'T']) {
      await expect(page.getByRole('button', { name: letter, exact: true })).toBeVisible()
    }

    await ctx.close()
  })
})
