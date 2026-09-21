// cs-unmet

import { test, expect, type Browser, type Locator, type Page } from '@playwright/test'
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
  createSpellingbeeGame,
  createWordwheelGame,
  type E2EClub,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Board-geometry before/after guard for CSS refactors that MUST be pixel-for-
 * pixel no-ops. A behavioral e2e can't prove that — "board doesn't reflow
 * across states" holds both before and after the change. What proves a no-op is
 * a DIRECT before/after comparison of each board's rendered geometry.
 *
 * Built for the §3.2 hug-board refactor (which extracted a byte-identical
 * board-width formula, and its square variant, out of eight games into a shared
 * helper); reused since for any board-geometry-touching move. Games measured:
 *   rect formula:   psychicnum, connections, codenamesduet, wordle
 *   square variant: waffle, boggle, scrabble, stackdown
 *   fork pair:      spellingbee, wordwheel
 * It reads the bounding box of each game's `.boardCol` (the shared hug column,
 * matched by substring since CSS-module class names are hashed) — the element
 * whose width the formula governs, so any change to the computed width moves
 * this box.
 *
 * The fork pair is measured TWICE — the column AND the board root inside it
 * (`_board_`) — because their shared PlayArea module carries the coordinate-unit
 * arithmetic (`--u`, `--board-width`) that sizes the board within a column that
 * would hug either way. Sharing that module across two games with different
 * bounding boxes (the honeycomb's 256×267 capped at 320; the wheel's 300×300) is
 * exactly the change where a wrong number resizes a board instead of erroring.
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
 * crosswords (its own keyboard-required layout).
 */

const BASELINE_PATH = 'e2e/.artifacts/board-geometry.json'

/** The rounded box of a board's `.boardCol`. Rounded to 2dp so JSON diffs are
 *  readable; compared with a 0.5px tolerance to absorb sub-pixel rounding. */
type Box = { x: number; y: number; width: number; height: number }

/** A visible locator's rounded box. One copy of the rounding, so two measured
 *  elements can never be rounded differently. */
async function boxOf(loc: Locator): Promise<Box> {
  const box = await loc.boundingBox()
  if (!box) throw new Error('element has no bounding box (not visible / paused?)')
  const round = (n: number) => Math.round(n * 100) / 100
  return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) }
}

async function measureBoard(page: Page): Promise<Box> {
  const col = page.locator('[class*="boardCol"]').first()
  await expect(col).toBeVisible({ timeout: 20000 })
  return await boxOf(col)
}

/**
 * The three boxes the `.boardCol` pass above cannot see, measured for the three
 * found-words games: the below-board row, whose width is pinned to the board's
 * own through a custom property, and — at phone width — the board column plus
 * the status block mirrored above it, whose height the same stylesheet budgets
 * out of `--avail-h`.
 *
 * They are here because the family's play-surface stylesheet is split between
 * `shared/found-words` (the layout scaffolding all three compose) and
 * `shared/bee-games` (the hive-and-wheel board geometry). That split moves
 * exactly these three boxes and none of the ones the pass above measures — so
 * without this, a clean run would have reported a no-op over a real regression.
 */
async function measureBelowAndMobile(
  browser: Browser,
  club: E2EClub,
  game: { id: string; gametype: string },
): Promise<{ belowBoard: Box; phoneCol: Box; phoneStatus: Box }> {
  const ctx = await browser.newContext()
  try {
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    const below = page.locator('[class*="belowBoard"]').first()
    await expect(below).toBeVisible({ timeout: 20000 })
    const belowBoard = await boxOf(below)

    // Below the breakpoint the info column goes off-canvas and the state
    // readout reappears as a fixed-height block above the board, which the
    // board pays for out of its own height. `[data-mobile-status]` is that
    // block's own e2e handle (hashed module classes aren't selectable).
    await page.setViewportSize({ width: 390, height: 844 })
    const status = page.locator('[data-mobile-status]').first()
    await expect(status).toBeVisible({ timeout: 20000 })
    const col = page.locator('[class*="boardCol"]').first()
    await expect(col).toBeVisible({ timeout: 20000 })
    return { belowBoard, phoneCol: await boxOf(col), phoneStatus: await boxOf(status) }
  } finally {
    await ctx.close()
  }
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

/** As `measureSolo`, but also measures the board root INSIDE the column — for
 *  the games whose shared module does coordinate-unit arithmetic, where the
 *  column can hug correctly while the board within it is the wrong size.
 *  `_board_` with the trailing underscore is the board's own root; a loose
 *  `board` match would hit `boardCol`, its parent. */
async function measureSoloWithBoard(
  browser: Browser,
  club: E2EClub,
  game: { id: string; gametype: string },
): Promise<{ col: Box; board: Box }> {
  const ctx = await browser.newContext()
  try {
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    const col = await measureBoard(page)
    const inner = page.locator('[class*="_board_"]').first()
    await expect(inner).toBeVisible({ timeout: 20000 })
    return { col, board: await boxOf(inner) }
  } finally {
    await ctx.close()
  }
}

test.describe('hug-board geometry (§3.2 no-op guard)', () => {
  test('every touched board renders at its baseline geometry', async ({ browser }) => {
    // This one test builds and measures TWELVE games; every other test in the
    // suite does one or two, and the config's 45s was sized for those ("the
    // suite is small, so this is cheap"). It normally runs in 12–19s, so 45s
    // looks like headroom and isn't: when the whole run is slow, the budget
    // expires while measureBoard is still waiting, and a test-level timeout
    // says only "45s passed" — it can't say WHICH board never arrived.
    //
    // The point of raising it is to make a future failure MEAN something. With
    // room to run, measureBoard's own 20s assertion fires first and names the
    // board. A timeout here after this would be real evidence of a hang, not
    // an ambiguity. (Seen once on 2026-08-12, in a suite run that took 9.3m
    // against a usual ~6m; 21 attempts to reproduce — isolated, under CPU load,
    // and in-suite — all passed, so the cause is still unknown.)
    test.setTimeout(120_000)

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
    const bogGame = await createBoggleGame(bog)
    measured.boggle = await measureSolo(browser, bog, bogGame)

    const scrab = await createSoloClub('scrab')
    measured.scrabble = await measureSolo(browser, scrab, await createScrabbleGame(scrab))

    const stack = await createSoloClub('stack')
    measured.stackdown = await measureSolo(browser, stack, await createStackdownGame(stack))

    // ── The fork pair: column AND board root (see the header note). ──────────
    const sbee = await createSoloClub('sbee')
    const sbeeGame = await createSpellingbeeGame(sbee)
    const sbeeBoxes = await measureSoloWithBoard(browser, sbee, sbeeGame)
    measured.spellingbee = sbeeBoxes.col
    measured.spellingbee_board = sbeeBoxes.board

    const wwheel = await createSoloClub('wwheel')
    const wwheelGame = await createWordwheelGame(wwheel)
    const wwheelBoxes = await measureSoloWithBoard(browser, wwheel, wwheelGame)
    measured.wordwheel = wwheelBoxes.col
    measured.wordwheel_board = wwheelBoxes.board

    // ── The found-words family's below-board row and mobile regime. ─────────
    for (const [name, club, game] of [
      ['boggle', bog, bogGame],
      ['spellingbee', sbee, sbeeGame],
      ['wordwheel', wwheel, wwheelGame],
    ] as const) {
      const m = await measureBelowAndMobile(browser, club, game)
      measured[`${name}_belowBoard`] = m.belowBoard
      measured[`${name}_phoneCol`] = m.phoneCol
      measured[`${name}_phoneStatus`] = m.phoneStatus
    }

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
