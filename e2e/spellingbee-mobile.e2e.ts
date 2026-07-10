import { test, expect } from '@playwright/test'
import { createSoloClub, createSpellingbeeGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

const WORDS = ['bead', 'beef', 'face', 'fade', 'cage', 'cafe', 'deaf', 'aged', 'bade', 'feed', 'edge', 'abed', 'babe', 'cede', 'dead', 'deed', 'gaff', 'egg', 'ebb', 'add']

test('spellingbee desktop unchanged', async ({ browser }) => {
  const club = await createSoloClub('sbd')
  const game = await createSpellingbeeGame(club)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })
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
  await ctx.close()
})

test('spellingbee mobile — full-width sheet', async ({ browser }) => {
  const club = await createSoloClub('sbm')
  const game = await createSpellingbeeGame(club)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })
  for (const w of WORDS.slice(0, 14)) { await page.keyboard.type(w); await page.keyboard.press('Enter') }
  const s = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, iw: window.innerWidth,
    sh: document.documentElement.scrollHeight, ih: window.innerHeight,
  }))
  expect(s.sw).toBeLessThanOrEqual(s.iw + 1) // no page scroll
  expect(s.sh).toBeLessThanOrEqual(s.ih + 1)
  // Open the info sheet from the menu.
  await page.getByRole('button', { name: 'Game menu' }).click()
  await page.getByText('Game info', { exact: true }).click()
  await page.waitForTimeout(300)
  const wrap = (await page.locator('[data-info-sheet]').boundingBox())!
  console.log('MOBILE SHEET', JSON.stringify({ x: Math.round(wrap.x), w: Math.round(wrap.width), iw: s.iw }))
  expect(wrap.width).toBeGreaterThanOrEqual(s.iw - 1) // full device width
  await ctx.close()
})
