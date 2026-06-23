import { test, expect } from '@playwright/test'
import {
  createSoloClub,
  createUnclaimedUser,
  deleteUser,
  expireSession,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The auth gate, end-to-end in a real browser — the one surface a unit test
 * structurally can't reach. useSession's stale-session handling depends on
 * the real supabase-js boot flow (a JWT read from localStorage, the
 * `onAuthStateChange` sequence, an actual `getUser()` / token-refresh round
 * trip against live GoTrue). The unit test mocks all of that, and a clean
 * mocked 4xx hid the real bug: a stale session whose getUser error didn't
 * carry a 4xx status slipped through and stranded the user on the "pick a
 * username" screen with no way to log in.
 *
 * These tests reproduce that flow for real and pin the contract:
 *   - an invalidated session (the user was deleted under it) → LoginScreen,
 *     never the username gate;
 *   - …including the expired-token / refresh-fails variant;
 *   - a genuinely-unclaimed (valid) session DOES get the username gate — and
 *     can always sign out of it.
 *
 * LoginScreen is identified by its "PupGames" heading, ClaimHandleScreen by
 * "Pick a username".
 */
test.describe('auth gate: a stale session never strands you on the username screen', () => {
  test('an invalidated session lands on the login screen', async ({ browser }) => {
    // A returning, fully-set-up user whose auth.users row was wiped (db:reset
    // / admin delete) while their session sits in the browser.
    const club = await createSoloClub('gone')
    await deleteUser(club.members[0].userId)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'PupGames' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /pick a username/i })).toBeHidden()

    await ctx.close()
  })

  test('an expired invalidated session also lands on login (refresh path)', async ({
    browser,
  }) => {
    // Same, but the stored access token is already expired, so supabase-js
    // attempts a refresh on boot — which fails because the user is gone. This
    // is the path whose error lacks a clean 4xx status (the regression).
    const club = await createSoloClub('expired')
    await deleteUser(club.members[0].userId)

    const ctx = await browser.newContext()
    await signIn(ctx, expireSession(club.members[0].session))
    const page = await ctx.newPage()
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'PupGames' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /pick a username/i })).toBeHidden()

    await ctx.close()
  })

  test('a valid but unclaimed session shows the username gate, and can sign out of it', async ({
    browser,
  }) => {
    // The legitimate counterpart: a real, existing user who simply hasn't
    // picked a handle yet SHOULD see the gate — proving the fix didn't make
    // useSession over-eagerly sign valid users out. And the escape hatch
    // gets them back to login.
    const { session } = await createUnclaimedUser('newbie')

    const ctx = await browser.newContext()
    await signIn(ctx, session)
    const page = await ctx.newPage()
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /pick a username/i })).toBeVisible()

    await page.getByRole('button', { name: /sign out/i }).click()
    await expect(page.getByRole('heading', { name: 'PupGames' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /pick a username/i })).toBeHidden()

    await ctx.close()
  })
})
