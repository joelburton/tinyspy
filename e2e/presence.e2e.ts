import { test, expect } from '@playwright/test'
import { createClubWithMembers, createGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke tests for the realtime presence surface — the multi-client
 * behavior that mocked unit tests can't see. Two clients (real browser
 * contexts) talk through the live local Supabase.
 */
test.describe('club presence', () => {
  test('member dots: present fills, leaving goes hollow', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members

    const ctxA = await browser.newContext()
    await signIn(ctxA, alice.session)
    const pageA = await ctxA.newPage()
    await pageA.goto(`/c/${club.handle}`)

    const ctxB = await browser.newContext()
    await signIn(ctxB, bob.session)
    const pageB = await ctxB.newPage()
    await pageB.goto(`/c/${club.handle}`)

    // Both are on the club page → on Alice's strip, Bob's dot is
    // filled ("In the club"). The member entry carries that title.
    await expect(
      pageA.getByTitle('In the club').filter({ hasText: bob.username }),
    ).toBeVisible()

    // Bob disconnects (closes his context) → his presence expires →
    // on Alice's strip his dot becomes the hollow "Away" outline.
    await ctxB.close()
    await expect(
      pageA.getByTitle('Away').filter({ hasText: bob.username }),
    ).toBeVisible()

    await ctxA.close()
  })

  test('heal: an abandoned current game is cleared on the club page', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    // Game is created (is_current_view = true) but nobody enters its
    // GamePage — the stuck-pointer state the heal must reconcile.
    await createGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    const activeCard = page.getByText('Join the active game')
    // First it shows as the current game…
    await expect(activeCard).toBeVisible()
    // …then the club page's presence heal sees nobody viewing it and
    // clears the pointer, so the card disappears.
    await expect(activeCard).toBeHidden({ timeout: 20_000 })

    await ctx.close()
  })

  test('pause-on-disconnect: a missing player pauses the game for the rest', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const { id, gametype } = await createGame(club)
    const url = `/g/${gametype}/${id}`

    const ctxA = await browser.newContext()
    await signIn(ctxA, alice.session)
    const pageA = await ctxA.newPage()
    await pageA.goto(url)

    const ctxB = await browser.newContext()
    await signIn(ctxB, bob.session)
    const pageB = await ctxB.newPage()
    await pageB.goto(url)

    // Wait until both are present in the game — i.e. no pause overlay
    // on Alice's screen (this also proves Bob's presence registered).
    const pauseBanner = pageA.getByText(/Waiting for /)
    await expect(pauseBanner).toBeHidden()

    // Bob disconnects → his game-channel presence expires → Alice's
    // game pauses (we don't play with a missing partner).
    await ctxB.close()
    await expect(
      pageA.getByText(new RegExp(`Waiting for .*${bob.username}`)),
    ).toBeVisible()

    await ctxA.close()
  })
})
