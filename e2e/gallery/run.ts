#!/usr/bin/env -S npx tsx
/**
 * The screenshot gallery (docs/gallery-plan.md).
 *
 * Puts every game into every interesting state and photographs it, then writes
 * an HTML contact sheet. Fifteen games x coop/compete x four phases x two
 * viewports is more than anyone opens by hand, which is how cross-game drift
 * goes unnoticed.
 *
 * **It is not a test.** It asserts nothing and fails nothing — deliberately no
 * `toHaveScreenshot`, no baselines, no CI gate. Snapshot assertions answer "did
 * anything change?", which in a UI that changes daily means constant baseline
 * churn for changes you meant. This answers "do these look like one app?", and
 * only a person answers that. So it runs when you ask it to, and the output is
 * for your eyes.
 *
 * That's also why it's a plain script rather than a Playwright test: it drives
 * the browser directly, so `npm run test:e2e` can't accidentally pick it up.
 *
 * ── The split that makes it fast ────────────────────────────────────────────
 * Getting into a state is SERVER work (each game's own RPCs, no browser);
 * looking at it is BROWSER work (navigate, wait, shoot — no interaction). The
 * browser never plays, which removes nearly all the flakiness, since realtime
 * waits are what make e2e fragile.
 *
 * Usage:  npm run _gallery            (public entry: `gmake gallery`)
 *         GAMES=letterboxed npm run _gallery      — just one game
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext } from '@playwright/test'
import { createClubWithMembers, type E2EClub } from '../helpers/fixtures'
import { signIn } from '../helpers/session'
import { renderIndex, type Shot } from './index'
import type { BuiltGame, Cell, GameGallery } from './types'
import { letterboxedGallery } from './games/letterboxed'
import { wordleGallery } from './games/wordle'

const ALL: GameGallery[] = [letterboxedGallery, wordleGallery]

const ROOT = 'gallery'
const BASE = 'http://localhost:5173'

/** Desktop first, per docs/ui.md; the phone is the 390px iPhone width. */
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

/**
 * Photograph one cell.
 *
 * **Every member joins, not just the one being photographed** — and that's the
 * whole reason this harness beats doing it by hand. A game whose players aren't
 * all connected PRESENCE-PAUSES (docs/common.md): the board is replaced by a
 * paused overlay, so a single-context screenshot of a two-player game captures
 * nothing but the pause. So each member gets a context, they all land on the
 * game, and only the viewer's page is shot. Terminal cells don't pause, but
 * joining everyone anyway keeps one code path.
 *
 * This is the "multiple test users in separate tabs" chore, done by the script.
 */
async function shoot(
  browser: Browser,
  g: GameGallery,
  cell: { mode: 'coop' | 'compete'; phase: string; note?: string },
  built: BuiltGame,
  club: E2EClub,
  vp: (typeof VIEWPORTS)[number],
): Promise<string> {
  const url = `${BASE}/g/${built.gametype}/${built.id}`
  const contexts: BrowserContext[] = []
  try {
    let viewerPage
    for (const member of club.members) {
      // Peers ride a desktop viewport whatever the shot's size — they exist to
      // satisfy presence, and are never photographed.
      const isViewer = member.userId === built.viewer.userId
      const ctx = await browser.newContext({
        viewport: isViewer ? { width: vp.width, height: vp.height } : { width: 1280, height: 900 },
      })
      contexts.push(ctx)
      await signIn(ctx, member.session)
      const page = await ctx.newPage()
      await page.goto(url)
      if (isViewer) viewerPage = page
    }
    if (!viewerPage) throw new Error('the viewer is not a member of the club')

    // Wait for the play surface rather than a clock: every game's board column
    // carries the shared class, so this is one selector for all fifteen.
    await viewerPage.waitForSelector('[class*="boardCol"]', { timeout: 20000 })
    // A short settle for the realtime refetch + any entry animation. The only
    // sleep in here, and it's cosmetic — nothing is asserted after it.
    await viewerPage.waitForTimeout(1500)
    const file = join(ROOT, `${g.game}-${cell.mode}-${cell.phase}-${vp.name}.png`)
    await viewerPage.screenshot({ path: file, fullPage: false })
    return file
  } finally {
    for (const c of contexts) await c.close()
  }
}

