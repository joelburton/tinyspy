import { test, expect } from '@playwright/test'
import { createClubWithMembers, createWordwheelGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The per-player Concede flow — a whole-app common feature (common.concede +
 * game_players.conceded, shared via useStandardGameActions) across every compete
 * game. It's a REAL loss for the conceder while the others keep racing, so it's a
 * live-stack, multi-client behaviour the mocked unit tests can't cover: the RPC
 * transition + the two clients diverging. Driven on a wordwheel compete game as a
 * representative; the flow is identical everywhere it's wired.
 *
 * Two players, BOTH connected (so the game isn't presence-paused). Alice concedes
 * (through the window.confirm) → her board goes locally-terminal ("You conceded")
 * while Bob keeps playing (no terminal for him, his Concede still live).
 */
test.describe('concede (compete)', () => {
  test('a conceding player goes out; the other keeps racing', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createWordwheelGame(club, 'compete') // 2-player compete
    const url = `/g/${game.gametype}/${game.id}`

    // Both connect → present === expected, so no presence-pause.
    const ctxA = await browser.newContext()
    await signIn(ctxA, alice.session)
    const pageA = await ctxA.newPage()
    await pageA.goto(url)

    const ctxB = await browser.newContext()
    await signIn(ctxB, bob.session)
    const pageB = await ctxB.newPage()
    await pageB.goto(url)

    // Wait until both boards are up (both present) so the game is live for Alice.
    await expect(pageA.getByRole('group', { name: 'Letter wheel' })).toBeVisible({ timeout: 20000 })
    await expect(pageB.getByRole('group', { name: 'Letter wheel' })).toBeVisible({ timeout: 20000 })

    // Concede goes through window.confirm — auto-accept it on Alice's page.
    pageA.on('dialog', (d) => void d.accept())

    // Alice concedes (Playwright retries the click until it's actionable, so a brief
    // startup pause before Bob's presence registers self-heals).
    await pageA.getByRole('button', { name: 'Concede' }).click()

    // Alice is now locally terminal — "You conceded" (LocalTerminalRow).
    await expect(pageA.getByText('You conceded')).toBeVisible({ timeout: 15000 })

    // Bob keeps racing: no conceded/terminal state for him, and his Concede is live.
    await expect(pageB.getByText('You conceded')).toBeHidden()
    await expect(pageB.getByRole('button', { name: 'Concede' })).toBeEnabled()

    await ctxA.close()
    await ctxB.close()
  })
})
