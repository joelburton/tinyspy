import { test, expect } from '@playwright/test'
import { createClubWithMembers, sendMessage } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke test for the chat unread indicator — a realtime multi-client
 * behavior (a message from one member must badge another's closed
 * chat bubble). The unread COUNT surfaces in the bubble's accessible
 * name, so we assert on that.
 */
test.describe('chat unread', () => {
  test('a message while chat is closed badges the bubble; opening clears it', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    // Fresh club, chat closed → no unread badge.
    await expect(
      page.getByRole('button', { name: 'Open chat', exact: true }),
    ).toBeVisible()

    // Bob sends while Alice's chat is closed → her bubble badges "1".
    await sendMessage(club, bob, 'hello alice')
    await expect(
      page.getByRole('button', { name: /Open chat, 1 unread/ }),
    ).toBeVisible()

    // A second message → "2" (count accumulates while closed).
    await sendMessage(club, bob, 'you there?')
    await expect(
      page.getByRole('button', { name: /Open chat, 2 unread/ }),
    ).toBeVisible()

    // Alice opens chat → badge clears (the toggle flips to "Close chat").
    await page.getByRole('button', { name: /unread/ }).click()
    await expect(
      page.getByRole('button', { name: 'Close chat' }),
    ).toBeVisible()

    await ctx.close()
  })
})
