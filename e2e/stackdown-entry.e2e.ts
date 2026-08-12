import { test, expect } from '@playwright/test'
import { createSoloClub, createStackdownGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { settled } from './helpers/ready'

/**
 * PaulTower (stackdown) word entry: the move row is ⌫ | five slots | Submit, and
 * **filling the fifth slot does not submit** — you commit deliberately, with the
 * button or Enter.
 *
 * Worth an e2e rather than a unit test because the thing that changed is an
 * affordance, and all three of its parts live in different places: the fifth
 * tile no longer calling `onSubmitWord` (BoardCol's click handler), the buttons'
 * enabled-ness (derived state), and Enter (the global key handler, which only
 * exists in a real document). A unit test could pin any one and still let the
 * control feel wrong.
 *
 * The board comes from the frozen fixture, whose solution words are
 * eagle/table/plans/apple/juice/lemon — but their letters are mostly buried at
 * the start, so these specs pick whatever tiles are exposed and submit a word
 * that is deliberately NOT valid. That's the right shape here anyway: what's
 * under test is the ENTRY, and an invalid word exercises the whole commit path
 * (server round trip, tiles bounced back, pill) without depending on which
 * letters happen to be on top.
 */
test.describe('stackdown word entry', () => {
  /** Slots holding a picked-up tile (empty slots are dashed placeholders). */
  const filledSlots = (page: import('@playwright/test').Page) =>
    page.locator('[class*="slot"][class*="filled"]')
  /** Board tiles that can still be picked up (buried ones are `disabled`). */
  const pickable = (page: import('@playwright/test').Page) =>
    page.locator('button[class*="tile"]:not([disabled])')

  test('the fifth tile completes the word without submitting it', async ({ browser }) => {
    const club = await createSoloClub('sdent')
    const [alice] = club.members
    const game = await createStackdownGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[class*="tile"]').first()).toBeVisible({ timeout: 15000 })
    await settled(page)

    const submit = page.getByRole('button', { name: 'Submit' })
    const del = page.getByRole('button', { name: 'Delete' })

    // Empty: neither control can act.
    await expect(submit).toBeDisabled()
    await expect(del).toBeDisabled()

    // Four tiles — a partial word. ⌫ works, Submit still can't fire: a word is
    // exactly five tiles, and that's the whole submit gate.
    for (let i = 0; i < 4; i++) await pickable(page).first().click()
    await expect(filledSlots(page)).toHaveCount(4)
    await expect(del).toBeEnabled()
    await expect(submit).toBeDisabled()

    // The fifth tile fills the last slot and STOPS. This is the change: the word
    // stays on screen, so a wrong fifth tile is recoverable instead of committed.
    await pickable(page).first().click()
    await expect(filledSlots(page)).toHaveCount(5)
    await expect(submit).toBeEnabled()
    // Give a submit that shouldn't happen time to happen.
    await page.waitForTimeout(500)
    await expect(filledSlots(page)).toHaveCount(5)

    await ctx.close()
  })

  test('⌫ drops the last tile; clicking a slot still truncates to it', async ({ browser }) => {
    const club = await createSoloClub('sdbsp')
    const [alice] = club.members
    const game = await createStackdownGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[class*="tile"]').first()).toBeVisible({ timeout: 15000 })
    await settled(page)

    for (let i = 0; i < 4; i++) await pickable(page).first().click()
    await expect(filledSlots(page)).toHaveCount(4)

    // ⌫ removes exactly one — the most recent.
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(filledSlots(page)).toHaveCount(3)

    // Clicking a filled slot returns that tile AND every tile after it — the
    // pre-existing behaviour, deliberately unchanged by the button work, so
    // clicking the first slot empties the row.
    await filledSlots(page).first().click()
    await expect(filledSlots(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled()

    await ctx.close()
  })

  test('Submit commits the word, and so does Enter', async ({ browser }) => {
    const club = await createSoloClub('sdsub')
    const [alice] = club.members
    const game = await createStackdownGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[class*="tile"]').first()).toBeVisible({ timeout: 15000 })
    await settled(page)

    const pill = page.locator('[class*="localFeedback"]')

    // ── The button. An invalid word is still a real commit: the server answers,
    // the tiles bounce back to the board, and the rejection lands in the pill.
    for (let i = 0; i < 5; i++) await pickable(page).first().click()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(pill).toContainText(/not a word/i, { timeout: 10000 })
    await expect(filledSlots(page)).toHaveCount(0)

    // ── Enter does the same thing (the physical-keyboard path).
    for (let i = 0; i < 5; i++) await pickable(page).first().click()
    await expect(filledSlots(page)).toHaveCount(5)
    await page.keyboard.press('Enter')
    await expect(filledSlots(page)).toHaveCount(0, { timeout: 10000 })

    await ctx.close()
  })
})
