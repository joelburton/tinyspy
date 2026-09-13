// cs-met-chat

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

    // The mark's only text is its count badge, so its text IS the badge.
    const chatMark = page.getByRole('button', { name: 'Chat', exact: true })

    // Fresh club, chat closed → no unread badge.
    await expect(chatMark).toBeVisible()
    await expect(chatMark).toHaveText('')

    // Bob sends while Alice's chat is closed → her bubble badges "1".
    await sendMessage(club, bob, 'hello alice')
    await expect(chatMark).toHaveText('1')

    // A second message → "2" (count accumulates while closed).
    await sendMessage(club, bob, 'you there?')
    await expect(chatMark).toHaveText('2')

    // Alice opens chat → the badge clears.
    await chatMark.click()
    await expect(chatMark).toHaveText('')

    await ctx.close()
  })
})
