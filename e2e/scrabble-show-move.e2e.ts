import { test, expect } from '@playwright/test'
import { createClubWithMembers, createScrabbleGame, setScrabbleRack } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Coop "show a move": a player broadcasts their in-progress (staged) tiles to
 * teammates, who see them on a read-only preview of the board. This is a genuinely
 * cross-client feature (a stable-name Broadcast channel — see useSharedMove), so it
 * can ONLY be exercised with two real browser contexts; the component tests mock the
 * transport and just simulate the receive callback.
 *
 * Two coop players (alice + bob) in one game. Alice stages CAT and clicks Share; Bob
 * sees the "<alice> showing: +N CAT" banner and CAT's tiles on his board (as a
 * preview — the move isn't committed), and a keystroke returns him to the live board.
 * Alice never sees her own preview (Broadcast doesn't echo to the sender).
 *
 * A two-player coop game presence-pauses until BOTH are connected, so we open both
 * contexts before staging (the rack only renders once un-paused). The shared rack is
 * pinned (setScrabbleRack) so CAT is a deterministic, dictionary-valid move.
 */
test.describe('scrabble — show a move (coop)', () => {
  test("a teammate previews my staged move; typing dismisses it", async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createScrabbleGame(club, 'coop') // seats both members
    setScrabbleRack(game.id, ['C', 'A', 'T', 'S', 'E', 'R', 'O'])
    const url = `/g/${game.gametype}/${game.id}`

    // Both players open the game (coop needs everyone present, or it pauses).
    const ctxA = await browser.newContext()
    await signIn(ctxA, alice.session)
    const pageA = await ctxA.newPage()
    await pageA.goto(url)

    const ctxB = await browser.newContext()
    await signIn(ctxB, bob.session)
    const pageB = await ctxB.newPage()
    await pageB.goto(url)

    // The rack renders only once un-paused (both present) — so waiting for it is
    // also the "no longer paused" gate.
    const rackA = pageA.locator('[data-zone="rack"] [data-rack-tile]')
    await expect(rackA).toHaveCount(7, { timeout: 20_000 })
    await expect(pageB.locator('[data-cell]')).toHaveCount(225, { timeout: 20_000 })

    // Alice stages CAT from the center star (7,7): click sets the cursor, typing
    // advances right — C→(7,7) A→(8,7) T→(9,7).
    const centerA = pageA.locator('[data-cell][data-x="7"][data-y="7"]')
    await centerA.click()
    await pageA.keyboard.type('CAT')
    await expect(centerA, 'CAT staged on Alice\'s board').toContainText('C')

    // Alice shows it to the team (coop, ≥2 players → the Share button renders).
    await pageA.getByLabel('Show move to team').click()

    // Bob sees the share banner "● <alice> showing: +<score> CAT"…
    const banner = pageB.getByText(new RegExp(`${alice.username} showing: \\+\\d+ CAT`, 'i'))
    await expect(banner).toBeVisible({ timeout: 10_000 })
    // …and CAT's tiles previewed on HIS board (they're not committed — this is the
    // read-only overlay of Alice's tentative move).
    const centerB = pageB.locator('[data-cell][data-x="7"][data-y="7"]')
    await expect(centerB, "Alice's tile previews on Bob's board").toContainText('C')

    // Alice never sees her own preview — Broadcast doesn't echo to the sender.
    await expect(pageA.getByText(/showing:/)).toHaveCount(0)

    // Bob returns to the live board by typing (any keystroke exits the viewer).
    await pageB.keyboard.press('a')
    await expect(banner).toBeHidden()
    await expect(centerB, 'the preview cleared on dismiss').not.toContainText('C')

    await ctxA.close()
    await ctxB.close()
  })
})
