// cs-unmet

import { execFileSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { asUser, createSoloClub, createSetgameGame } from './helpers/fixtures'
import { boardOf, claim, findSetOn } from './helpers/setgame'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * A claim marks the table; a fresh deal does not.
 *
 * The table changes for exactly two reasons: a claim, or a fresh deal (a new
 * game or a Restart). A claim is MARKED — the found set held in a won ring,
 * then the tiles it dealt in the attention flash (`useClaimMarks`) — and a
 * fresh deal is simply shown. The two are told apart by whether a claim EVENT
 * was written, never by the table's shape.
 *
 * What only the real deal rule can show:
 *
 *   1. A FIFTEEN-tile opening, where a claim drops the table to twelve by
 *      tail-compaction: the found set still rings.
 *   2. A Restart after ONE claim, which moves only three slots: nothing is
 *      marked, because no claim did it.
 *   3. A finished game opened with a log full of claims: nothing is marked.
 */
const PSQL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Comfortably past the whole sequence (the found set's hold, then the
 *  attention flash — `src/setgame/hooks/useClaimMarks.ts`). Used only where the
 *  assertion is that NOTHING is marked, so slack here is safe; the positive assertions
 *  poll instead of sleeping, because at these lengths a fixed wait can land
 *  after the mark has already cleared. */
const AFTER_EVERYTHING_MS = 3000

test.describe('setgame — the deal flash', () => {
  test('a claim on a 15-tile board rings the found set; a restart marks nothing', async ({ browser }) => {
    const club = await createSoloClub('flsh')
    const [alice] = club.members
    const { id, gametype } = await createSetgameGame(club)

    // A fifteen-tile opening, planted: only ~3% of shuffles deal one.
    execFileSync('psql', [PSQL, '-v', 'ON_ERROR_STOP=1', '-c',
      `update setgame.games set board = deck[1:15], deck_pos = 15 where id = '${id}'`])

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)
    const tiles = page.locator('button[data-tile]')
    const flashed = page.locator('button[class*="attentionFlash"]')
    await boardReady(page, tiles.first())
    await expect(tiles).toHaveCount(15)
    expect(await flashed.count(), 'the opening board arrives, it does not deal').toBe(0)

    // ── (1) the 15 → 12 claim ──
    await claim(alice, id, findSetOn(await boardOf(alice, id))!)
    // The found set is held in its ring before the table settles. Polled, not
    // slept on: the ring is up for one beat, so a fixed wait is a race with its
    // own window.
    await expect(page.locator('button[class*="found"]').first(), 'the found set is ringed')
      .toBeVisible({ timeout: 10000 })
    // Twelve after tail-compaction — UNLESS the twelve hold no set, in which
    // case the deal-three rule (`setgame._deal_to_playable`, run after every
    // claim) appends three more and the board is fifteen again. Assert the
    // count the server settled on rather than betting on the deal.
    const settled = (await boardOf(alice, id)).length
    expect([12, 15]).toContain(settled)
    await expect(tiles).toHaveCount(settled, { timeout: 15000 })

    // ── (2) stop, then restart ──
    const rpc = (fn: string) =>
      asUser(alice.session.access_token).schema('setgame').rpc(fn, { target_game: id })
    await rpc('stop_game')
    await page.waitForTimeout(900)
    await rpc('replay_board')
    // Wait on the SCORE going back to zero, not on a tile count: replay_board
    // re-deals honestly through the deal rule, so it returns whatever board that
    // deck really opens with — not the fifteen planted above.
    await expect(page.locator('[class*="counts"]:visible')).toContainText('Found: 0', {
      timeout: 15000,
    })
    await page.waitForTimeout(AFTER_EVERYTHING_MS)
    expect(await tiles.count(), 'the whole board is there').toBeGreaterThanOrEqual(12)
    expect(await flashed.count(), 'a restart deals nothing — the board appears').toBe(0)
  })
})

test.describe('setgame — opening a finished game', () => {
  test('an ended game just appears; it does not deal itself out', async ({ browser }) => {
    const club = await createSoloClub('flsh2')
    const [alice] = club.members
    const { id, gametype } = await createSetgameGame(club)
    // Play a couple of claims, then stop it — so the log is FULL of claims when
    // the page first loads. That history is what used to be mistaken for a
    // claim that had just landed.
    for (let i = 0; i < 2; i++) await claim(alice, id, findSetOn(await boardOf(alice, id))!)
    await asUser(alice.session.access_token).schema('setgame').rpc('stop_game', { target_game: id })

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)
    const tiles = page.locator('button[data-tile]')
    await boardReady(page, tiles.first())

    // The whole board is there IMMEDIATELY — not filling in one tile at a time.
    // Measured against what the server settled on, not against twelve: two
    // claims run `setgame._deal_to_playable`, which appends three more whenever
    // the board it would leave holds no set. That is a real shuffle outcome a
    // few percent of the time, and the sibling test above allows for it too.
    const settled = (await boardOf(alice, id)).length
    expect(await tiles.count(), 'the board is complete on arrival').toBe(settled)
    expect(
      await page.locator('button[class*="attentionFlash"]').count(),
      'and nothing flashes',
    ).toBe(0)
  })
})
