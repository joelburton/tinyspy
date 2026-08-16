import { test, expect } from '@playwright/test'
import { createSoloClub, createSpellingbeeGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

const WORDS = ['bead', 'beef', 'face', 'fade', 'cage', 'cafe', 'deaf', 'aged', 'bade', 'feed', 'edge', 'abed', 'babe', 'cede', 'dead', 'deed', 'gaff', 'egg', 'ebb', 'add']

test('spellingbee desktop unchanged', async ({ browser }) => {
  const club = await createSoloClub('sbd')
  const game = await createSpellingbeeGame(club)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await boardReady(page, page.locator('[class*="boardCol"]').first())
  for (const w of WORDS) { await page.keyboard.type(w); await page.keyboard.press('Enter') }
  await page.waitForTimeout(400)
  const m = await page.evaluate(() => {
    const info = document.querySelector('[class*="infoCol"]') as HTMLElement
    const layout = document.querySelector('[class*="_layout_"]') as HTMLElement
    const ir = info.getBoundingClientRect(), lr = layout.getBoundingClientRect()
    return { infoW: Math.round(ir.width), infoRight: Math.round(ir.right), layoutRight: Math.round(lr.right) }
  })
  console.log('DESKTOP', JSON.stringify(m))
  // Info col is still the fixed 53rem (~848px), flush against the layout's right edge.
  expect(m.infoW).toBeGreaterThan(820)
  expect(m.layoutRight - m.infoRight).toBeLessThan(4) // flush right
  // The word list's third tally is a DESKTOP-only clause — here it shows.
  // `innerText` (not textContent) is the point: the span stays in the DOM at
  // every width and CSS decides, so only rendered text can tell the two apart.
  const deskHeading = page.locator('h3').filter({ hasText: /^Words:/ }).first()
  expect(await deskHeading.evaluate((el) => (el as HTMLElement).innerText)).toMatch(/· Longest: \d+/)
  await ctx.close()
})

test('spellingbee mobile — full-width sheet', async ({ browser }) => {
  const club = await createSoloClub('sbm')
  const game = await createSpellingbeeGame(club)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await boardReady(page, page.locator('[class*="boardCol"]').first())
  for (const w of WORDS.slice(0, 14)) { await page.keyboard.type(w); await page.keyboard.press('Enter') }
  const s = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, iw: window.innerWidth,
    sh: document.documentElement.scrollHeight, ih: window.innerHeight,
  }))
  expect(s.sw).toBeLessThanOrEqual(s.iw + 1) // no page scroll
  expect(s.sh).toBeLessThanOrEqual(s.ih + 1)

  // The info column is off-canvas here, so the state unit (RankBar + Stats) is
  // mirrored ABOVE the hive by the shared <MobileStatusBar> — the same two
  // components the sheet renders, so they can't drift. Its height is already
  // subtracted from the hive's --avail-h, which is why the no-scroll assertions
  // above still hold.
  const statusBar = page.locator('[data-mobile-status]')
  // (The labels render uppercase via CSS; the DOM text is "Score" / "Words".)
  await expect(statusBar).toContainText('Score')
  await expect(statusBar).toContainText('Words')
  const barBox = (await statusBar.boundingBox())!
  // `_board_` (with the trailing underscore) is Letters' own root — `_boardCol_`
  // is the column that CONTAINS the status bar, so a loose match would compare
  // the bar against its own parent.
  const hiveBox = (await page.locator('[class*="_board_"]').first().boundingBox())!
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(hiveBox.y + 1)
  // Open the info sheet from the menu.
  // Straight to the header's page-switch button — no game-menu detour.
  // "Game info" used to be a MENU ITEM and was folded into this one header
  // control (GamePage: "consolidating the old Game info menu item and the
  // sheet's ✕ into one control"), so opening the menu first only laid its
  // popover BACKDROP over the button this line wants. A race that bit under
  // full-suite load — waffle-mobile lost it on 2026-08-16.
  await page.getByRole('button', { name: 'Game info' }).click()
  await page.waitForTimeout(300)
  const wrap = (await page.locator('[data-info-sheet]').boundingBox())!
  console.log('MOBILE SHEET', JSON.stringify({ x: Math.round(wrap.x), w: Math.round(wrap.width), iw: s.iw }))
  expect(wrap.width).toBeGreaterThanOrEqual(s.iw - 1) // full device width

  // …and in that sheet the heading shares one line with both filter selects, so
  // the third tally is hidden here — the count and the score earn their place,
  // the longest word doesn't. Hidden by CSS, NOT dropped from the tree: the
  // textContent assertion pins that, so a future "fix" that removes the span
  // instead of hiding it fails rather than silently changing the approach.
  const sheetHeading = page.locator('h3').filter({ hasText: /^Words:/ }).first()
  expect(await sheetHeading.evaluate((el) => (el as HTMLElement).innerText)).not.toMatch(/Longest/)
  expect(await sheetHeading.evaluate((el) => el.textContent)).toMatch(/· Longest: \d+/)
  await ctx.close()
})
