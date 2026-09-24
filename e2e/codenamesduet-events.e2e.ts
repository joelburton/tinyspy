// cs-blessed-codenamesduet

import { test, expect, type Browser } from '@playwright/test'
import {
  asUser,
  createClubWithMembers,
  createCodenamesduetGame,
  putCodenamesduetInSuddenDeath,
  type E2EClub,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * codenamesduet's event log, drawn from `codenamesduet.events`, in a real
 * browser end to end — each case moves a real game and reads the log both
 * players see:
 *
 *   1. a clue given exactly as the AI suggested it wears the log's AI mark, and
 *      one the giver edited does not. The suggester is STUBBED at the network —
 *      no case here spends a Claude request;
 *   2. every sudden-death guess is a row of its own — "Sudden death: WORD", the
 *      guesser in the actor column — and its `#N` opens the history banner with
 *      that number.
 *
 * Both players connect in each case, so the game never presence-pauses.
 */

/** Both players on the game's page, board drawn. */
async function openBoth(browser: Browser, club: E2EClub, gameId: string) {
  const url = `/g/codenamesduet/${gameId}`
  const [alice, bob] = club.members
  const ctxAlice = await browser.newContext()
  const ctxBob = await browser.newContext()
  await signIn(ctxAlice, alice.session)
  await signIn(ctxBob, bob.session)
  const pageAlice = await ctxAlice.newPage()
  const pageBob = await ctxBob.newPage()
  await pageBob.goto(url)
  await pageAlice.goto(url)
  await expect(pageAlice.locator('[data-board]')).toBeVisible({ timeout: 20000 })
  await expect(pageBob.locator('[data-board]')).toBeVisible({ timeout: 20000 })
  return { pageAlice, pageBob, close: async () => { await ctxAlice.close(); await ctxBob.close() } }
}

test.describe('codenamesduet event log', () => {
  test('a clue given as the AI suggested it is marked; an edited one is not', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice] = club.members
    const game = await createCodenamesduetGame(club, alice.userId) // alice clues first
    const { pageAlice, pageBob, close } = await openBoth(browser, club, game.id)

    // The suggester answers from here — never from Claude.
    for (const page of [pageAlice, pageBob]) {
      await page.route('**/functions/v1/codenamesduet-suggest-clue', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'ok', outcome: null, severity: null, message: null,
            field: null, meta: null, dbcode: null, detail: null,
            data: { result: 'suggested', suggestion: { clue: 'wave', count: 2, reasoning: 'Stubbed.' } },
          }),
        }),
      )
    }

    // ── Turn 1: alice takes the AI's clue as it came.
    await pageAlice.getByRole('button', { name: 'AI', exact: true }).click()
    const aliceWord = pageAlice.locator('input[data-game-input]').nth(1)
    await expect(aliceWord).toHaveValue('WAVE', { timeout: 10000 })
    await pageAlice.getByRole('button', { name: /submit/i }).click()

    const aiMark = (page: typeof pageAlice) => page.locator('[data-tooltip="AI clue"]')
    await expect(pageBob.getByText('2 WAVE')).toBeVisible({ timeout: 15000 })
    await expect(aiMark(pageBob)).toHaveCount(1)

    // Bob passes, and the clue comes to him.
    await pageBob.getByRole('button', { name: /pass/i }).click()

    // ── Turn 2: bob asks the AI, then edits its word before sending.
    await pageBob.getByRole('button', { name: 'AI', exact: true }).click({ timeout: 15000 })
    const bobWord = pageBob.locator('input[data-game-input]').nth(1)
    await expect(bobWord).toHaveValue('WAVE', { timeout: 10000 })
    await bobWord.fill('OCEAN')
    await pageBob.getByRole('button', { name: /submit/i }).click()

    await expect(pageAlice.getByText('2 OCEAN')).toBeVisible({ timeout: 15000 })
    // Still only turn 1's clue wears the mark.
    await expect(aiMark(pageAlice)).toHaveCount(1)

    await close()
  })

  test('every sudden-death guess is its own row, and its #N opens that turn', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createCodenamesduetGame(club, alice.userId)
    putCodenamesduetInSuddenDeath(game.id)

    // In sudden death a guess is judged on the PARTNER's key. alice turns over
    // one of bob's agents (the game goes on), then bob turns over one of alice's
    // bystanders (it ends).
    const asAlice = asUser(alice.session.access_token).schema('codenamesduet')
    const keys = await asAlice.from('games').select('key_card_a, key_card_b').eq('id', game.id).single()
    const words = await asAlice.from('words').select('position, word').eq('game_id', game.id)
    const keyA = keys.data!.key_card_a as string[]
    const keyB = keys.data!.key_card_b as string[]
    const agentOfBob = keyB.findIndex((label, p) => label === 'G' && keyA[p] !== 'A')
    const bystanderOfAlice = keyA.findIndex((label, p) => label === 'N' && p !== agentOfBob)
    const wordAt = (p: number) => words.data!.find((w) => w.position === p)!.word.toUpperCase()

    const { pageAlice, pageBob, close } = await openBoth(browser, club, game.id)

    await asAlice.rpc('submit_guess', { target_game: game.id, target_position: agentOfBob })
    await asUser(bob.session.access_token).schema('codenamesduet')
      .rpc('submit_guess', { target_game: game.id, target_position: bystanderOfAlice })

    // Two rows, one per guess, each naming its own guesser.
    const rows = pageAlice.getByRole('row').filter({ hasText: 'Sudden death:' })
    await expect(rows).toHaveCount(2, { timeout: 15000 })
    await expect(rows.nth(0)).toContainText(`Sudden death: ${wordAt(agentOfBob)}`)
    await expect(rows.nth(0)).toContainText(alice.username)
    await expect(rows.nth(1)).toContainText(`Sudden death: ${wordAt(bystanderOfAlice)}`)
    await expect(rows.nth(1)).toContainText(bob.username)

    // The first row's #N opens that turn, and the banner shows the number back.
    await rows.nth(0).locator('[data-history-handle]').click()
    const banner = pageAlice.locator('[data-history-banner]')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner).toContainText(`#1: Sudden death → ${wordAt(agentOfBob)}`)

    await pageBob.close()
    await close()
  })
})
