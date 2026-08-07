#!/usr/bin/env -S npx tsx
/**
 * The screenshot gallery (docs/testing.md → The screenshot gallery).
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
 * ── Regenerate only what you're looking at ──────────────────────────────────
 * A full run is minutes and hundreds of files, which is a miserable loop when
 * you've changed one game. So it takes `[game] [tech]`:
 *
 *   gmake gallery                        every game, every technology
 *   gmake gallery GAME=waffle            waffle: desktop, mobile and PDF
 *   gmake gallery GAME=waffle TECH=pdf   waffle's printouts only
 *   gmake gallery-index                  rebuild index.html, capture nothing
 *
 * Nothing is wiped wholesale: a partial run replaces only the files it
 * regenerates, so the rest of the sheet survives.
 *
 * That works because THE INDEX IS BUILT FROM DISK — it walks every game's
 * declared cells, asks which files exist, and renders accordingly. It is not a
 * summary of what this run happened to do, which is why a one-game run doesn't
 * produce a one-game sheet, and why rebuilding the index alone is instant.
 *
 * Usage:  npm run _gallery -- [game] [tech]     (public entry: `gmake gallery`)
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { type E2EClub } from '../helpers/fixtures'
import { galleryClub } from './personas'
import { signIn } from '../helpers/session'
import { renderIndex, renderViewer, type Shot } from './index'
import { PHASES, type BuiltGame, type Cell, type GameGallery } from './types'
import { bananagramsGallery } from './games/bananagrams'
import { boggleGallery } from './games/boggle'
import { codenamesduetGallery } from './games/codenamesduet'
import { connectionsGallery } from './games/connections'
import { crosswordsGallery } from './games/crosswords'
import { psychicnumGallery } from './games/psychicnum'
import { scrabbleGallery } from './games/scrabble'
import { spellingbeeGallery } from './games/spellingbee'
import { stackdownGallery } from './games/stackdown'
import { strandsGallery } from './games/strands'
import { waffleGallery } from './games/waffle'
import { wordiplyGallery } from './games/wordiply'
import { wordwheelGallery } from './games/wordwheel'
import { letterboxedGallery } from './games/letterboxed'
import { wordleGallery } from './games/wordle'

const ALL: GameGallery[] = [
  bananagramsGallery,
  boggleGallery,
  codenamesduetGallery,
  connectionsGallery,
  crosswordsGallery,
  letterboxedGallery,
  psychicnumGallery,
  scrabbleGallery,
  spellingbeeGallery,
  stackdownGallery,
  strandsGallery,
  waffleGallery,
  wordiplyGallery,
  wordleGallery,
  wordwheelGallery,
]


/**
 * Mark every game this member is in as an invitation already seen.
 *
 * A player who didn't create a game gets an "X added you to a new Y game"
 * popup, suppressed once by a `seen` set in localStorage. Every gallery context
 * is a brand-new browser profile, so that set starts empty — and by the time
 * the run photographs a cell from a NON-creator's chair (the losing seat of a
 * compete terminal, say), every game the run has ever made stacks up as Join
 * toasts over the info column.
 *
 * Scoped to the MEMBER, not to the club: each game gets its own club, but the
 * invitation query doesn't care about clubs — it asks "what games am I a player
 * in?" — so a club-scoped seed left every other game's invite still popping.
 *
 * Seeding the set is the honest fix rather than clicking the toasts away: in a
 * real club these invitations surfaced when they happened, days ago. What's
 * unreal here is the fresh browser profile, not the dismissal.
 */
