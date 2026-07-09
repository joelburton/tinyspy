import { test, expect } from '@playwright/test'
import { createClubWithMembers, createScrabbleGame, pinScrabbleSeat } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Compete AI opponent (docs/scrabble-ai-strength.md): the FULL loop against the
 * real scrabble-ai-move edge function. A game with one human (alice) + one AI is
 * rigged so it's the AI's turn on load; alice's client detects the AI turn and
 * pokes the edge function, which plays the AI seat via ai_play_word. We assert
 * the AI's move lands in the shared Moves log attributed to "AI 1" — proving the
 * whole chain (FE trigger → edge fn → get_ai_context → choosePlay → ai_play_word
 * → seat-based turn/log). The local edge runtime serves it (part of
 * `supabase start`); the bundled wordlist must exist (npm run scrabble:wordlist).
 */
test.describe('scrabble — AI opponent (compete)', () => {
  test('the AI takes its turn and its play shows in the log as "AI 1"', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice] = club.members
    // 1 human + 1 best AI, full dictionary (the band rule requires 6 for best).
    const game = await createScrabbleGame(club, 'compete', [alice.userId], {
      timer: { kind: 'none' },
      dict_2: 6,
      dict_3plus: 6,
      ai_count: 1,
      ai_level: 'best',
    })
    // Give the AI seat (seat 1) a rack with an easy opening word, and make it
    // the AI's turn so the move fires the moment alice's client loads.
    pinScrabbleSeat(game.id, 1, ['C', 'A', 'T', 'S', 'E', 'R', 'O'])

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // "AI 1" is present from the start (the score strip), so it alone doesn't
    // prove a move. A first Moves-log row (#1) is the real signal: it's the AI's
    // turn and alice isn't playing, so the only actor who can produce a
    // committed play is the AI, driven by the edge function.
    await expect(
      page.getByText('#1'),
      'the AI committed its opening play (turn #1 appears)',
    ).toBeVisible({ timeout: 30_000 })
    // And it's attributed to the AI in the log.
    await expect(page.getByText('AI 1', { exact: false }).first()).toBeVisible()

    await ctx.close()
  })
})
