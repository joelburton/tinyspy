// cs-blessed-simple-page

import { test, expect } from '@playwright/test'
import {
  createSoloClub,
  createUnclaimedUser,
  deleteUser,
  expireSession,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The auth gate, end-to-end in a real browser — a surface a unit test
 * structurally can't reach. useSession's stale-session handling depends on
 * the real supabase-js boot flow (a JWT read from localStorage, the
 * `onAuthStateChange` sequence, an actual `getUser()` / token-refresh round
 * trip against live GoTrue). The unit test mocks all of that, and a mocked
 * `getUser` failure is cleaner than the real one: a stale session's error
 * need not carry a 4xx status, and only the live flow shows whether such a
 * session still lands on the login screen rather than the username gate.
 *
 * What these pin:
 *   - an invalidated session (the user was deleted under it) → LoginScreen,
 *     never the username gate;
 *   - …including the expired-token / refresh-fails variant;
 *   - a genuinely-unclaimed (valid) session DOES get the username gate — and
 *     can always sign out of it.
 *
 * LoginScreen is identified by its "PuzPuzPuz" wordmark image, ClaimHandleScreen by
 * its "Let's set you up" heading.
 */
test.describe('auth gate: a stale session never strands you on the username screen', () => {
  test('an invalidated session lands on the login screen', async ({ browser }) => {
    // A returning, fully-set-up user whose auth.users row was wiped (db-reset
    // / admin delete) while their session sits in the browser.
    const club = await createSoloClub('gone')
    await deleteUser(club.members[0].userId)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto('/')

    await expect(page.getByAltText('PuzPuzPuz')).toBeVisible()
    await expect(page.getByRole('heading', { name: /let.?s set you up/i })).toBeHidden()

    await ctx.close()
  })

  test('an expired invalidated session also lands on login (refresh path)', async ({
    browser,
  }) => {
    // Same, but the stored access token is already expired, so supabase-js
    // attempts a refresh on boot — which fails because the user is gone. This
    // is the path whose error lacks a clean 4xx status.
    const club = await createSoloClub('expired')
    await deleteUser(club.members[0].userId)

    const ctx = await browser.newContext()
    await signIn(ctx, expireSession(club.members[0].session))
    const page = await ctx.newPage()
    await page.goto('/')

    await expect(page.getByAltText('PuzPuzPuz')).toBeVisible()
    await expect(page.getByRole('heading', { name: /let.?s set you up/i })).toBeHidden()

    await ctx.close()
  })

  test('a valid but unclaimed session shows the username gate, and can sign out of it', async ({
    browser,
  }) => {
    // The legitimate counterpart: a real, existing user who simply hasn't
    // picked a handle yet SHOULD see the gate — useSession must not sign a
    // valid user out. And the escape hatch gets them back to login.
    const { session } = await createUnclaimedUser('newbie')

    const ctx = await browser.newContext()
    await signIn(ctx, session)
    const page = await ctx.newPage()
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /let.?s set you up/i })).toBeVisible()

    await page.getByRole('button', { name: /sign out/i }).click()
    await expect(page.getByAltText('PuzPuzPuz')).toBeVisible()
    await expect(page.getByRole('heading', { name: /let.?s set you up/i })).toBeHidden()

    await ctx.close()
  })
})