async function suppressInvites(ctx: BrowserContext, userId: string): Promise<void> {
  const ids = execFileSync(
    'psql',
    [
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-X',
      '-tA',
      '-c',
      `select game_id from common.game_players where user_id = '${userId}';`,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
  await ctx.addInitScript(
    `localStorage.setItem('puzpuzpuz:gameInvitesSeen', ${JSON.stringify(JSON.stringify(ids))})`,
  )
}

/**
 * A terminal cell must have actually reached a terminal.
 *
 * wordiply's compete `won` tile was a mid-race board for weeks: compete gives
 * each player their OWN five guesses, so the builder spending one player's five
 * left the game running, and the screenshot showed a half-played board under a
 * heading that said someone had won. Nothing caught it, because a screenshot
 * asserts nothing — it renders whatever it's given, and a plausible-looking
 * wrong state is exactly what this whole sheet exists to expose, not to publish.
 *
 * So the one thing worth asserting is the thing a cell CLAIMS: a cell called
 * `won`, `lost` or `ended` must leave `common.games.is_terminal` true. Failing
 * loudly turns a silently-wrong tile into a hole with a reason on it.
 */
function assertPhaseReached(gameId: string, phase: string): void {
  if (phase !== 'won' && phase !== 'lost' && phase !== 'ended') return
  const terminal = execFileSync(
    'psql',
    [
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-X',
      '-tA',
      '-c',
      `select is_terminal from common.games where id = '${gameId}';`,
    ],
    { encoding: 'utf8' },
  ).trim()
  if (terminal !== 't') {
    throw new Error(
      `cell claims '${phase}' but the game is still playing — the builder did not reach a terminal`,
    )
  }
}

const ROOT = 'gallery'
const BASE = 'http://localhost:5173'

/** Desktop first, per docs/ui.md; the phone is the 390px iPhone width. */
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

/**
 * Wait until the play surface is actually there.
 *
 * `goto` resolves on `load`, but this is an SPA: the game row, the roster and
 * the realtime subscription all land after that, and every PlayArea shows
 * "Loading…" until they do — so without this the gallery would be hundreds of
 * photographs of a loading state.
 *
 * The game-menu button says the shell is up, but it mounts with the HEADER,
 * which is up before the game data is; so the real signal is the loading text
 * going away. Tolerant of never seeing it, since most games are past it by the
 * time we look. (The board column would be a sharper signal, but crosswords is
 * the documented v3 layout exception and has none — keying off `.boardCol`
 * silently timed out on exactly that one game.)
 */
async function settle(page: Page): Promise<void> {
  await page
    .waitForSelector('text=Loading…', { state: 'detached', timeout: 8000 })
    .catch(() => {})
  // A last beat for entry animations and the realtime refetch. Cosmetic — this
  // is a screenshot, nothing is asserted after it.
  await page.waitForTimeout(1200)
}

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
      await suppressInvites(ctx, member.userId)
      await signIn(ctx, member.session)
      const page = await ctx.newPage()
      await page.goto(url)
      if (isViewer) viewerPage = page
    }
    if (!viewerPage) throw new Error('the viewer is not a member of the club')

    // Wait for the game MENU, not the board column: crosswords is the
    // documented v3 layout exception and renders its own `.layout` with no
    // `.boardCol` at all, so keying off the board column silently timed out on
    // it. The menu button is the one element every game page has.
    await viewerPage.waitForSelector('button[aria-label="Game menu"]', { timeout: 20000 })
    await settle(viewerPage)
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
      await suppressInvites(ctx, member.userId)
      await signIn(ctx, member.session)
      const page = await ctx.newPage()
      await page.goto(`${BASE}/g/${built.gametype}/${built.id}`)
      if (member.userId === built.viewer.userId) viewerPage = page
    }
    if (!viewerPage) throw new Error('the viewer is not a member of the club')
    await viewerPage.waitForSelector('button[aria-label="Game menu"]', { timeout: 20000 })
    await settle(viewerPage)

    await viewerPage.getByRole('button', { name: 'Game menu' }).click()
    const [download] = await Promise.all([
      viewerPage.waitForEvent('download'),
      // "Print board (PDF)" everywhere except crosswords, which says
      // "Print / Save as PDF" and adds a second item for its answer key —
      // .first() takes the puzzle, which is the one every other game means.
      viewerPage.getByText(/Print.*\(?PDF\)?/).first().click(),
    ])

    const pdf = join(ROOT, `${g.game}-${cell.mode}-${cell.phase}-pdf.pdf`)
    await download.saveAs(pdf)
    return pdf
  } finally {
    for (const c of contexts) await c.close()
  }
}


