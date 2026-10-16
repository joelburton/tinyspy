// cs-unmet

import { test, expect } from '@playwright/test'
import { createClubWithMembers, createCodenamesduetGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The clue form keeps Tab to itself. codenamesduet's clue-giver form is two plain
 * `<input>`s (count + word); without help, Tab walks off them onto the event-log
 * `#N` handles, page links, and the browser tab bar. The two inputs ARE the form's
 * tab ring, so Tab — and Shift+Tab — toggle between them and nowhere else, and
 * the ring is innermost while the form is up. Native Tab traversal is a
 * real-browser behavior jsdom can't simulate, so this is a browser check: focus
 * never lands outside the two inputs however many times we Tab.
 *
 * The clue rules companion is LEFT open here, as it opens by itself on turn 1:
 * a companion takes Tab only while the keyboard is inside it, so Tab must stay
 * on the form even with it up. The second case is the companion itself.
 */
test.describe('codenamesduet clue-form Tab handling', () => {
  test('Tab toggles between the count and word inputs and never leaves them', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createCodenamesduetGame(club, alice.userId) // alice = clue-giver
    const url = `/g/${game.gametype}/${game.id}`

    const ctxAlice = await browser.newContext()
    const ctxBob = await browser.newContext()
    await signIn(ctxAlice, alice.session)
    await signIn(ctxBob, bob.session)
    const pageAlice = await ctxAlice.newPage()
    const pageBob = await ctxBob.newPage()
    await pageBob.goto(url) // both present so the game doesn't presence-pause
    await pageAlice.goto(url)
    await expect(pageAlice.locator('[data-board]')).toBeVisible({ timeout: 20000 })
    // The rules opened by themselves, and stay open through the Tabs below.
    await expect(pageAlice.getByText('Clue-giving rules')).toBeVisible()

    const count = pageAlice.locator('input[data-game-input]').first()
    const word = pageAlice.locator('input[data-game-input]').nth(1)
    await count.focus()
    await expect(count).toBeFocused()

    // Tab → word → count → word … always one of the two, never an outside element
    // (if it escaped, one of these would fail with focus on a #N handle / link / …).
    await pageAlice.keyboard.press('Tab')
    await expect(word).toBeFocused()
    await pageAlice.keyboard.press('Tab')
    await expect(count).toBeFocused()
    await pageAlice.keyboard.press('Shift+Tab')
    await expect(word).toBeFocused()
    await pageAlice.keyboard.press('Tab')
    await expect(count).toBeFocused()

    await ctxAlice.close()
    await ctxBob.close()
  })

  test('the clue rules open by themselves on turn 1, for both players, once', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createCodenamesduetGame(club, alice.userId)
    const url = `/g/${game.gametype}/${game.id}`

    const ctxAlice = await browser.newContext()
    const ctxBob = await browser.newContext()
    await signIn(ctxAlice, alice.session)
    await signIn(ctxBob, bob.session)
    const pageAlice = await ctxAlice.newPage()
    const pageBob = await ctxBob.newPage()
    await pageBob.goto(url)
    await pageAlice.goto(url)
    await expect(pageAlice.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // Both players, the guesser too.
    await expect(pageAlice.getByText('Clue-giving rules')).toBeVisible()
    await expect(pageBob.getByText('Clue-giving rules')).toBeVisible()

    // Its ✕ closes it, and a reload does not bring it back.
    await pageAlice.getByRole('button', { name: 'Close' }).click()
    await expect(pageAlice.getByText('Clue-giving rules')).toBeHidden()
    await pageAlice.reload()
    await expect(pageAlice.locator('[data-board]')).toBeVisible({ timeout: 20000 })
    await expect(pageAlice.getByText('Clue-giving rules')).toBeHidden()

    // The help line's link opens it again while the clue is being written.
    await pageAlice.getByRole('button', { name: 'Rules for clues' }).click()
    await expect(pageAlice.getByText('Clue-giving rules')).toBeVisible()

    await ctxAlice.close()
    await ctxBob.close()
  })
})
