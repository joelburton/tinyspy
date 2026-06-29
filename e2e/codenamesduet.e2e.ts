import { test, expect, type Page } from '@playwright/test'
import { createClubWithMembers, createCodenamesduetGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Layout-stability guard for codenamesduet's below-board clue slot.
 *
 * The below-board area cycles through several shapes — the clue form, the clue
 * display + Pass, "waiting for X…", the own-action error flash. The slot is a
 * FIXED height precisely so the `flex: 1` board above never reflows as those
 * swap. We also check that opening the AI "Clue Hint" dialog (a floating panel)
 * doesn't move the board. That invariant is a real layout property: it can't be
 * checked in Vitest/jsdom (no layout engine — `getBoundingClientRect` is all
 * zeros), so it needs a real browser. This is a deliberate, narrow exception to
 * the "e2e = realtime/presence only" charter in playwright.config.ts: the
 * regression class (board jumps as the slot's content changes) is exactly what
 * unit tests can't see.
 *
 * codenamesduet is the subject because it has by far the richest below-board
 * area. Two players must be present or the game presence-pauses (unmounting the
 * board), so both connect; we measure each player's board across their states
 * and assert it never changes height.
 */

/** The rendered height of the board — the element that must hold steady as the
 *  below-board clue UI swaps states. */
async function boardHeight(page: Page): Promise<number> {
  const box = await page.locator('[data-board]').boundingBox()
  if (!box) throw new Error('board has no bounding box (not visible / paused?)')
  return box.height
}

test.describe('codenamesduet below-board layout stability', () => {
  test('the board height stays constant across every below-board clue state', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    // alice opens (seat A → first clue-giver); bob is the guesser (seat B).
    const game = await createCodenamesduetGame(club, alice.userId)
    const url = `/g/${game.gametype}/${game.id}`

    // Both players present, or the game presence-pauses and the PlayArea
    // unmounts (no board to measure).
    const ctxAlice = await browser.newContext()
    const ctxBob = await browser.newContext()
    await signIn(ctxAlice, alice.session)
    await signIn(ctxBob, bob.session)
    const pageAlice = await ctxAlice.newPage()
    const pageBob = await ctxBob.newPage()
    await pageBob.goto(url)
    await pageAlice.goto(url)

    // Boards render once both are present (un-paused).
    await expect(pageAlice.locator('[data-board]')).toBeVisible({ timeout: 20000 })
    await expect(pageBob.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // ── Alice (clue-giver), clue phase → the clue FORM below the board.
    const countInput = pageAlice.locator('input[data-game-input]').first()
    const wordInput = pageAlice.locator('input[data-game-input]').nth(1)
    await expect(countInput).toBeVisible()
    const aForm = await boardHeight(pageAlice)

    // ── Bob (guesser), clue phase → a "waiting for a clue" line.
    await expect(pageBob.getByText(/waiting for/i).first()).toBeVisible({ timeout: 15000 })
    const bWait = await boardHeight(pageBob)

    // ── Alice clicks Clue Hint and the edge function errors (route-mocked to a
    //    non-2xx). The suggestion opens its own floating dialog (which surfaces
    //    the API error), NOT a slot swap — so the form stays put and the board
    //    must not move.
    await pageAlice.route('**/functions/v1/codenamesduet-suggest-clue', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"error":"boom"}',
      }),
    )
    await pageAlice.getByRole('button', { name: /clue hint/i }).click()
    // The dialog pops up (its own panel) — the form is still there underneath.
    await expect(pageAlice.getByText('Clue suggestion')).toBeVisible({ timeout: 10000 })

    // …and it must render fully ON-SCREEN. Regression guard: it once mounted at
    // y≈898 (below the viewport) because react-rnd positions from the static
    // flow position and the panel sat deep in the flex-column board; it now
    // mounts at the .layout level. Assert the whole panel is inside the viewport.
    const viewport = pageAlice.viewportSize()!
    const panel = await pageAlice
      .locator('.react-draggable, [class*="rnd"]')
      .first()
      .boundingBox()
    expect(panel).not.toBeNull()
    expect(panel!.x).toBeGreaterThanOrEqual(0)
    expect(panel!.y).toBeGreaterThanOrEqual(0)
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width)
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height)

    await expect(countInput).toBeVisible()
    const aError = await boardHeight(pageAlice)
    // Dismiss the dialog so it can't overlap the form for the submit below.
    await pageAlice.getByRole('button', { name: 'Close' }).click()
    await expect(pageAlice.getByText('Clue suggestion')).toBeHidden()

    // ── Alice submits a clue → guess phase. She now sees the clue + "waiting for
    //    bob to guess".
    await countInput.fill('1')
    await wordInput.fill('BREAD')
    await pageAlice.getByRole('button', { name: /submit/i }).click()
    await expect(pageAlice.getByText(/waiting for/i).first()).toBeVisible({ timeout: 15000 })
    const aGuess = await boardHeight(pageAlice)

    // ── Bob (guesser), guess phase → the clue display + a Pass button.
    await expect(pageBob.getByRole('button', { name: /pass/i })).toBeVisible({ timeout: 15000 })
    const bGuess = await boardHeight(pageBob)

    // Each player's board height is identical across all of their below-board
    // states (sub-pixel tolerance covers rounding). If the slot ever grew, the
    // flex:1 board would shrink and these would differ.
    expect(Math.abs(aError - aForm)).toBeLessThan(1)
    expect(Math.abs(aGuess - aForm)).toBeLessThan(1)
    expect(Math.abs(bGuess - bWait)).toBeLessThan(1)

    await ctxAlice.close()
    await ctxBob.close()
  })
})