/** Where a given tile lives. `pdf` keeps its real extension so it opens as one. */
function fileFor(game: string, mode: string, phase: string, tech: string): string {
  const stem = `${game}-${mode}-${phase}-${tech}`
  return tech === 'pdf' ? `${stem}.pdf` : `${stem}.png`
}

/**
 * The sheet's contents, read off the DISK rather than off this run.
 *
 * Every game's declared cells crossed with every technology; a tile exists if
 * its file does. This is what lets a one-game run leave the other fourteen
 * standing — and what makes `gallery-index` instant, since rebuilding the sheet
 * is just this walk plus a render.
 */
function shotsFromDisk(games: GameGallery[]): Shot[] {
  const shots: Shot[] = []
  const techs = [...VIEWPORTS.map((v) => v.name), 'pdf']
  for (const g of games) {
    for (const mode of ['coop', 'compete'] as const) {
      for (const phase of PHASES) {
        const declared = g.cells.find((c) => c.mode === mode && c.phase === phase)
        for (const tech of techs) {
          const file = fileFor(g.game, mode, phase, tech)
          const cell: Cell = declared ?? { mode, phase }
          shots.push(
            existsSync(join(ROOT, file))
              ? { game: g.game, cell, viewport: tech, file }
              : {
                  game: g.game,
                  cell,
                  viewport: tech,
                  file: null,
                  // Ragged by design, and the wording matters: the script cannot
                  // know a state is UNREACHABLE, only that nobody wrote a builder
                  // for it. An earlier version claimed the stronger thing and was
                  // wrong — both first games had a real compete loss it was
                  // quietly asserting couldn't happen. A hole should invite
                  // "should that be there?".
                  missing: declared ? 'not captured yet' : 'no cell declared',
                },
          )
        }
      }
    }
  }
  return shots
}

