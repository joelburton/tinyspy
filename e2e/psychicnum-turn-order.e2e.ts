import { test, expect } from '@playwright/test'
import { createClubWithMembers, createTurnGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The opt-in turn-by-turn coop mode, driven live on psychicnum (the pilot game).
 * A coop game created with setup.coopStyle='turns' rotates the guess through the
 * players; the FE gates input on whose turn it is and shows a shared
 * TurnStatusLine ("Your turn" / "Waiting for ● Name…"). This is a live-stack,
 * two-client behaviour the mocked unit tests can't cover: the server turn pointer
 * advancing over realtime, and both clients flipping their gate in response.
 *
 * Two players, BOTH connected (so the game isn't presence-paused). Alice goes
 * first: she sees "Your turn" and can guess; Bob sees "Waiting for Alice" and his
 * board is inert. After Alice guesses, the turn flips over realtime — Bob's line
 * becomes "Your turn" and Alice's becomes "Waiting for Bob".
 */
test.describe('psychicnum turn order (coop)', () => {
  test('the turn rotates: only the current player may guess', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createTurnGame(club) // alice seated first
    const url = `/g/${game.gametype}/${game.id}`

    const ctxA = await browser.newContext()
    await signIn(ctxA, alice.session)
    const pageA = await ctxA.newPage()
    await pageA.goto(url)

    const ctxB = await browser.newContext()
    await signIn(ctxB, bob.session)
    const pageB = await ctxB.newPage()
    await pageB.goto(url)

    // Both boards up (both present → no presence-pause).
    await expect(pageA.locator('[data-board]')).toBeVisible({ timeout: 20000 })
    await expect(pageB.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // ── Alice's turn: she sees "Your turn"; Bob is told he's waiting on her. ──
    // (Bob also shows the gated "Waiting for others" action row — a separate
    // element — so target the turn copy by Alice's username specifically.)
    await expect(pageA.getByText('Your turn')).toBeVisible({ timeout: 15000 })
    // TWO elements carry it, and both matter: the info column's TurnStatusLine
    // (the desktop answer) and the below-board waitingTurnPill (the ONLY answer
    // on mobile, where the info column is off-canvas in the InfoSheet). Both
    // render the shared `waitingFor` copy, so this also guards them against drift.
    await expect(
      pageB.getByText(new RegExp(`Waiting for.*${alice.username}`)),
    ).toHaveCount(2, { timeout: 15000 })

    // Capture the two-client turn state for the visual record.
    await pageA.screenshot({
      path: '/private/tmp/claude-501/-Users-joel-src-codenames/d9659abe-d158-4755-86b7-c17d10569fef/scratchpad/psychic-turn-alice.png',
      fullPage: true,
    })
    await pageB.screenshot({
      path: '/private/tmp/claude-501/-Users-joel-src-codenames/d9659abe-d158-4755-86b7-c17d10569fef/scratchpad/psychic-turn-bob.png',
      fullPage: true,
    })

    // Bob cannot act: the waiting pill has taken the entry slot (EntryRow's
    // designed pill swap — same height, controls replaced), so there's no Submit
    // to press at all. Crucially he is NOT shown the locally-terminal "out of
    // guesses" look — he's just waiting his turn.
    await expect(pageB.getByRole('button', { name: 'Submit' })).toHaveCount(0)
    await expect(pageB.getByText(/Out of guesses/i)).toHaveCount(0)

    // ── Alice guesses (click a tile → Submit). ──
    await pageA.locator('[data-board] button').first().click()
    await pageA.getByRole('button', { name: 'Submit' }).click()

    // ── The turn flips over realtime: Bob is now up, Alice waits for Bob. ──
    // (Alice's own entry slot now carries her sticky own-move pill, so the flip
    // is asserted via the turn lines, which both clients update over realtime.)
    await expect(pageB.getByText('Your turn')).toBeVisible({ timeout: 15000 })
    // Alice's own sticky own-move pill is OUTRANKED by the waiting pill (see the
    // precedence chain in turnCopy.tsx), so she gets both copies too.
    await expect(
      pageA.getByText(new RegExp(`Waiting for.*${bob.username}`)),
    ).toHaveCount(2, { timeout: 15000 })

    await ctxA.close()
    await ctxB.close()
  })
})
