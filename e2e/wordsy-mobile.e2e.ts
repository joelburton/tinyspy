// cs-unmet

import { test, expect } from '@playwright/test'
import { createClubWithMembers, createWordsyGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { closeContextsAfterEach } from './helpers/contexts'

closeContextsAfterEach()

/**
 * wordsy's phone layout (docs/mobile.md → The info-sheet recipe): the eight
 * cards fill the width in four columns, the status bar carries the state line,
 * the on-screen keyboard sits under the entry and a word can be typed on it,
 * the page never scrolls, and the info column is an off-canvas sheet behind
 * the header's switch. Layout invariants jsdom can't see.
 *
 * The rival plays on a desktop in a second context, so the game is not
 * paused for want of them.
 */
for (const [w, h, tag] of [
  [390, 844, 'tall'],
  [375, 667, 'short'],
] as const) {
  test(`the board fits and the info sheet works at ${w}x${h}`, async ({ browser }) => {
    const club = await createClubWithMembers([`wm${tag[0]}a`, `wm${tag[0]}b`])
    const [phone, desk] = club.members
    const game = await createWordsyGame(club)

    const deskCtx = await browser.newContext()
    await signIn(deskCtx, desk.session)
    await (await deskCtx.newPage()).goto(`/g/${game.gametype}/${game.id}`)

    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true })
    await signIn(ctx, phone.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    const board = page.getByTestId('board')
    await expect(board).toBeVisible({ timeout: 25000 })

    // The page never scrolls (docs/ui.md → Page-height fits the viewport) …
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
      iw: window.innerWidth,
      ih: window.innerHeight,
    }))
    // Against the phone's own width, not `innerWidth`: a mobile browser widens
    // its layout viewport to fit content too wide for it, so a page that runs
    // off a 375 phone reports 391 and measures in bounds against itself.
    expect(m.iw, 'the layout viewport is the phone\'s width').toBe(w)
    expect(m.sw).toBeLessThanOrEqual(m.iw + 1)
    expect(m.sh).toBeLessThanOrEqual(m.ih + 1)
    // … the board is wholly on screen …
    const box = (await board.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(m.iw + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(m.ih + 1)
    // … the status bar says the round …
    await expect(page.locator('[data-mobile-status]').getByText(/Round/)).toBeVisible()
    // … and the on-screen keyboard is wholly on screen.
    const kb = page.getByLabel('Keyboard')
    await expect(kb).toBeVisible()
    const kbBox = (await kb.boundingBox())!
    expect(kbBox.y + kbBox.height).toBeLessThanOrEqual(m.ih + 1)

    // The rightmost column and the rightmost cap are on screen too: a board
    // that ran wide once cut both off.
    for (const right of [
      page.getByTestId('board').locator(':scope > *').last(),
      kb.getByRole('button', { name: 'Enter', exact: true }),
    ]) {
      const b = (await right.boundingBox())!
      expect(b.x + b.width).toBeLessThanOrEqual(m.iw + 1)
    }

    // A phone types on it: CAB, then its Enter.
    for (const ch of 'cab') await kb.getByRole('button', { name: ch, exact: true }).tap()
    await kb.getByRole('button', { name: 'Enter', exact: true }).tap()
    await expect(page.getByText('Your word is in:')).toBeVisible({ timeout: 10000 })

    // Info sheet: closed = off the right edge; the header's switch slides it
    // in and back off.
    const wrap = page.locator('[data-info-sheet]')
    const xClosed = (await wrap.boundingBox())!.x
    await page.getByRole('button', { name: 'Game info' }).click()
    await page.waitForTimeout(300) // the 160ms slide-in
    const xOpen = (await wrap.boundingBox())!.x
    expect(xOpen).toBeLessThan(xClosed - 100)
    await page.getByRole('button', { name: 'Back to board' }).click()
    await page.waitForTimeout(300)
    expect((await wrap.boundingBox())!.x).toBeGreaterThan(xOpen + 100)
  })
}
