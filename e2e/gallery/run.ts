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
import type { BuiltGame, GameGallery } from './types'
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
        }
      }
    }
  } finally {
    await browser.close()
  }

  // Ragged by design: a game that has no `lost` cell gets an explicit hole, so
  // "nobody has looked at this state" reads as information rather than absence.
  for (const g of games) {
    for (const mode of ['coop', 'compete'] as const) {
      for (const phase of ['fresh', 'mid', 'won', 'lost'] as const) {
        const declared = g.cells.some((c) => c.mode === mode && c.phase === phase)
        if (declared) continue
        for (const vp of VIEWPORTS) {
          shots.push({
            game: g.game,
            cell: { mode, phase },
            viewport: vp.name,
            file: null,
            missing: 'no such state',
          })
        }
      }
    }
  }

  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
  writeFileSync(join(ROOT, 'index.html'), renderIndex(shots, stamp))
  const ok = shots.filter((s) => s.file).length
  console.log(`\n${ok}/${shots.length} tiles → ${ROOT}/index.html`)
}

main()
