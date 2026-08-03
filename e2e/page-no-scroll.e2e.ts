import { test, expect, type Page, type Locator } from '@playwright/test'
import { createClubWithMembers, renameClub } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * "The page never scrolls" is a HARD layout invariant for this app: every
 * screen fits the viewport, and where content is long the SCROLL lives in an
 * inner region (the chat body, the club's game list) — the document itself must
 * never gain a horizontal or vertical scrollbar.
 *
 * The specific regression this guards: floating panels (chat, the setup dialog,
 * every `FloatingPanel` modal) can be dragged partly off-screen to "park" them
 * aside, and doing so used to extend the DOCUMENT and scroll the whole page
 * (dragging the setup dialog into a corner grew the document from 1100×800 to
 * ~1519×1290). `FloatingPanel` now clips each panel to a fixed, viewport-sized
 * layer, so the off-screen part is clipped instead of extending the page. These
 * tests drag panels hard into opposite corners and assert the document stays
 * exactly viewport-sized — covering both panel variants (the ephemeral setup
 * dialog with a backdrop, and the persisted chat panel without one).
 */

/** Assert the DOCUMENT has no scroll on either axis (the hard invariant). */
async function expectNoPageScroll(page: Page, label: string): Promise<void> {
  const { scrollW, scrollH, vw, vh } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    vw: window.innerWidth,
    vh: window.innerHeight,
  }))
  expect(scrollW, `${label}: no horizontal page scroll`).toBeLessThanOrEqual(vw)
  expect(scrollH, `${label}: no vertical page scroll`).toBeLessThanOrEqual(vh)
}

/** Drag a panel by the CENTRE of its header to an absolute viewport point. */
async function dragHeaderTo(page: Page, header: Locator, x: number, y: number): Promise<void> {
  const box = await header.boundingBox()
  if (!box) throw new Error('panel header has no bounding box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150) // let the drag-stop rect settle
}

test.describe('page never scrolls', () => {
  test('the setup dialog dragged off-viewport does not scroll the page', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    const vp = page.viewportSize()!

    // Baseline: the club page itself respects the invariant.
    await expectNoPageScroll(page, 'club page baseline')

    // Reopen the (ephemeral) dialog before each corner so its header always
    // starts centred and fully grabbable, then drag it hard past that corner.
    const corners: Array<[number, number]> = [
      [vp.width - 15, vp.height - 15], // bottom-right (the original repro)
      [15, 15], // top-left
    ]
    for (const [cx, cy] of corners) {
      await page.getByRole('button', { name: /RackAttack/ }).first().click()
      const header = page.locator('header').filter({ hasText: 'Start RackAttack' })
      await expect(header).toBeVisible({ timeout: 15_000 })
      await dragHeaderTo(page, header, cx, cy)
      await expectNoPageScroll(page, `setup dialog parked near (${cx}, ${cy})`)
      await page.keyboard.press('Escape') // close before the next corner
      await expect(header).toBeHidden()
    }

    await ctx.close()
  })

  test('the chat panel dragged off-viewport does not scroll the page', async ({ browser }) => {
    const club = await createClubWithMembers(['carol', 'dave'])
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    await page.getByRole('button', { name: 'Open chat', exact: true }).click()
    const header = page.locator('header').filter({ hasText: 'Chat' })
    await expect(header).toBeVisible()

    // Chat is the persisted-panel path (its own code branch); park it in a
    // corner and the document must still not scroll.
    await dragHeaderTo(page, header, 1085, 785)
    await expectNoPageScroll(page, 'chat parked bottom-right')

    await ctx.close()
  })

  /**
   * A club NAME is user-supplied text in the biggest type on the page (the
   * club-page h1). It's capped at 20 characters server-side (2026-08-03), which
   * keeps a realistic name on one line at 390px — but 20 characters can still
   * be ONE unbreakable token, and a run of wide capitals pushed the document
   * wider than the viewport before `.title` gained `overflow-wrap: anywhere`.
   * The cap bounds the damage; the wrap rule is what makes the invariant hold.
   *
   * Headless-only: it's a text-measurement bug, invisible to jsdom.
   */
  test('a max-length unbreakable club name does not scroll a phone sideways', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['cnx', 'cny'])
    // Exactly 20 characters, no spaces, all wide capitals — the worst name the
    // CHECK still allows.
    await renameClub(club.handle, 'MWWMWWMWWMWWMWWMWWMW')

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)
    await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeVisible({
      timeout: 20000,
    })
    await expectNoPageScroll(page, 'club page with a max-length unbreakable name')

    await ctx.close()
  })
})
