import { test, expect } from '@playwright/test'
import { createSoloClub, createWordleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * A window can be desktop-WIDE and phone-SHORT at the same time, and the app has
 * to survive it. The case that forced this: a 2256×1504 laptop panel at 200%
 * Windows display scaling hands the browser 1128×752 CSS px, of which ~617
 * survives the browser chrome. That's wider than the 56.25rem mobile
 * breakpoint — so the desktop layout renders — in a viewport shorter than most
 * phones.
 *
 * **wordle is the only game this breaks**, and the reason is structural rather
 * than incidental: it's the one game that stacks a board AND an on-screen
 * keyboard in the board column, so its board hugs its width instead of filling
 * the column, and a width-hug board doesn't know when it has run out of height.
 * (Measured across thirteen games: every other one sizes off `--avail-h` and
 * fits at 560px. letterboxed sits ~5px over at short heights — small, constant,
 * unrelated to this, and left alone.)
 *
 * wordle's fix is a `max-width` on the grid derived from the leftover height.
 * That rule already existed — it was gated to `@media (--mobile)`, on the
 * reasoning that a desktop column is tall with slack to spare, which is exactly
 * the assumption a 200%-scaled laptop breaks. This file guards the ungating,
 * from both ends:
 *
 *   1. at a short desktop window the stack FITS, and the board has actually
 *      shrunk to make it fit;
 *   2. where there IS room the cap changes nothing — because "it's free when
 *      unneeded" is the entire argument for applying it at every width, and a
 *      regression there would be a silent visual change to every desktop.
 */

/** Leah's laptop, in CSS pixels: desktop-wide, phone-short. */
const CRAMPED = { width: 1128, height: 617 }
/** What the app is designed against. */
const ROOMY = { width: 1440, height: 900 }

/** Board size + whether anything overflows the window, for one viewport. */
async function measure(browser: import('@playwright/test').Browser, session: never, url: string, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport })
  await signIn(ctx, session)
  const page = await ctx.newPage()
  await page.goto(url)
  await boardReady(page, page.locator('[data-board]').first())
  await page.waitForTimeout(300)
  const m = await page.evaluate(() => {
    // `data-board` is ON the grid element itself (Board.tsx), not a wrapper.
    const grid = document.querySelector('[data-board]') as HTMLElement
    const keys = document.querySelector('[class*="keyboard"], [class*="Keyboard"]') as HTMLElement | null
    const g = grid.getBoundingClientRect()
    return {
      overflow: document.documentElement.scrollHeight - window.innerHeight,
      board: { w: Math.round(g.width), h: Math.round(g.height) },
      keyboardBottom: keys ? Math.round(keys.getBoundingClientRect().bottom) : null,
      windowHeight: window.innerHeight,
    }
  })
  await ctx.close()
  return m
}

test('wordle fits a desktop-width, phone-height window', async ({ browser }) => {
  test.setTimeout(180_000)
  const club = await createSoloClub('shortvp')
  const game = await createWordleGame(club, 'coop')
  const url = `/g/${game.gametype}/${game.id}`
  const session = club.members[0].session as never

  const cramped = await measure(browser, session, url, CRAMPED)
  const roomy = await measure(browser, session, url, ROOMY)

  // 1px is the shell's known standing overshoot (docs/deferred.md).
  expect(cramped.overflow, 'nothing is clipped below the fold').toBeLessThanOrEqual(1)
  expect(
    cramped.keyboardBottom!,
    'the whole on-screen keyboard is above the bottom of the window',
  ).toBeLessThanOrEqual(cramped.windowHeight)

  // The board shrank to achieve that — i.e. the height cap engaged, rather than
  // the page happening to fit for some other reason.
  expect(cramped.board.h, 'the board gave up height to make room').toBeLessThan(roomy.board.h)

  // …and it stayed square while doing it (wordle's iconic look), within a
  // pixel of rounding on the 5×6 aspect ratio.
  const tile = cramped.board.w / 5
  expect(Math.abs(cramped.board.h / 6 - tile), 'tiles are still square').toBeLessThan(1.5)
})

test('the height cap is inert when there is room to spare', async ({ browser }) => {
  test.setTimeout(180_000)
  const club = await createSoloClub('roomyvp')
  const game = await createWordleGame(club, 'coop')
  const url = `/g/${game.gametype}/${game.id}`
  const session = club.members[0].session as never

  // 720 is where the cap stops binding; 900 is the design target. The board must
  // be the same at both, which is what makes ungating a no-op for everyone who
  // already fits — if this fails, desktop boards changed size.
  const at720 = await measure(browser, session, url, { width: 1440, height: 720 })
  const at900 = await measure(browser, session, url, ROOMY)
  expect(at720.board).toEqual(at900.board)
  expect(at720.overflow).toBeLessThanOrEqual(1)
})
