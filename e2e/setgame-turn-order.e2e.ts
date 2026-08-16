import { test, expect } from '@playwright/test'
import { createClubWithMembers, createSetgameGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * Turn-by-turn coop on setgame, driven live with two clients.
 *
 * The server half is pinned by pgTAP (`supabase/tests/setgame/turn_order_test`);
 * what only a live stack can show is the FE half, and setgame's is not the
 * standard arrangement — it answers "whose turn is it?" on THREE surfaces at
 * once, which is the thing worth guarding against drift:
 *
 *   1. the board FADES for the player who is waiting (setgame's one deliberate
 *      exception to "a card never dims", since color is one of its attributes)
 *   2. the below-board pill prompts the player whose turn it IS
 *      ("Waiting for your move") — the fallback, below any own-move result
 *   3. the header pill names who the waiting player is waiting FOR
 *
 * Both players stay connected throughout, or presence-pause would take the
 * board away and none of the above would be on screen.
 */
test.describe('setgame turn order (coop)', () => {
  test('only the current player may act, and all three surfaces say so', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createSetgameGame(club, 'coop', undefined, 'full', alice.userId)
    const url = `/g/${game.gametype}/${game.id}`

    const ctxA = await browser.newContext()
    await signIn(ctxA, alice.session)
    const pageA = await ctxA.newPage()
    await pageA.goto(url)

    const ctxB = await browser.newContext()
    await signIn(ctxB, bob.session)
    const pageB = await ctxB.newPage()
    await pageB.goto(url)

    const cardsA = pageA.locator('button[class*="card"]')
    const cardsB = pageB.locator('button[class*="card"]')
    await boardReady(pageA, cardsA.first())
    await boardReady(pageB, cardsB.first())

    // The table itself, not the column around it — the fade is on the board.
    // (CSS-module class names are hashed as `_board_<hash>`; `boardCol` is the
    // wrapper and would always read opacity 1.)
    const boardOf = (page: typeof pageA) => page.locator('[class*="_board_"]').first()

    // ── (1) The waiting player's board is faded; the mover's is not. ──
    await expect(boardOf(pageB)).toHaveCSS('opacity', '0.5', { timeout: 15000 })
    await expect(boardOf(pageA)).toHaveCSS('opacity', '1')

    // ── (2) The mover is prompted; (3) the waiter is told who by. ──
    await expect(pageA.getByText('Waiting for your move')).toBeVisible({ timeout: 15000 })
    // Two surfaces on bob's screen: the header pill and the info column's
    // TurnStatusLine. Both render the shared `waitingFor` copy.
    await expect(
      pageB.getByText(new RegExp(`Waiting for.*${alice.username}`)),
    ).toHaveCount(2, { timeout: 15000 })
    // And the prompt is alice's alone — a waiting player must not be told it is
    // their move on any surface.
    await expect(pageB.getByText('Waiting for your move')).toHaveCount(0)

    // ── Bob cannot select a card. ──
    // Clicking is the whole input surface (typing a letter routes through the
    // same handler), and selection is what a click does, so a card that never
    // takes the selected class proves the gate without needing an RPC to fail.
    await cardsB.nth(0).click({ force: true })
    await cardsB.nth(1).click({ force: true })
    await expect(pageB.locator('button[class*="selected"]')).toHaveCount(0)

    // Nor cash a hint — the button is there (so it can say why), disabled.
    await expect(pageB.getByRole('button', { name: 'Show hint' })).toBeDisabled()
    await expect(pageA.getByRole('button', { name: 'Show hint' })).toBeEnabled()

    // ── Alice claims, by walking the hint ladder to a full set. ──
    // Three presses ring one, two, then all three cards — and the third selects
    // a complete set, which submits. It is also the exact path a stuck player
    // takes, and the reason a hint must NOT pass the turn: she has to still be
    // the mover on the third press.
    const hintA = pageA.getByRole('button', { name: 'Show hint' })
    await hintA.click()
    await hintA.click()
    await hintA.click()

    // ── The turn flips, and all three surfaces flip with it. ──
    await expect(boardOf(pageB)).toHaveCSS('opacity', '1', { timeout: 15000 })
    await expect(boardOf(pageA)).toHaveCSS('opacity', '0.5', { timeout: 15000 })
    await expect(pageB.getByText('Waiting for your move')).toBeVisible({ timeout: 15000 })
    await expect(
      pageA.getByText(new RegExp(`Waiting for.*${bob.username}`)),
    ).toHaveCount(2, { timeout: 15000 })
  })
})
