import { test, expect } from '@playwright/test'
import { createSoloClub, createLetterboxedGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Smoke test for letterboxed (SnakeBox), covering the two input paths the game
 * offers and the realtime path a move takes to the board.
 *
 * The board is the synthetic `abcdefghijkl` (sides `abc | def | ghi | jkl`), so
 * ADG is legal — a→d→g crosses a side boundary at every step — and the next
 * word must then start with G.
 *
 * Solo club so it doesn't presence-pause with one viewer.
 */
test.describe('letterboxed', () => {
  test('typing a word plays it, and the next word is seeded with the tail letter', async ({
    browser,
  }) => {
    const club = await createSoloClub('lbx')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The board renders all twelve letters.
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('svg text')).toHaveCount(12)

    // Nothing covered yet.
    await expect(page.getByText('No words yet')).toBeVisible()

    await page.keyboard.type('adg')
    await page.keyboard.press('Enter')

    // THE REALTIME PATH: the chain list is driven by the players postgres-changes
    // event, so the word appearing there without a reload can only come through
    // the live channel.
    await expect(page.getByRole('listitem').filter({ hasText: /^ADG/ }).first())
      .toBeVisible({ timeout: 10000 })

    // …and the entry re-seeds ITSELF with the letter the next word must start
    // with — so the box now holds "g", not a placeholder telling you to type
    // one. The seed is derived from the chain rather than typed, which is what
    // lets Backspace stop at it instead of clearing it.
    await expect(page.getByTestId('entry-value')).toHaveText('G', { timeout: 10000 })

    await ctx.close()
  })

  test('a letter that cannot follow the current one never enters the box', async ({
    browser,
  }) => {
    const club = await createSoloClub('lbx3')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })

    // Sides are `abc | def | ghi | jkl`, so B cannot follow A — they share a
    // side. The keystroke is refused rather than accepted-then-rejected.
    await page.keyboard.type('ab')
    await expect(page.getByTestId('entry-value')).toHaveText('A')

    // D is on another side, so it goes in.
    await page.keyboard.type('d')
    await expect(page.getByTestId('entry-value')).toHaveText('AD')

    await ctx.close()
  })

  test('the × on the last chain word takes it back', async ({ browser }) => {
    const club = await createSoloClub('lbx4')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })

    await page.keyboard.type('adg')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listitem').filter({ hasText: /^ADG/ })).toBeVisible({
      timeout: 10000,
    })

    // The × is the whole undo affordance — there is no Undo button.
    await page.getByRole('button', { name: /Take back ADG/i }).click()
    await expect(page.getByText('No words yet')).toBeVisible({ timeout: 10000 })

    await ctx.close()
  })

  test('the board never moves as pills and chain words come and go', async ({ browser }) => {
    // The repo's hard no-reflow rule (docs/ui.md → layout stability). The entry
    // row, an own-move pill and the terminal verdict all occupy ONE
    // reserved-height slot, and the chain strip reserves its rows up front —
    // so the board's position is fixed for the life of the game. This asserts
    // the pixel rather than the CSS, because the CSS was right-looking and
    // wrong twice.
    const club = await createSoloClub('lbx5')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })

    const boardTop = async () => {
      const svgs = page.locator('svg')
      for (let i = 0; i < (await svgs.count()); i++) {
        const el = svgs.nth(i)
        if ((await el.locator('text').count()) === 12) return (await el.boundingBox())!.y
      }
      throw new Error('board not found')
    }

    const empty = await boardTop()

    // A reject pill replaces the entry controls. ADGJ types cleanly (every
    // step crosses a side) but isn't on the board's word list. Note ADF would
    // NOT do: D and F share a side, so the F keystroke never lands.
    await page.keyboard.type('adgj')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Not a word')).toBeVisible({ timeout: 10000 })
    expect(await boardTop()).toBeCloseTo(empty, 0)

    // …the next keystroke dismisses it…
    await page.keyboard.press('Backspace')
    await expect(page.getByText('Not a word')).toBeHidden()
    expect(await boardTop()).toBeCloseTo(empty, 0)

    // …and a played word fills the chain strip.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listitem').filter({ hasText: /^ADG/ }).first())
      .toBeVisible({ timeout: 10000 })
    expect(await boardTop()).toBeCloseTo(empty, 0)

    await ctx.close()
  })

  test('a full chain hides the entry behind a pill and goes inert', async ({ browser }) => {
    // extra_words 0 → the cap is par itself, so two words fill it.
    const club = await createSoloClub('lbx6')
    const [alice] = club.members
    const game = await createLetterboxedGame(club, 'coop', undefined, 0)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })

    await page.keyboard.type('adg')
    await page.keyboard.press('Enter')
    // Wait for the chain to land, not a clock: the next word is seeded with
    // ADG's last letter, so typing before the refetch spells something else.
    await expect(page.getByTestId('entry-value')).toHaveText('G', { timeout: 10000 })
    await page.keyboard.type('jb')
    await page.keyboard.press('Enter')

    // Two words spent, board not covered: the only move left is taking one
    // back, so the entry gives way rather than collecting a word it must
    // then refuse.
    await expect(page.getByText(/Chain is full/)).toBeVisible({ timeout: 10000 })

    // Typing is inert — the entry is gone, so nothing accumulates.
    await page.keyboard.type('kcf')
    await expect(page.getByTestId('entry-value')).toHaveCount(0)

    // …but the × MUST still be there. Freezing the entry and freezing the
    // chain are different things, and conflating them once hid the only move
    // left on the board at exactly the moment it was the only move left.
    const x = page.getByRole('button', { name: /Take back GJB/i })
    await expect(x).toBeVisible()
    await x.click()
    await expect(page.getByText(/Chain is full/)).toBeHidden({ timeout: 10000 })
    await expect(page.getByTestId('entry-value')).toBeVisible()

    await ctx.close()
  })

  test('hint describes the word; spoiler hands it over; both land in the log', async ({
    browser,
  }) => {
    const club = await createSoloClub('lbx7')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })

    // HINT describes the word without giving it: the fixture's two-word
    // solution opens with ADGJBEHK — 8 letters, so three of them (four only
    // past eight).
    await page.getByRole('button', { name: /^hint$/i }).click()
    await expect(page.getByText('8 letters starting with ADG')).toBeVisible({ timeout: 10000 })

    // SPOILER hands it over.
    await page.getByRole('button', { name: /show the word/i }).click()
    await expect(page.getByText('ADGJBEHK', { exact: true })).toBeVisible({ timeout: 10000 })

    // The turn log is the record of both — there is no counter.
    await expect(page.getByText('took a hint')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/was shown/)).toBeVisible({ timeout: 10000 })

    await ctx.close()
  })

  test('the solution stays covered until Reveal is pressed', async ({ browser }) => {
    // letterboxed registers hides_solution, so ending without a win must NOT
    // put the seeded pair on screen — a replay of the same board is only a
    // genuine second try while the answer is still unknown.
    const club = await createSoloClub('lbx8')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: /end game/i }).click()
    const confirm = page.getByRole('button', { name: /^(end|yes|confirm)/i }).last()
    if (await confirm.isVisible().catch(() => false)) await confirm.click()

    await expect(page.getByText('Game over')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Solvable in two/i)).toBeHidden()

    await page.getByRole('button', { name: /reveal solution/i }).click()
    await expect(page.getByText(/Solvable in two/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('ADGJBEHK')).toBeVisible()

    await ctx.close()
  })

  test('a past move replays on the board, and a click returns to live', async ({ browser }) => {
    const club = await createSoloClub('lbx9')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })

    await page.keyboard.type('adg')
    await page.keyboard.press('Enter')
    // Wait for the chain to land, not a clock — see above.
    await expect(page.getByTestId('entry-value')).toHaveText('G', { timeout: 10000 })
    await page.keyboard.type('jb')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listitem').filter({ hasText: /^GJB/ }).first()).toBeVisible({
      timeout: 10000,
    })

    // Open move #1 — the board goes back to the chain as it stood then.
    await page.getByText('#1', { exact: true }).click()
    await expect(page.getByText('Played ADG')).toBeVisible({ timeout: 10000 })

    // The chain STRIP keeps showing the live chain: reviewing a past move must
    // not change what your next move is.
    await expect(page.getByRole('listitem').filter({ hasText: /^GJB/ }).first()).toBeVisible()

    // A click anywhere returns to live (useHistoryViewer wires this itself).
    await page.getByText('Played ADG').click()
    await expect(page.getByText('Played ADG')).toBeHidden({ timeout: 10000 })

    await ctx.close()
  })

  test('a solved chain has evenly padded pills — the × takes its space with it', async ({
    browser,
  }) => {
    // Shipped broken twice, both times because a screenshot LOOKED even. The
    // tighter right padding belongs to the ×, not to being last, so once the
    // game is over every pill must match. Asserted in PIXELS.
    const club = await createSoloClub('lbx10')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })

    const pills = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('li')]
          .filter((e) => /^[A-Z]{3,}/.test(e.textContent ?? ''))
          .map((e) => {
            const c = getComputedStyle(e)
            return { l: c.paddingLeft, r: c.paddingRight, hasX: !!e.querySelector('button') }
          }),
      )

    // Mid-game the last pill carries the ×, so ITS right padding is tight.
    await page.keyboard.type('adg')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listitem').filter({ hasText: /^ADG/ }).first()).toBeVisible({
      timeout: 10000,
    })
    const live = await pills()
    expect(live.at(-1)!.hasX).toBe(true)
    expect(live.at(-1)!.r).not.toBe(live.at(-1)!.l)

    // Solve it — the × goes, and the pills even up.
    await page.getByRole('listitem').filter({ hasText: /^ADG/ }).first().getByRole('button').click()
    await expect(page.getByText('No words yet')).toBeVisible({ timeout: 10000 })
    await page.keyboard.type('adgjbehk')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('entry-value')).toHaveText('K', { timeout: 10000 })
    await page.keyboard.type('cfil')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/All twelve/)).toBeVisible({ timeout: 10000 })

    const done = await pills()
    expect(done.some((p) => p.hasX), 'no × once the game is over').toBe(false)
    expect(new Set(done.map((p) => p.r)).size, 'every pill shares one right padding').toBe(1)
    expect(done[0].r, 'which equals the left padding').toBe(done[0].l)

    await ctx.close()
  })

  test('clicking letters builds a word; clicking the last one again submits it', async ({
    browser,
  }) => {
    const club = await createSoloClub('lbx2')
    const [alice] = club.members
    const game = await createLetterboxedGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.locator('svg text').first()).toBeVisible({ timeout: 15000 })

    const letter = (ch: string) => page.locator('svg g').filter({ hasText: new RegExp(`^${ch}$`) })

    await letter('A').click()
    await letter('D').click()
    await letter('G').click()
    // The second click on the word's LAST letter submits — unambiguous because
    // a word can never repeat a letter back-to-back (same letter = same side).
    await letter('G').click()

    await expect(page.getByRole('listitem').filter({ hasText: /^ADG/ }).first())
      .toBeVisible({ timeout: 10000 })

    await ctx.close()
  })
})
