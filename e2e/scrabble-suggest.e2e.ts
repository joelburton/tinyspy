import { test, expect } from '@playwright/test'
import { createClubWithMembers, createScrabbleGame, setScrabbleRack } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Coop "suggest a move" (docs/scrabble-ai.md S5): the FULL loop against the
 * real scrabble-suggest-move edge function — the local edge runtime (part of
 * `supabase start`) serves it with the generated wordlist (run
 * `npm run scrabble:wordlist` after a fresh clone or the function 500s).
 *
 * Two invariants only a real browser can check ride along (the
 * codenamesduet.e2e.ts layout-guard exception):
 *   - the suggest box is a RESERVED height — results arriving must not
 *     change it (no-reflow), and all five rows must actually fit inside it;
 *   - clicking a row stages the move: the Submit preview shows exactly the
 *     score the row advertised. The suggester's score and evaluatePlay's
 *     agree by construction (rankMoves scores THROUGH evaluatePlay); this
 *     pins the FE glue that carries one to the other.
 */
test.describe('scrabble — suggest a move (coop)', () => {
  test('suggest fills the reserved box; a click stages the move at its advertised score', async ({ browser }) => {
    // Clubs need ≥2 members; seat only alice so the game runs solo (nobody
    // else to presence-wait for — one page keeps the test lean).
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice] = club.members
    const game = await createScrabbleGame(club, 'coop', [alice.userId])
    // A friendly rack: CATSERO on an empty board yields well over five moves.
    setScrabbleRack(game.id, ['C', 'A', 'T', 'S', 'E', 'R', 'O'])

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The rack renders once the game is live (solo coop — nobody to wait for).
    await expect(page.locator('[data-zone="rack"] [data-rack-tile]')).toHaveCount(7, { timeout: 20_000 })

    const box = page.locator('[data-zone="suggest"]')
    await expect(box).toBeVisible()
    const before = (await box.boundingBox())!

    await page.getByRole('button', { name: 'Suggest' }).click()
    const rows = box.locator('button[title="Stage these tiles on the board"]')
    await expect(rows, 'the top-5 list arrives from the edge function').toHaveCount(5, {
      timeout: 20_000,
    })

    // Reserved height: identical before/after, and the last row fits inside it.
    const after = (await box.boundingBox())!
    expect(Math.abs(after.height - before.height), 'box height must not change').toBeLessThanOrEqual(1)
    const lastRow = (await rows.nth(4).boundingBox())!
    expect(lastRow.y + lastRow.height, 'row 5 fits inside the reserved box').toBeLessThanOrEqual(
      after.y + after.height + 1,
    )

    // Apply the top suggestion → its tiles stage on the board, and the Submit
    // score preview advertises exactly what the row did.
    const advertised = (await rows.nth(0).innerText()).match(/\+(\d+)/)![1]
    await rows.nth(0).click()
    await expect(page.getByRole('button', { name: 'Submit' })).toContainText(`+${advertised}`)

    // Commit it. The played move bumps the board version past the open list —
    // which must QUIETLY clear, never surface the staleness message (a real
    // regression: "Board changed — ask again." after playing the suggestion).
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText(`+${advertised}`).first()).toBeVisible() // the own-move pill
    await expect(rows).toHaveCount(0)
    await expect(page.getByText('Board changed — ask again.')).toHaveCount(0)

    await ctx.close()
  })
})
