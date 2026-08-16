import { test, expect } from '@playwright/test'
import { createClubWithMembers, createSetgameGame, createSoloClub } from './helpers/fixtures'
import { boardOf, claim, findNonSetOn, findSetOn, letterForSlot } from './helpers/setgame'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * Smoke tests for setgame (HareTrigger), covering the two things that only
 * exist in a browser: the two input routes onto one selection, and the
 * CONTENTION case — a rival claiming a card out from under a half-made pick,
 * which no other game on the roster can produce.
 *
 * There is no fixture board: a setgame board is a shuffle, so every run deals a
 * different one and the specs find their move by reading the board (helpers/
 * setgame.ts) rather than by knowing it in advance.
 */
const cards = (page: import('@playwright/test').Page) =>
  page.locator('button[class*="card"]')

/** The counts row that is actually ON SCREEN.
 *
 * Scoped twice over. The turn log's heading carries the same two numbers
 * filtered to whoever is selected, so a bare `getByText('Found: 1')` matches
 * both — hence the class. And there are now TWO counts rows in the DOM: the
 * info column's and the mobile status bar's, the latter hidden by
 * `display: none` above the breakpoint rather than unmounted, which trips
 * strict mode. `:visible` picks whichever surface this viewport actually
 * shows, which is what a test at this level means either way. */
const counts = (page: import('@playwright/test').Page) =>
  page.locator('[class*="counts"]:visible')

test.describe('setgame', () => {
  test('clicking three cards claims a set; a non-set is refused without a round trip', async ({
    browser,
  }) => {
    const club = await createSoloClub('sg')
    const [alice] = club.members
    const { id, gametype } = await createSetgameGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)

    await boardReady(page, cards(page).first())
    await expect(cards(page)).toHaveCount(12)
    await expect(counts(page)).toContainText('Found: 0')

    const board = await boardOf(alice, id)

    // ── A non-set: refused by the FE, so nothing reaches the server ──
    const bad = findNonSetOn(board)
    for (const card of bad) await cards(page).nth(board.indexOf(card)).click()
    await expect(page.getByText('Not a set')).toBeVisible()
    await expect(counts(page)).toContainText('Found: 0')

    // ── A real set ──
    const good = findSetOn(board)!
    for (const card of good) await cards(page).nth(board.indexOf(card)).click()

    await expect(counts(page)).toContainText('Found: 1', { timeout: 10000 })
    // The claimed cards leave; their slots refill from the deck one a second,
    // so the board is briefly short before settling back at twelve.
    await expect(cards(page)).toHaveCount(12, { timeout: 10000 })
    await expect(counts(page)).toContainText('Deck remaining:')
    await expect(page.getByText(/Last set:/)).toBeVisible()
  })

  test('typing a card letter selects it, and Backspace clears the selection', async ({
    browser,
  }) => {
    const club = await createSoloClub('sgk')
    const [alice] = club.members
    const { id, gametype } = await createSetgameGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${gametype}/${id}`)
    await boardReady(page, cards(page).first())

    const board = await boardOf(alice, id)
    const good = findSetOn(board)!
    const slots = good.map((c) => board.indexOf(c))

    // Two of the three, then take them back.
    await page.keyboard.press(letterForSlot(slots[0]))
    await page.keyboard.press(letterForSlot(slots[1]))
    await expect(cards(page).nth(slots[0])).toHaveClass(/selected/)
    await page.keyboard.press('Backspace')
    await expect(cards(page).nth(slots[0])).not.toHaveClass(/selected/)

    // Now all three: the third completes the claim.
    for (const slot of slots) await page.keyboard.press(letterForSlot(slot))
    await expect(counts(page)).toContainText('Found: 1', { timeout: 10000 })
  })

  test('a card claimed by someone else drops out of my selection', async ({ browser }) => {
    // THE contention case, and the reason selection is keyed by card rather
    // than by slot: the slot will be refilled with a different card, and a
    // selection that followed the slot would silently re-point at it.
    const club = await createClubWithMembers(['ann', 'bo'])
    const [ann, bo] = club.members
    const { id, gametype } = await createSetgameGame(club, 'compete')

    // BOTH players have to be connected, or presence-pause freezes the game
    // ("Waiting for everyone to connect…") and there is no board to click.
    // bo's page is otherwise a bystander — the claim itself goes through the
    // RPC, so what this measures is ann's screen reacting to it.
    const annCtx = await browser.newContext()
    await signIn(annCtx, ann.session)
    const page = await annCtx.newPage()

    const boCtx = await browser.newContext()
    await signIn(boCtx, bo.session)
    const boPage = await boCtx.newPage()

    await Promise.all([
      page.goto(`/g/${gametype}/${id}`),
      boPage.goto(`/g/${gametype}/${id}`),
    ])
    await boardReady(page, cards(page).first())
    await boardReady(boPage, cards(boPage).first())

    const board = await boardOf(ann, id)
    const stolen = findSetOn(board)!

    // ann picks one of the three cards bo is about to take.
    const selected = page.locator('button[class*="card"][class*="selected"]')
    await cards(page).nth(board.indexOf(stolen[0])).click()
    await expect(selected).toHaveCount(1)

    // bo claims the set from another session entirely.
    await claim(bo, id, stolen)

    // Once the replacements have finished arriving, NOTHING is selected on
    // ann's board. Asserting the count rather than a particular tile is the
    // point: a selection that followed the SLOT would still show one card
    // highlighted here — the new one that landed in the hole, which ann never
    // looked at and would claim with her next click.
    await expect(cards(page)).toHaveCount(12, { timeout: 15000 })
    await expect(selected).toHaveCount(0)
  })
})
