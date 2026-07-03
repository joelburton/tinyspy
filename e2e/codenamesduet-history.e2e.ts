import { test, expect, type Page } from '@playwright/test'
import { createClubWithMembers, createCodenamesduetGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Turn-history viewer for codenamesduet — the feature added on the monolithic
 * PlayArea ahead of the BoardCol/InfoCol decomposition (docs/playarea-decomposition-plan.md).
 *
 * Clicking a turn-log row replays that turn's board: the reveal state after that
 * turn's guesses, the whole board wearing the yellow history frame, the turn's own
 * cells ringed, and a description banner overlaying the below-board slot. These are
 * real layout/overlay properties jsdom can't see (`getBoundingClientRect` is all
 * zeros there) — so, like the sibling `codenamesduet.e2e.ts` layout guard, this is a
 * deliberate browser-only check. It also pins the load-bearing invariant the whole
 * decomposition rides on: **the board must not reflow when the viewer opens** (the
 * banner overlays a fixed-height slot; it doesn't grow it).
 *
 * Two players connect so the game doesn't presence-pause (which unmounts the board).
 */

const boardHeight = async (page: Page): Promise<number> => {
  const box = await page.locator('[data-board]').boundingBox()
  if (!box) throw new Error('board has no bounding box (paused / not visible?)')
  return box.height
}

test.describe('codenamesduet turn-history viewer', () => {
  test('clicking a turn replays it (frame + ringed cells + banner), no board reflow', async ({
    browser,
  }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createCodenamesduetGame(club, alice.userId) // alice = seat A (giver)
    const url = `/g/${game.gametype}/${game.id}`

    const ctxAlice = await browser.newContext()
    const ctxBob = await browser.newContext()
    await signIn(ctxAlice, alice.session)
    await signIn(ctxBob, bob.session)
    const pageAlice = await ctxAlice.newPage()
    const pageBob = await ctxBob.newPage()
    await pageBob.goto(url)
    await pageAlice.goto(url)
    await expect(pageAlice.locator('[data-board]')).toBeVisible({ timeout: 20000 })
    await expect(pageBob.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // ── Play one turn: alice clues "1 BREAD", bob makes a guess (any enabled tile).
    // Whatever the random key makes it (agent / neutral / assassin), turn #1 now
    // carries a guess in the log — enough to view.
    await pageAlice.locator('input[data-game-input]').first().fill('1')
    await pageAlice.locator('input[data-game-input]').nth(1).fill('BREAD')
    await pageAlice.getByRole('button', { name: /submit/i }).click()

    // Bob reaches guess phase, then guesses. Wait for the guess to actually land
    // (the log's live turn stops reading "(clue given)" once a guess row exists) —
    // otherwise we'd open the viewer before realtime delivered it and the snapshot
    // would show the turn with no reveal / no ringed cell.
    await expect(pageBob.getByRole('button', { name: /pass/i })).toBeVisible({ timeout: 15000 })
    await expect(pageBob.getByText('(clue given)')).toBeVisible({ timeout: 15000 })
    await pageBob.locator('[data-board] button:not([disabled])').first().click()
    await expect(pageBob.getByText('(clue given)')).toBeHidden({ timeout: 15000 })

    // The turn log now shows turn #1 with the clue word + the guess. Measure the
    // board BEFORE opening the viewer (this is the height that must not change).
    const handle = pageBob.locator('[data-turn-number]')
    await expect(handle).toBeVisible({ timeout: 15000 })
    const liveHeight = await boardHeight(pageBob)

    // ── Open the viewer: click the turn's "#N" handle (a <span>, not the row). The
    // description banner appears over the below-board slot (its "Click to exit"
    // title is a stable handle).
    await handle.click()
    const banner = pageBob.locator('[title="Click to exit"]')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner).toContainText('BREAD') // "#1: 1 BREAD → …"

    // The board must NOT have reflowed — the banner overlays the fixed slot.
    const viewingHeight = await boardHeight(pageBob)
    expect(Math.abs(viewingHeight - liveHeight)).toBeLessThan(1)

    // Visual capture — the full page, so the yellow board frame (an outline OUTSIDE
    // the board box), the ringed just-guessed cell, the banner, and the highlighted
    // log row all show.
    await pageBob.screenshot({
      path: '/private/tmp/claude-501/-Users-joel-src-codenames/ed6e8ac1-4791-48ee-b2cd-8a67974e2f37/scratchpad/duet-history-viewing.png',
      fullPage: true,
    })

    // ── Exit path A — a keystroke returns to live. Space specifically: the handle is
    // a <span> (not a focusable button), so Space isn't captured as a re-click and
    // falls through to the exit-on-key handler.
    await pageBob.keyboard.press('Space')
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Exit path B — clicking the BOARD returns to live. The framed board is
    // click-through (`.frame` → pointer-events: none), so the click falls to the
    // document listener. This is the shared mechanism every history game now uses.
    await handle.click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await pageBob.locator('[data-board]').click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    // ── Exit path C — a click ANYWHERE ELSE (outside the board) returns to live:
    // the "Clues" log heading (not the board, not a #N handle).
    await handle.click()
    await expect(banner).toBeVisible({ timeout: 10000 })
    await pageBob.getByRole('heading', { name: 'Clues' }).click()
    await expect(banner).toBeHidden({ timeout: 10000 })

    const afterExitHeight = await boardHeight(pageBob)
    expect(Math.abs(afterExitHeight - liveHeight)).toBeLessThan(1)

    await ctxAlice.close()
    await ctxBob.close()
  })
})