/**
 * Print one state and put the PAPER in the sheet.
 *
 * The whole point of having it here is adjacency: the printout lands next to
 * the screenshot of the same state, so "does the paper say what the screen
 * says?" is a glance rather than an exercise. Today's session found two drifts
 * (a setup list reporting different facts on paper, and a literal
 * "undefined%") that only surfaced because a PDF happened to get rendered —
 * this is that, on purpose.
 *
 * Kept as a PDF, not rendered to PNG. The first version converted with
 * `pdftoppm` so every tile could be an <img>; that was worse on both counts a
 * printout is judged by. A page render at a legible DPI is 3-6x the size of the
 * PDF it came from (~35-70KB against ~12KB), and it's a raster — so the text
 * that the whole page exists to communicate softens, exactly when you zoom in
 * to read it. The vector original is smaller AND sharper, and skipping the
 * conversion drops a poppler dependency.
 *
 * The sheet embeds them instead (see renderIndex), which also means every page
 * is reachable rather than just page one.
 */
async function print(
  browser: Browser,
  g: GameGallery,
  cell: Cell,
  built: BuiltGame,
  club: E2EClub,
): Promise<string> {
  const contexts: BrowserContext[] = []
  try {
    // Same presence rule as a screenshot: a non-terminal game whose players
    // aren't all connected is paused, and a paused game has no menu to print
    // from. Cheap to just join everyone.
    let viewerPage
    for (const member of club.members) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      contexts.push(ctx)
      await signIn(ctx, member.session)
      const page = await ctx.newPage()
      await page.goto(`${BASE}/g/${built.gametype}/${built.id}`)
      if (member.userId === built.viewer.userId) viewerPage = page
    }
    if (!viewerPage) throw new Error('the viewer is not a member of the club')
    await viewerPage.waitForSelector('[class*="boardCol"]', { timeout: 20000 })
    await viewerPage.waitForTimeout(800)

    await viewerPage.getByRole('button', { name: 'Game menu' }).click()
    const [download] = await Promise.all([
      viewerPage.waitForEvent('download'),
      viewerPage.getByText('Print board (PDF)').click(),
    ])

    const pdf = join(ROOT, `${g.game}-${cell.mode}-${cell.phase}-pdf.pdf`)
    await download.saveAs(pdf)
    return pdf
  } finally {
    for (const c of contexts) await c.close()
  }
}

