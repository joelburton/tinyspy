// cs-blessed-connections

import { execFileSync } from 'node:child_process'
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createClubWithMembers, createWordleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * Presence-pause, end to end — the rule that stops a game while somebody who
 * is still playing has gone, and does NOT stop it for somebody who is done.
 *
 * Every other spec meets this feature only by avoiding it ("solo club so the
 * game doesn't presence-pause"), which left the machinery undriven in a real
 * browser. It is also the only level that CAN drive it: the roster is decided
 * in `useCommonGame` from live presence, so pgTAP cannot see it and the unit
 * test mocks the very reads that carry it.
 *
 * Two tests, and the first is what gives the second its meaning. A negative
 * ("the overlay did not appear") proves nothing on its own — it passes just as
 * well against a broken presence channel, a dead subscription, or a spec that
 * closed the wrong context. So the first test takes a player away MID-GAME and
 * waits for the overlay, which pins how the failure looks and how fast it
 * arrives; the second takes a player away who has FINISHED and asserts the
 * same window passes quietly, with the survivor's board still taking moves.
 *
 * wordle compete stands in for the six games with a per-player finish
 * (docs/common.md → Done, but not out). Its solve is a single typed word whose
 * target the pgTAP suites already read as the superuser, so "this player is
 * finished" costs one keystroke line — in connections or psychicnum it would
 * be a dozen moves of setup for the same rule.
 */

/** The hidden answer, read the way the pgTAP suites do: as the superuser, since
 *  the column is grant-hidden from players until the game is over. */
function targetOf(gameId: string): string {
  const word = execFileSync(
    'psql',
    [
      // -X: skip ~/.psqlrc, whose settings banner would be read as the answer.
      '-X',
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-tAc',
      `select target from wordle.games where id = '${gameId}'`,
    ],
    { encoding: 'utf8' },
  ).trim()
  expect(word).toMatch(/^[a-z]{5}$/)
  return word
}

const board = (page: Page) => page.getByRole('grid', { name: /board/i })
const pauseBanner = (page: Page) => page.getByText('Waiting for everyone to connect…')

/** Two signed-in players on the same compete game, both boards up — which is
 *  also what proves they are both PRESENT: a game with someone missing shows
 *  the overlay instead of a board. */
async function twoPlayersOnOneGame(browser: Browser) {
  const club = await createClubWithMembers(['alice', 'bob'])
  const [alice, bob] = club.members
  const game = await createWordleGame(club, 'compete')
  const url = `/g/${game.gametype}/${game.id}`

  const open = async (session: typeof alice.session): Promise<[BrowserContext, Page]> => {
    const ctx = await browser.newContext()
    await signIn(ctx, session)
    const page = await ctx.newPage()
    await page.goto(url)
    return [ctx, page]
  }

  const [ctxA, pageA] = await open(alice.session)
  const [ctxB, pageB] = await open(bob.session)
  await boardReady(pageA, board(pageA))
  await boardReady(pageB, board(pageB))
  return { game, ctxA, pageA, ctxB, pageB }
}

test.describe('presence-pause', () => {
  test('a player who is still racing takes the game with them', async ({ browser }) => {
    const { ctxA, ctxB, pageB } = await twoPlayersOnOneGame(browser)

    // Alice closes her tab mid-game. She has guessed nothing, so the game is
    // still waiting on her.
    await ctxA.close()

    // Bob's board is taken away and the overlay names what it is waiting for.
    // This is the shape the second test asserts the ABSENCE of, measured here
    // rather than assumed.
    await expect(pauseBanner(pageB)).toBeVisible({ timeout: 20000 })
    await expect(board(pageB)).toBeHidden()

    await ctxB.close()
  })

  test('a player who has finished does not', async ({ browser }) => {
    const { game, ctxA, pageA, ctxB, pageB } = await twoPlayersOnOneGame(browser)

    // Alice solves on her first guess. In compete that ends HER race and not
    // the race — bob plays his board out, and the winner is whoever solved in
    // the fewest guesses — so the game is still `playing` and she is exactly
    // the player this rule is about.
    const target = targetOf(game.id)
    await pageA.keyboard.type(target)
    await pageA.keyboard.press('Enter')
    // Her info column takes the locally-terminal LOOK — "Waiting for others",
    // wordle's words for done-but-the-game-isn't. NOT the terminal verdict
    // ("Solved it!"), which belongs to a game that is over for everyone, and
    // bob's board is the proof it isn't.
    await expect(pageA.getByText('Waiting for others')).toBeVisible({ timeout: 15000 })
    await expect(board(pageB)).toBeVisible()

    // …and then closes her tab. Nothing is waiting for her.
    await ctxA.close()

    // Well past the window the first test measured the overlay arriving in.
    // A negative needs a dwell — there is nothing on bob's screen that reports
    // alice's leaving, precisely because it no longer changes anything.
    await pageB.waitForTimeout(10000)

    await expect(pauseBanner(pageB)).toBeHidden()
    await expect(board(pageB)).toBeVisible()

    // The strongest form of "not paused": the board still takes a move. A pause
    // unmounts the play surface, so a guess that lands proves the surface is
    // live rather than merely painted. It is also the last move of the race —
    // both racers are done — so bob's info column goes from playing to the
    // compete verdict in one step.
    await pageB.keyboard.type(target)
    await pageB.keyboard.press('Enter')
    await expect(pageB.getByText(target.toUpperCase(), { exact: true })).not.toHaveCount(0)

    await ctxB.close()
  })
})
