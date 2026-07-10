import { test, expect, type Browser } from '@playwright/test'
import { createClubWithMembers, createCodenamesduetGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * codenamesduet's mobile layout (docs/mobile.md → the psychicnum recipe). The
 * clue-giver's below-board clue input raises the OS keyboard, and the giver needs
 * the board's key-card colors while composing — so we DON'T shrink or clamp the
 * board; it stays full-size and the page scrolls (giver scrolls up to read the
 * board, down to the clue field). This browser test covers the layout invariants
 * jsdom can't: board fills, the page doesn't scroll at rest, the info column is
 * the collapsed off-canvas sheet, and the below-board action buttons go icon-only.
 */
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

// alice = clue-giver; bob present (2nd context) so no presence-pause. `aliceCtx`
// sets alice's viewport (phone by default; the desktop test overrides).
async function setup(browser: Browser, aliceCtx: Parameters<Browser['newContext']>[0] = PHONE) {
  const club = await createClubWithMembers(['alice', 'bob'])
  const [alice, bob] = club.members
  const game = await createCodenamesduetGame(club, alice.userId)
  const url = `/g/${game.gametype}/${game.id}`

  const ctxBob = await browser.newContext()
  await signIn(ctxBob, bob.session)
  await (await ctxBob.newPage()).goto(url)

  const ctxAlice = await browser.newContext(aliceCtx)
  await signIn(ctxAlice, alice.session)
  const page = await ctxAlice.newPage()
  await page.goto(url)
  await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })
  return { page, ctxAlice, ctxBob, peer: bob }
}

test.describe('codenamesduet mobile', () => {
  test('clue-writing — board fills, no scroll at rest, collapsed sheet, icon-only buttons', async ({
    browser,
  }) => {
    const { page, ctxAlice, ctxBob } = await setup(browser)
    await expect(page.locator('input[data-game-input]')).toHaveCount(2) // I'm the clue-giver

    // Board fills; the page doesn't scroll at rest (keyboard closed).
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
      iw: window.innerWidth, ih: window.innerHeight,
    }))
    expect(m.sw).toBeLessThanOrEqual(m.iw + 1)
    expect(m.sh).toBeLessThanOrEqual(m.ih + 1)

    // The below-board action buttons are icon-only on a phone (label → aria-label,
    // `icon-only` class, no visible text).
    // exact: true — loose names collide with board tiles ("AI" ⊂ "CHAIN"/"HAIR").
    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toHaveClass(/icon-only/)
    await expect(page.getByRole('button', { name: 'AI', exact: true })).toHaveClass(/icon-only/)

    // Feedback drops the player NAME to just the identity dot on a phone (the
    // ActorDot/ActorTag `show="auto"` behavior). The header pill's peer name is in
    // the DOM but hidden; the sentence text remains.
    await expect(page.locator('[class*="namePhoneHidden"]').first()).toBeHidden()

    // The info column is the collapsed off-canvas sheet (present, slid off-right);
    // the slide-in/close mechanism is identical CSS to wordle, guarded there.
    const wrap = page.locator('[data-info-sheet]')
    expect((await wrap.boundingBox())!.x).toBeGreaterThanOrEqual(m.iw - 1)
    await page.getByRole('button', { name: 'Game menu' }).click()
    await expect(page.getByText('Game info', { exact: true })).toBeVisible()

    await ctxAlice.close(); await ctxBob.close()
  })

  test('desktop keeps the player name in feedback (drop is phone-only)', async ({
    browser,
  }) => {
    const { page, ctxAlice, ctxBob, peer } = await setup(browser, {
      viewport: { width: 1280, height: 800 },
    })
    // The header pill's peer name is SHOWN on desktop — the ActorDot name span is
    // visible (the `namePhoneHidden` class only bites under @media (--phone)), so
    // moving the name into a widget didn't change the desktop feedback.
    const name = page.locator('[class*="namePhoneHidden"]').first()
    await expect(name).toBeVisible()
    await expect(name).toHaveText(peer.username)

    await ctxAlice.close(); await ctxBob.close()
  })
})