async function main() {
  const only = process.env.GAMES?.split(',').map((s) => s.trim()).filter(Boolean)
  const games = only?.length ? ALL.filter((g) => only.includes(g.game)) : ALL
  if (!games.length) throw new Error(`no gallery games matched GAMES=${process.env.GAMES}`)

  // Wipe the image folder so a removed cell doesn't leave a stale tile behind.
  // Safe to be destructive: `gallery/` is gitignored WORKING output, rewritten
  // wholesale by every run. Snapshots worth remembering live in the committed
  // `gallery-keep/`, promoted by `gmake gallery-keep NAME=…` — which is what
  // keeps git history free of thirty-PNG diffs from every casual look.
  rmSync(ROOT, { recursive: true, force: true })
  mkdirSync(ROOT, { recursive: true })

  const browser = await chromium.launch()
  const shots: Shot[] = []
  try {
    for (const g of games) {
      // One club per game, sized for its widest cell. Compete needs a rival to
      // exist even when only one seat is photographed.
      const club = await createClubWithMembers(
        Array.from({ length: g.members }, (_, i) => `g${g.game.slice(0, 4)}${i}`),
      )
      for (const cell of g.cells) {
        let built
        try {
          built = await g.build(club, cell)
        } catch (err) {
          const why = err instanceof Error ? err.message : String(err)
          console.error(`  ✗ ${g.game} ${cell.mode}/${cell.phase}: ${why}`)
          for (const vp of VIEWPORTS) {
            shots.push({ game: g.game, cell, viewport: vp.name, file: null, missing: why })
          }
          continue
        }
        for (const vp of VIEWPORTS) {
          try {
            const file = await shoot(browser, g, cell, built, club, vp)
            console.log(`  ✓ ${file}`)
            shots.push({ game: g.game, cell, viewport: vp.name, file: file.slice(ROOT.length + 1) })
          } catch (err) {
            const why = err instanceof Error ? err.message : String(err)
            console.error(`  ✗ ${g.game} ${cell.mode}/${cell.phase} ${vp.name}: ${why}`)
            shots.push({ game: g.game, cell, viewport: vp.name, file: null, missing: why })
          }
          // EVERY state gets printed, on the desktop pass. Not a per-game
          // judgement about what's worth printing on paper: a printout is a
          // code path with its own layout in every state, and the empty and
          // mid-game ones are where its bugs actually live (letterboxed's fresh
          // print crowds "Chain / No words yet / Moves / None yet" in a way its
          // won print doesn't). docs/pdf.md's opening line says you can print
          // mid-game OR at the end, so leaving mid-game uncovered left a
          // documented use case at zero.
          //
          // Once, not once per viewport: a PDF is the same document whatever
          // the browser window is, so printing it twice would just be slower.
          if (vp.name !== 'desktop') continue
          try {
            const file = await print(browser, g, cell, built, club)
            console.log(`  ✓ ${file}`)
            shots.push({ game: g.game, cell, viewport: 'pdf', file: file.slice(ROOT.length + 1) })
          } catch (err) {
            const why = err instanceof Error ? err.message : String(err)
            console.error(`  ✗ ${g.game} ${cell.mode}/${cell.phase} pdf: ${why}`)
            shots.push({ game: g.game, cell, viewport: 'pdf', file: null, missing: why })
          }
        }
      }
    }
  } finally {
    await browser.close()
  }

  // Ragged by design: a cell a game didn't declare gets an explicit hole, so
  // "nobody has looked at this state" reads as information rather than absence.
  //
  // The wording is "no cell declared", NOT "no such state" — the script cannot
  // know a state is unreachable, only that nobody wrote a builder for it. The
  // first version claimed the stronger thing and was WRONG about it: both games
  // here have a real compete loss (letterboxed when everyone concedes, wordle
  // when every racer burns their budget), and the sheet was quietly asserting
  // those couldn't happen. A hole should invite "should that be there?", which
  // is exactly the question it failed to prompt.
  for (const g of games) {
    for (const mode of ['coop', 'compete'] as const) {
      for (const phase of ['fresh', 'mid', 'won', 'lost'] as const) {
        const declared = g.cells.find((c) => c.mode === mode && c.phase === phase)
        if (declared) continue
        for (const vp of [...VIEWPORTS.map((v) => v.name), 'pdf']) {
          shots.push({
            game: g.game,
            cell: { mode, phase },
            viewport: vp,
            file: null,
            missing: 'no cell declared',
          })
        }
      }
    }
  }

  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
  writeFileSync(join(ROOT, 'index.html'), renderIndex(shots, stamp))
  const ok = shots.filter((s) => s.file).length
  console.log(`\n${ok}/${shots.length} tiles → ${ROOT}/index.html`)

  // Cells nobody declared, listed where you'll actually see them. This is a
  // NOTE, not a failure: the script can't tell "unreachable" from "not written
  // yet", and making it assert would turn a browsing tool into a test — the one
  // thing the design rules out. But it does have to say something, because the
  // gap it names is exactly how both games shipped without a compete loss.
  const undeclared = shots.filter((s) => s.missing === 'no cell declared')
  if (undeclared.length) {
    const seen = new Set<string>()
    console.log('\n  note: cells never declared')
    for (const s of undeclared) {
      const key = `${s.game} ${s.cell.mode}/${s.cell.phase}`
      if (seen.has(key)) continue
      seen.add(key)
      console.log(`    ${s.game.padEnd(14)}${s.cell.mode}/${s.cell.phase}`)
    }
    console.log('  — add a cell, or ignore if the state is unreachable')
  }
}

main()
