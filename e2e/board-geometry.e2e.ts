import { test, expect, type Browser, type Page } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  createClubWithMembers,
  createSoloClub,
  createCodenamesduetGame,
  createConnectionsGame,
  createGame,
  createStackdownGame,
  createWaffleGame,
  createWordleGame,
  createBoggleGame,
  createScrabbleGame,
  type E2EClub,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Board-geometry before/after guard for the §3.2 hug-board CSS refactor.
 *
 * §3.2 extracts a byte-identical board-width formula (and its square variant)
 * out of eight games into a shared helper. It's meant to be a pixel-for-pixel
 * NO-OP. A behavioural e2e can't prove that — "board doesn't reflow across
 * states" holds both before and after the change. What proves a no-op is a
 * DIRECT before/after comparison of each board's rendered geometry.
 *
 * This test measures the eight boardful games the refactor touches:
 *   rect formula:   psychicnum, connections, codenamesduet, wordle
 *   square variant: waffle, boggle, scrabble, stackdown
 * It reads the bounding box of each game's `.boardCol` (the shared hug column,
 * matched by substring since CSS-module class names are hashed) — the element
 * whose width the formula governs, so any change to the computed width moves
 * this box.
 *
 * Workflow (single machine, same session):
 *   1. On the pre-refactor tree:  BASELINE=1 npx playwright test board-geometry
 *      → writes e2e/.artifacts/board-geometry.json and passes.
 *   2. Do the §3.2 refactor.
 *   3. npx playwright test board-geometry
 *      → re-measures and asserts every box matches the baseline within 0.5px.
 * If the baseline file is absent, the test writes it and passes (so it never
 * breaks a fresh checkout's suite run); set BASELINE=1 to deliberately re-seed.
 *
 * The baseline is a LOCAL artifact (gitignored): board geometry is deterministic
 * for a fixed viewport/DPR, but committing pixel goldens would be brittle across
 * machines. This is a hand-run tool, consistent with the narrow e2e charter.
 *
 * Not in scope: bananagrams (fixed 25×25 arena, not the hug formula) and
 * spellingbee (honeycomb, not a grid) — neither uses the §3.2 arithmetic.
 */

const BASELINE_PATH = 'e2e/.artifacts/board-geometry.json'

/** The rounded box of a board's `.boardCol`. Rounded to 2dp so JSON diffs are
 *  readable; compared with a 0.5px tolerance to absorb sub-pixel rounding. */
type Box = { x: number; y: number; width: number; height: number }

async function measureBoard(page: Page): Promise<Box> {
  const col = page.locator('[class*="boardCol"]').first()
  await expect(col).toBeVisible({ timeout: 20000 })
  const box = await col.boundingBox()
  if (!box) throw new Error('boardCol has no bounding box (not visible / paused?)')
  const round = (n: number) => Math.round(n * 100) / 100
  return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) }
}

/** Sign one solo player in, open the game, and measure its board. Single-player
 *  coop games don't presence-pause (expected === present === 1). */
async function measureSolo(
  browser: Browser,
  club: E2EClub,
  game: { id: string; gametype: string },
): Promise<Box> {
  const ctx = await browser.newContext()
  try {
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    return await measureBoard(page)
  } finally {
    await ctx.close()
  }
}

test.describe('hug-board geometry (§3.2 no-op guard)', () => {
  test('every touched board renders at its baseline geometry', async ({ browser }) => {
    const measured: Record<string, Box> = {}

    // ── Single-player games: one solo club + browser context each. ──────────
    const psychic = await createSoloClub('psychic')
    measured.psychicnum = await measureSolo(browser, psychic, await createGame(psychic))

    const conn = await createSoloClub('conn')
    measured.connections = await measureSolo(browser, conn, await createConnectionsGame(conn))

    const word = await createSoloClub('word')
    measured.wordle = await measureSolo(browser, word, await createWordleGame(word))

    const waffle = await createSoloClub('waffle')
    measured.waffle = await measureSolo(browser, waffle, await createWaffleGame(waffle))

    const bog = await createSoloClub('bog')
    measured.boggle = await measureSolo(browser, bog, await createBoggleGame(bog))

    const scrab = await createSoloClub('scrab')
    measured.scrabble = await measureSolo(browser, scrab, await createScrabbleGame(scrab))

    const stack = await createSoloClub('stack')
    measured.stackdown = await measureSolo(browser, stack, await createStackdownGame(stack))

    // ── codenamesduet: fixed 2-seat game; both must be present or it pauses
    //    and the board unmounts. Two contexts; measure on the opener's page. ──
    const duetClub = await createClubWithMembers(['dueta', 'duetb'])
    const [alice, bob] = duetClub.members
    const duet = await createCodenamesduetGame(duetClub, alice.userId)
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    try {
      await signIn(ctxA, alice.session)
      await signIn(ctxB, bob.session)
      const pageA = await ctxA.newPage()
      const pageB = await ctxB.newPage()
      await pageB.goto(`/g/${duet.gametype}/${duet.id}`)
      await pageA.goto(`/g/${duet.gametype}/${duet.id}`)
      // Both present → un-paused → boards mount.
      await expect(pageB.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })
      measured.codenamesduet = await measureBoard(pageA)
    } finally {
      await ctxA.close()
      await ctxB.close()
    }

    // ── Compare to the baseline, or seed it. ────────────────────────────────
    const wantSeed = process.env.BASELINE === '1'
    let baseline: Record<string, Box> | null = null
    if (!wantSeed) {
      try {
        baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, Box>
      } catch {
        baseline = null // absent → fall through to seed
      }
    }

    if (!baseline) {
      mkdirSync(dirname(BASELINE_PATH), { recursive: true })
      writeFileSync(BASELINE_PATH, JSON.stringify(measured, null, 2) + '\n')
      console.log(
        `[board-geometry] wrote baseline for ${Object.keys(measured).length} boards → ${BASELINE_PATH}`,
      )
      return
    }

    // Every board present in the baseline must match within 0.5px on all four
    // dimensions. A missing/extra key is itself a failure (structure changed).
    expect(Object.keys(measured).sort()).toEqual(Object.keys(baseline).sort())
    for (const [game, want] of Object.entries(baseline)) {
      const got = measured[game]
      for (const dim of ['x', 'y', 'width', 'height'] as const) {
        expect(
          Math.abs(got[dim] - want[dim]),
          `${game}.${dim}: baseline ${want[dim]} vs measured ${got[dim]}`,
        ).toBeLessThan(0.5)
      }
    }
  })
})
