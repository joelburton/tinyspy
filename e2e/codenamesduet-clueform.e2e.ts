import { test, expect } from '@playwright/test'
import { createClubWithMembers, createCodenamesduetGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The clue form keeps Tab to itself. codenamesduet's clue-giver form is two plain
 * `<input>`s (count + word); without help, Tab walks off them onto the turn-log
 * `#N` handles, page links, and the browser tab bar (the single-field games avoid
 * this with their Tab-swallowing capture entry). `trapTab` in CluePanel makes Tab —
 * and Shift+Tab — toggle between the two inputs and nowhere else. Native Tab
 * traversal is a real-browser behavior jsdom can't simulate, so this is a browser
 * check: focus never lands outside the two inputs however many times we Tab.
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
})
