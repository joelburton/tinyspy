import { execFileSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { asUser, createSoloClub, createSetgameGame } from './helpers/fixtures'
import { boardOf, claim, findSetOn } from './helpers/setgame'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * The deal flash marks cards ARRIVING — and only cards arriving.
 *
 * The board changes for exactly two reasons: a claim, or a fresh deal (a new
 * game or a restart). A claim is MARKED — the departing set held on screen, then
 * the replacements lit — and a fresh deal is simply shown, unmarked. `PlayArea`
 * tells them apart by asking whether a claim EVENT was written, rather than by
 * inferring it from the board; both bugs below came from inferring.
 *
 * Two things this spec pins that a unit test cannot, because both depend on the
 * real board sizes the deal rule produces:
 *
 *   1. A FIFTEEN-card opening. Claiming drops it to twelve by tail-compaction —
 *      cards MOVE from the end into the holes. They were already on the board,
 *      so "which cards are new?" found nothing and they landed silently.
 *   2. A restart after ONE claim, which is the discriminating case. Two claims
 *      move six slots, enough that the old count-the-slots guess called it a
 *      re-deal by luck; one claim moves three, and the restart flashed them as
 *      freshly dealt. Reported twice from real play.
 *
 * Both cases are asserted on the ARRIVING mark, which outlives the departure
 * hold and so is the one that is reliably on screen when the dust settles.
 */
const PSQL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Comfortably past the whole sequence (a 600ms hold plus a 1200ms lit
 *  arrival, both in `src/setgame/lib/flash.ts`). Used only where the assertion
 *  is that NOTHING is marked, so slack here is safe; the positive assertions
 *  poll instead of sleeping, because at these lengths a fixed wait can land
 *  after the mark has already cleared. */
const AFTER_EVERYTHING_MS = 3000

test.describe('setgame — the deal flash', () => {
  test('a 15-card board flashes what lands; a restart flashes nothing', async ({ browser }) => {
    const club = await createSoloClub('flsh')
    const [alice] = club.members
    const { id, gametype } = await createSetgameGame(club)

    // A fifteen-card opening, planted: only ~3% of shuffles deal one.
    execFileSync('psql', [PSQL, '-v', 'ON_ERROR_STOP=1', '-c',
      `update setgame.games set board = deck[1:15], deck_pos = 15 where id = '${id}'`])

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)
    const cards = page.locator('button[class*="card"]')
    const flashed = page.locator('button[class*="arriving"]')
    await boardReady(page, cards.first())
    await expect(cards).toHaveCount(15)
    expect(await flashed.count(), 'the opening board arrives, it does not deal').toBe(0)

    // ── (1) the 15 → 12 claim ──
    await claim(alice, id, findSetOn(await boardOf(alice, id))!)
    await expect(cards).toHaveCount(12, { timeout: 15000 })
    // Polled, not slept on: the mark appears after the hold and clears again
    // shortly after, so a fixed wait is a race with its own window.
    await expect(flashed.first(), 'the cards that moved into the holes are marked')
      .toBeVisible({ timeout: 10000 })

    // ── (2) end, then restart ──
    const rpc = (fn: string) =>
      asUser(alice.session.access_token).schema('setgame').rpc(fn, { target_game: id })
    await rpc('end_game')
    await page.waitForTimeout(900)
    await rpc('replay_board')
    // Wait on the SCORE going back to zero, not on a card count: replay_board
    // re-deals honestly through the deal rule, so it returns whatever board that
    // deck really opens with — not the fifteen planted above.
    await expect(page.locator('[class*="counts"]:visible')).toContainText('Found: 0', {
      timeout: 15000,
    })
    await page.waitForTimeout(AFTER_EVERYTHING_MS)
    expect(await cards.count(), 'the whole board is there').toBeGreaterThanOrEqual(12)
    expect(await flashed.count(), 'a restart deals nothing — the board appears').toBe(0)
  })
})

test.describe('setgame — opening a finished game', () => {
  test('an ended game just appears; it does not deal itself out', async ({ browser }) => {
    const club = await createSoloClub('flsh2')
    const [alice] = club.members
    const { id, gametype } = await createSetgameGame(club)
    // Play a couple of claims, then end it — so the log is FULL of claims when
    // the page first loads. That history is what used to be mistaken for a
    // claim that had just landed.
    for (let i = 0; i < 2; i++) await claim(alice, id, findSetOn(await boardOf(alice, id))!)
    await asUser(alice.session.access_token).schema('setgame').rpc('end_game', { target_game: id })

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)
    const cards = page.locator('button[class*="card"]')
    await boardReady(page, cards.first())

    // The whole board is there IMMEDIATELY — not filling in one card at a time.
    expect(await cards.count(), 'the board is complete on arrival').toBe(12)
    expect(
      await page.locator('button[class*="arriving"]').count(),
      'and nothing flashes',
    ).toBe(0)
  })
})
