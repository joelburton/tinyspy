import { test, expect } from '@playwright/test'
import { createSoloClub, createBoggleGame, createCrosswordsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The chat ⇄ game keyboard round trip, in a real browser because it is entirely
 * about `document.activeElement` and window-level key dispatch — neither of
 * which jsdom models faithfully.
 *
 * The contract, in one sentence: **`/` takes the keyboard to chat, Tab gives it
 * back to the game**, and neither loses what you were in the middle of.
 *
 * Why Tab needs code at all: every game reads its keys off `window`, and the
 * shared dispatcher declines while any text field is focused (otherwise typing
 * "hello" in chat would spell it onto the board too). So handing the keyboard
 * back means having NO field focused — Tab's native "walk to the next control"
 * lands you on a toolbar button where typing reaches neither chat nor the game.
 * See ChatBody's `handleKeyDown`.
 *
 * boggle is the vehicle because it's a pure capture-model game: no input
 * element anywhere on the play surface, so "did the game get the keystroke?"
 * has an unambiguous answer.
 */
test('chat keyboard: "/" takes the keyboard, Tab hands it back', async ({ browser }) => {
  const club = await createSoloClub('ckbd')
  const game = await createBoggleGame(club)

  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-boggle-tile]')).toHaveCount(16, { timeout: 20000 })

  const chatInput = page.locator('[data-chat-input]')
  /** True when the chat entry — not merely something in the panel — has focus. */
  const chatFocused = () =>
    page.evaluate(
      () => document.activeElement?.hasAttribute('data-chat-input') ?? false,
    )

  // "/" opens chat and puts the caret in its entry, so you can type at once.
  await page.keyboard.press('/')
  await expect(chatInput).toBeVisible()
  expect(await chatFocused()).toBe(true)

  // While it holds focus, keystrokes are chat's — the board must not see them.
  await page.keyboard.type('hi there')
  await expect(chatInput).toHaveValue('hi there')

  // Tab hands the keyboard back to the game: no field focused (NOT the next
  // button in the focus order, which is what native Tab would do).
  await page.keyboard.press('Tab')
  expect(await chatFocused()).toBe(false)
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY')

  // ...so typing plays. "cat" is a required word on this fixture's board.
  await page.keyboard.type('cat')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-word="cat"]')).toBeVisible({ timeout: 10000 })

  // The half-typed message survived the excursion — Tab moves focus, it doesn't
  // discard a draft, and chat stayed open throughout.
  await expect(chatInput).toHaveValue('hi there')

  // "/" brings the keyboard back to chat from the game side, closing the loop.
  await page.keyboard.press('/')
  expect(await chatFocused()).toBe(true)
  // And it focuses rather than re-opening: still exactly one chat entry, and the
  // "/" itself was swallowed rather than typed into the draft.
  await expect(chatInput).toHaveCount(1)
  await expect(chatInput).toHaveValue('hi there')

  await ctx.close()
})

/**
 * The scratchpad is the other panel you type into mid-game, and it wears the
 * same contract via the same helper (`handOffKeyboardOnTab`). crosswords is the
 * vehicle because it's the only game whose manifest enables the scratchpad.
 *
 * Note crosswords normally uses Tab for clue navigation — its own window
 * listener bails on `[data-floating-panel]` first, so the panel's Tab wins
 * without the two fighting.
 */
test('scratchpad: Tab hands the keyboard back to the game', async ({ browser }) => {
  const club = await createSoloClub('ckbs')
  const game = await createCrosswordsGame(club)

  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-xw-cell]').first()).toBeVisible({ timeout: 20000 })

  await page.getByRole('button', { name: 'Open scratchpad' }).click()
  const pad = page.getByRole('textbox', { name: 'Scratchpad' })
  await expect(pad).toBeVisible()
  await pad.click()
  await page.keyboard.type('anagram of X?')
  await expect(pad).toHaveValue('anagram of X?')

  // Tab leaves no field focused — not the next control in the focus order.
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY')
  // ...and the note survives; Tab moves focus, it doesn't discard a draft.
  await expect(pad).toHaveValue('anagram of X?')

  await ctx.close()
})
