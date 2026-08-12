import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, createStrandsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * strands (PaulPath) play loop, end to end against a real archive puzzle.
 *
 * The three things worth a browser rather than a pgTAP test — everything else
 * about classification is already pinned server-side in
 * supabase/tests/strands/:
 *
 *   1. **the tracer**, since it's the whole input model and has no typed
 *      fallback: clicking tiles in order, re-clicking to submit, Backspace,
 *      and the fact that a found word's tiles LOCK;
 *   2. **the shield holding in a real client** — the answer must not be sitting
 *      in the page while the game is live;
 *   3. **the reveal**, which needs the FE to notice a flag written on a table
 *      it doesn't otherwise read (a bug this spec would have caught).
 *
 * Solo club so a single viewer doesn't presence-pause the game.
 */

/** Click a run of cells, then submit by pressing Enter. */
async function trace(page: Page, coords: Array<[number, number]>) {
  for (const [r, c] of coords) await page.locator(`[data-cell="${r},${c}"]`).click()
  await page.keyboard.press('Enter')
}

const cell = (page: Page, [r, c]: [number, number]) => page.locator(`[data-cell="${r},${c}"]`)

test.describe('strands play loop', () => {
  test('trace a theme word and the spangram; wrong words are logged, not lost', async ({ browser }) => {
    const club = await createSoloClub('pp1')
    const game = await createStrandsGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // The clue is the PROMPT, not the answer — on screen from the first second.
    await expect(page.getByText(`“${game.clue}”`).first()).toBeVisible()

    const theme = game.words.find((w) => !w.isSpangram)!
    const spangram = game.words.find((w) => w.isSpangram)!

    // ── An ordinary theme word ──
    await trace(page, theme.coords)
    await expect(page.getByText(`${theme.word} — theme`)).toBeVisible({ timeout: 10000 })

    // ── The spangram announces itself differently ──
    await trace(page, spangram.coords)
    await expect(page.getByText(`${spangram.word} — spangram`)).toBeVisible({ timeout: 10000 })

    // Both landed, and the progress line moved. A COUNT, never "of N" — the
    // total is part of the shielded answer.
    await expect(page.getByText('2 words')).toBeVisible()

    // ── A found word's tiles are SPENT ──
    // Re-tracing the theme word must be impossible: clicking its first tile is
    // ignored outright, so nothing is selected and nothing is submitted.
    await cell(page, theme.coords[0]).click()
    await page.keyboard.press('Enter')
    // Still two finds — the click did not start a trace, so Enter had nothing
    // to send (and certainly did not re-credit the word).
    await expect(page.getByText('2 words')).toBeVisible()

    await ctx.close()
  })

  test('a too-short trace is rejected and Backspace undoes one tile', async ({ browser }) => {
    const club = await createSoloClub('pp2')
    const game = await createStrandsGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // Three tiles along the top row: the echo tracks the trace as it grows.
    await cell(page, [0, 0]).click()
    await cell(page, [0, 1]).click()
    await cell(page, [0, 2]).click()
    const echo = page.locator('[class*="echo"]').first()
    await expect(echo).toHaveText(/^.{3}$/)

    // Backspace drops the LAST tile only — a misclick costs one key, not the word.
    await page.keyboard.press('Backspace')
    await expect(echo).toHaveText(/^.{2}$/)

    // Two letters is under min_word_length (4) and isn't a theme path.
    await page.keyboard.press('Enter')
    // SCOPED to the pill, because the very next assertion proves this same
    // phrase also lands in the turn log: an unscoped getByText matches both and
    // dies of strict mode the moment the log row wins the race to render. It
    // used to pass only because the pill (local, instant) normally beat the log
    // row (server round-trip) to the first poll — a coin flip that came up tails
    // on run 9 of 9, 2026-08-12.
    const pill = page.locator('[class*="pill"]').filter({ hasText: /— too short/ })
    await expect(pill).toBeVisible({ timeout: 10000 })

    // Rejects are LOGGED, deliberately: the log is the record of what was tried.
    await expect(page.locator('table').getByText(/too short/)).toBeVisible()

    await ctx.close()
  })

  test('the solution never reaches the client until the reveal', async ({ browser }) => {
    const club = await createSoloClub('pp3')
    const game = await createStrandsGame(club)
    const unfound = game.words.filter((w) => !w.isSpangram)[1]!

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()

    // Watch what the SERVER actually sends. Asserting on rendered text would
    // prove nothing here — the board draws PATHS and never prints a word, so a
    // fully leaked solution looks identical in the DOM. (Learned by planting
    // exactly that leak and watching a body-text assertion sail through it.)
    const solutionsSeen: unknown[] = []
    page.on('response', (res) => {
      if (!res.url().includes('games_state')) return
      void res
        .json()
        .then((body) => {
          for (const row of Array.isArray(body) ? body : [body]) {
            if (row && typeof row === 'object' && 'solution' in row) {
              solutionsSeen.push((row as { solution: unknown }).solution)
            }
          }
        })
        .catch(() => {})
    })

    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(`“${game.clue}”`).first()).toBeVisible()

    // THE SHIELD: every games_state row delivered so far carried a null
    // solution. The column grant is pinned server-side by rls_test; this is the
    // client-side half, and it catches a `_solution_for` that stopped honouring
    // the reveal flag — which no SQL-shape test would notice.
    expect(solutionsSeen.length).toBeGreaterThan(0)
    expect(solutionsSeen.every((s) => s === null)).toBe(true)

    // And nothing on the board is wearing the missed-word styling yet.
    await expect(page.locator('[class*="tileMissed"]')).toHaveCount(0)

    // End the game — a manual stop is neutral and does NOT reveal, since
    // strands registers hides_solution.
    await page.getByRole('button', { name: /end game/i }).first().click()
    const confirmEnd = page.getByRole('button', { name: /^End game$/ }).last()
    if (await confirmEnd.isVisible().catch(() => false)) await confirmEnd.click()
    await expect(page.getByText(/Game ended/)).toBeVisible({ timeout: 10000 })
    expect(solutionsSeen.every((s) => s === null)).toBe(true)

    // Now ask for it.
    await page.getByRole('button', { name: /reveal/i }).first().click()

    // The missed words draw on the board — greyed, and only now. This is the
    // case that needs a browser at all: reveal_solution writes to common.games,
    // which the strands hook sees only because it subscribes there too.
    await expect(cell(page, unfound.coords[0])).toHaveClass(/tileMissed/, { timeout: 10000 })

    await ctx.close()
  })
})

/**
 * The hint economy's ONE interactive question: "how much further?".
 *
 * The bar shows progress but never names the count still to go, so an early
 * click on the Hint button is a fair question — which is why the button stays
 * clickable before the bar fills and the click answers in the feedback pill,
 * rather than being a dead control that refuses to say anything.
 */
test.describe('strands hint economy', () => {
  test('clicking Hint before it is earned says how many words are left', async ({ browser }) => {
    const club = await createSoloClub('pphint')
    const game = await createStrandsGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

    // The fixture sets hint_cost = 3 and nothing has been found, so the answer
    // is the whole cost. The count is literally words: the ledger adds exactly
    // one point per valid non-theme word.
    const hint = page.getByRole('button', { name: /hint/i })
    await expect(hint).toBeEnabled()
    await hint.click()
    await expect(page.getByText('3 more words needed for a hint')).toBeVisible()

    await ctx.close()
  })
})
