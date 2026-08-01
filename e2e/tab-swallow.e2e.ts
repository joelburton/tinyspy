import { test, expect } from '@playwright/test'
import {
  createSoloClub,
  createBananagramsGame,
  createScrabbleGame,
  createStackdownGame,
  createWaffleGame,
  createConnectionsGame,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Tab must do NOTHING while the board owns the keyboard.
 *
 * A play surface isn't a form: there's no meaningful "next field". Left native,
 * Tab walks the page's focus order onto the header buttons, then the info
 * column's, and eventually out of the document into the browser's own chrome
 * (the URL bar) — leaving a player who tabbed by reflex somewhere their typing
 * no longer reaches the game.
 *
 * These five games take their keys straight off `window`, so they had no Tab
 * swallow; the games with a text entry have always got one from `useCaptureKeys`
 * (boggle, spellingbee, wordle, wordwheel, wordiply, psychicnum), and crosswords
 * deliberately keeps Tab as clue navigation. See `useSwallowTab`.
 *
 * The assertion is "focus never leaves `<body>`" — jsdom can't model this, so it
 * has to be a real browser.
 */
const GAMES = [
  { name: 'bananagrams', make: createBananagramsGame },
  { name: 'scrabble', make: createScrabbleGame },
  { name: 'stackdown', make: createStackdownGame },
  { name: 'waffle', make: createWaffleGame },
  { name: 'connections', make: createConnectionsGame },
] as const

test.describe('Tab does nothing on the board', () => {
  for (const { name, make } of GAMES) {
    test(name, async ({ browser }) => {
      const club = await createSoloClub('tab' + name.slice(0, 4))
      const game = await make(club)
      const ctx = await browser.newContext()
      await signIn(ctx, club.members[0].session)
      const page = await ctx.newPage()
      await page.goto(`/g/${game.gametype}/${game.id}`)

      // Wait for the play surface, not just the route — before the board mounts
      // there's nothing listening and the assertion would pass vacuously.
      await expect(page.locator('[class*="boardCol"], [class*="_layout"]').first()).toBeVisible({
        timeout: 20000,
      })
      const activeTag = () => page.evaluate(() => document.activeElement?.tagName ?? null)
      expect(await activeTag()).toBe('BODY')

      // Repeated Tab (and Shift+Tab, the other direction out) leaves focus put.
      await page.keyboard.press('Tab')
      expect(await activeTag()).toBe('BODY')
      await page.keyboard.press('Tab')
      expect(await activeTag()).toBe('BODY')
      await page.keyboard.press('Shift+Tab')
      expect(await activeTag()).toBe('BODY')

      await ctx.close()
    })
  }
})