async function main() {
  const [gameArg, techArg] = process.argv.slice(2).map((a) => a.trim()).filter(Boolean)
  const indexOnly = gameArg === 'index'

  const games = indexOnly || !gameArg ? ALL : ALL.filter((g) => g.game === gameArg)
  if (!games.length) {
    throw new Error(`no such game: ${gameArg} (have: ${ALL.map((g) => g.game).join(', ')})`)
  }
  const techs = techArg
    ? [techArg]
    : [...VIEWPORTS.map((v) => v.name), 'pdf']
  const known = [...VIEWPORTS.map((v) => v.name), 'pdf']
  for (const t of techs) {
    if (!known.includes(t)) throw new Error(`no such tech: ${t} (have: ${known.join(', ')})`)
  }

  mkdirSync(ROOT, { recursive: true })

  // (The Makefile deletes gallery/index.html before invoking this, so a run
  // that dies leaves NO sheet rather than yesterday's. It has to happen out
  // there: a syntax error kills this file before any line of it runs, which is
  // precisely the failure that most needs the stale sheet gone.)

  if (!indexOnly) {
    // Prune ONLY what's about to be regenerated, so a cell removed from a
    // builder doesn't leave a stale tile behind while the rest of the sheet
    // survives untouched. (`gallery/` is gitignored working output; snapshots
    // worth keeping live in the committed `gallery-keep/`.)
    for (const name of readdirSync(ROOT)) {
      const hit = games.some((g) => name.startsWith(`${g.game}-`)) &&
        techs.some((t) => name.includes(`-${t}.`))
      if (hit) rmSync(join(ROOT, name), { force: true })
    }

    const browser = await chromium.launch()
    try {
      for (const g of games) {
        // One club per game, seated with the DEV PERSONAS rather than
        // throwaway accounts — so every game the gallery makes is one you can
        // open in a browser and iterate against (see personas.ts).
        const club = await galleryClub(g.brand, g.members)
        for (const cell of g.cells) {
          let built
          try {
            built = await g.build(club, cell)
            assertPhaseReached(built.id, cell.phase)
          } catch (err) {
            console.error(`  ✗ ${g.game} ${cell.mode}/${cell.phase}: ${msg(err)}`)
            continue
          }
          for (const vp of VIEWPORTS) {
            if (techs.includes(vp.name)) {
              try {
                console.log(`  ✓ ${await shoot(browser, g, cell, built, club, vp)}`)
              } catch (err) {
                console.error(`  ✗ ${g.game} ${cell.mode}/${cell.phase} ${vp.name}: ${msg(err)}`)
              }
            }
            // EVERY state is printed, on the desktop pass — not a per-game
            // judgement about what deserves paper. A printout is a code path
            // with its own layout in every state, and the empty and mid-game
            // ones are where its bugs live. Once, not once per viewport: a PDF
            // is the same document whatever the browser window is.
            if (vp.name !== 'desktop' || !techs.includes('pdf')) continue
            try {
              console.log(`  ✓ ${await print(browser, g, cell, built, club)}`)
            } catch (err) {
              console.error(`  ✗ ${g.game} ${cell.mode}/${cell.phase} pdf: ${msg(err)}`)
            }
          }
        }
      }
    } finally {
      await browser.close()
    }
  }

  // ALWAYS from disk, and always for ALL games — so a one-game run still writes
  // a whole sheet rather than a sheet with one game in it.
  const shots = shotsFromDisk(ALL)
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
  const brands = Object.fromEntries(ALL.map((g) => [g.game, g.brand]))
  writeFileSync(join(ROOT, 'index.html'), renderIndex(shots, stamp, brands))
  writeFileSync(join(ROOT, 'viewer.html'), renderViewer())
  const ok = shots.filter((s) => s.file).length
  console.log(`\n${ok}/${shots.length} tiles → ${ROOT}/index.html`)

  // Cells nobody has written a builder for. A NOTE, not a failure: the script
  // can't tell "unreachable" from "not written yet", and making it assert would
  // turn a browsing tool into a test. But it has to say something — this is the
  // gap that let the first two games ship with no compete loss at all.
  //
  // A mode a game declares NOTHING for is a mode it doesn't HAVE (bananagrams
  // is compete-only; codenamesduet coop-only), so its phases aren't gaps, and
  // listing them would bury the real ones. ⚠ The known blind spot: this rule
  // makes an INCOMPLETELY-declared game indistinguishable from a single-mode
  // one — psychicnum's compete column was missing for months because its
  // builder declared no compete cells and nothing here could tell. When a new
  // game lands, check its cells against its manifest pair, not this report.
  const playable = new Set(ALL.flatMap((g) => g.cells.map((c) => `${g.game}/${c.mode}`)))
  const gaps = [
    ...new Set(
      shots
        .filter((s) => s.missing === 'no cell declared' && playable.has(`${s.game}/${s.cell.mode}`))
        .map((s) => `${s.game.padEnd(14)}${s.cell.mode}/${s.cell.phase}`),
    ),
  ]
  if (gaps.length) {
    console.log(`\n  note: ${gaps.length} cells have no builder yet`)
    for (const g of gaps) console.log(`    ${g}`)
    console.log('  — add a cell, or ignore if the state is unreachable')
  }

  // DECLARED cells with no file on disk — a builder that failed (its ✗ scrolled
  // past mid-run) or was added and never run. This is the category the summary
  // used to omit, which let FIVE broken builders (connections' losses, waffle's
  // compete terminals, strands' compete win) hide behind a green-looking sheet
  // for months while the docs claimed every hole was an unreachable state. A
  // declared cell asserts "this state exists and matters"; a hole under it is
  // always work, never information.
  const failed = [
    ...new Set(
      shots
        .filter((s) => s.missing === 'not captured yet')
        .map((s) => `${s.game.padEnd(14)}${s.cell.mode}/${s.cell.phase}`),
    ),
  ]
  if (failed.length) {
    console.log(`\n  ⚠ ${failed.length} DECLARED cells have no tiles on disk (build failed or never ran):`)
    for (const f of failed) console.log(`    ${f}`)
    console.log('  — rerun those games and read their ✗ lines')
  }
}

/** An error's message, however it was thrown. */
function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

main()
