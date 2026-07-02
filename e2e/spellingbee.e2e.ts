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

    // Required word → optimistic "Good! +1pts", then it lands in the list via
    // realtime and the score advances.
    await submit('bead')
    await expect(pill()).toContainText('Good!')
    await expect(page.getByRole('button', { name: 'BEAD' })).toBeVisible({ timeout: 10000 })

    // Bonus word → the trailing bonus dot on the pill (the fix: spellingbee now
    // shows it like boggle).
    await submit('bcdfge')
    await expect(pill()).toContainText('•')

    // Pangram → the "Pangram!" flourish.
    await submit('abcdefg')
    await expect(pill()).toContainText('Pangram!')

    // Non-legal words are rejected client-side with the specific reason, and
    // never appear in the list.
    await submit('zzzz')
    await expect(pill()).toContainText('Bad letters')
    await submit('bcdf') // valid letters but no center 'e'
    await expect(pill()).toContainText('Missing center letter')
    await expect(page.getByRole('button', { name: 'ZZZZ' })).toHaveCount(0)

    await ctx.close()
  })
})
