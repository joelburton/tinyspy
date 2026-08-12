import { test, expect } from '@playwright/test'
import { createSoloClub, createLetterboxedGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

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
    await boardReady(page, page.locator('svg text').first(), 15000)
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

    // The accepted-word pill restates the cap — there is no status bar to
    // carry it (docs/mobile.md). It's TIMED: it occupies the entry's slot for
    // ~1.4s and then hands the entry back on its own, so this assertion runs
    // right after Enter (the pill appears on the RPC's return, not on the
    // realtime refetch — asserting it later would race the auto-clear).
    await expect(page.getByText('ADG — 4 words left')).toBeVisible({ timeout: 10000 })

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
    await boardReady(page, page.locator('svg text').first(), 15000)

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
    await boardReady(page, page.locator('svg text').first(), 15000)

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
    await boardReady(page, page.locator('svg text').first(), 15000)

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
    await boardReady(page, page.locator('svg text').first(), 15000)

    await page.keyboard.type('adg')
    await page.keyboard.press('Enter')
    // Wait for the chain to land, not a clock: the next word is seeded with
    // ADG's last letter, so typing before the refetch spells something else.
    // (The timed accepted-word pill clears itself; the entry-value wait
    // already outlasts it.)
    await expect(page.getByTestId('entry-value')).toHaveText('G', { timeout: 10000 })
    await page.keyboard.type('jb')
    await page.keyboard.press('Enter')

    // Two words spent, board not covered: the only move left is taking one
    // back, so the entry gives way rather than collecting a word it must
    // then refuse. (No accepted-word pill here — the cap-filling word's
    // words-left is zero, and the chain-full pill outranks it anyway.)
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
    await boardReady(page, page.locator('svg text').first(), 15000)

    // HINT describes the word without giving it: the fixture's two-word
    // solution opens with ADGJBEHK — 8 letters, so three of them (four only
    // past eight).
    await page.getByRole('button', { name: /^hint$/i }).click()
    await expect(page.getByText('8 letters starting with ADG')).toBeVisible({ timeout: 10000 })

    // SPOILER hands it over.
    await page.getByRole('button', { name: /show the word/i }).click()
    await expect(page.getByText('ADGJBEHK', { exact: true })).toBeVisible({ timeout: 10000 })

    // The turn log is the lasting record of both — the CONTENT, not just the
    // fact of the ask (the pills above are transient); there is no counter.
    await expect(page.getByText('Hint: 8 letters: ADG')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Reveal: ADGJBEHK')).toBeVisible({ timeout: 10000 })

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
    await boardReady(page, page.locator('svg text').first(), 15000)

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
    await boardReady(page, page.locator('svg text').first(), 15000)

    await page.keyboard.type('adg')
    await page.keyboard.press('Enter')
    // Wait for the chain to land, not a clock — see above. (The timed
    // accepted-word pill clears itself before this wait gives up.)
    await expect(page.getByTestId('entry-value')).toHaveText('G', { timeout: 10000 })
    await page.keyboard.type('jb')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listitem').filter({ hasText: /^GJB/ }).first()).toBeVisible({
      timeout: 10000,
    })

    // Open move #1 — the board goes back to the chain as it stood then.
    await page.getByText('#1', { exact: true }).click()
    await expect(page.getByText('Played ADG')).toBeVisible({ timeout: 10000 })

    // The chain STRIP rolls back with the board — they're one snapshot, and
    // framing only the board used to leave the two showing a state that never
    // existed. After move #1 the chain was ADG alone, so GJB is gone.
    await expect(page.getByRole('listitem').filter({ hasText: /^ADG/ }).first()).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: /^GJB/ })).toHaveCount(0)

    // And no × on the snapshot: you can't take a word back out of a past move.
    await expect(page.getByRole('button', { name: /Take back/i })).toHaveCount(0)

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
    await boardReady(page, page.locator('svg text').first(), 15000)

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
    // The timed accepted-word pill clears itself; then the seeded entry shows.
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
    await boardReady(page, page.locator('svg text').first(), 15000)

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

  /**
   * The GHOST path: after a word is submitted its route stays on the board in
   * grey, so everyone can see where the chain just went — in coop that's
   * whoever played it (the chain is shared and arrives by realtime), in compete
   * your own (rivals' chains are column-shielded).
   *
   * The interesting rule is WHEN it clears. It survives the next word's first
   * letter, because that letter isn't a choice — it's carried over from the
   * previous word's tail — and goes on the SECOND, the moment the player has
   * actually decided something. Asserting the middle state is the whole point;
   * "appears" and "disappears" alone would pass an implementation that cleared
   * one keystroke too early.
   *
   * Classes are matched by substring since CSS-module names are hashed.
   */
  test('a submitted word leaves a grey ghost until the next word commits', async ({ browser }) => {
    const club = await createSoloClub('lbghost')
    const game = await createLetterboxedGame(club)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await boardReady(page, page.locator('svg text').first(), 15000)

    const ghost = page.locator('svg polyline[class*="ghostPath"]')
    const live = page.locator('svg polyline[class*="path"]:not([class*="ghostPath"])')

    // Nothing played, nothing typed: no lines at all.
    await expect(ghost).toHaveCount(0)

    await page.keyboard.type('adg')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listitem').filter({ hasText: /^ADG/ }).first())
      .toBeVisible({ timeout: 10000 })

    // The word is played: its route is on the board, in grey.
    await expect(ghost).toHaveCount(1)
    const points = await ghost.getAttribute('points')
    expect(points!.split(' '), 'the ghost traces all three letters').toHaveLength(3)

    // The carried first letter is not a decision — the ghost stays.
    await page.keyboard.type('g')
    await expect(ghost, 'the ghost survives the carried first letter').toHaveCount(1)

    // The second letter is. Now it goes, and only the live green path remains.
    await page.keyboard.type('a')
    await expect(ghost, 'the ghost clears once the player commits').toHaveCount(0)
    await expect(live).toHaveCount(1)

    await ctx.close()
  })

  /**
   * Tapping the feedback message dismisses it (docs/ui.md → Feedback pill).
   *
   * Found on an iPhone: rejecting a word leaves "Not a word" in the entry's
   * slot, and the only way to clear it was to start typing the next one — which
   * on touch means tapping a letter, since there is no keyboard. The message
   * itself was the most conspicuous thing on screen and the one thing that
   * ignored you. The app's rule was already "your next action clears it"; a tap
   * on the message is an action.
   *
   * Phone-sized on purpose: this is the surface where the gesture is the only
   * convenient one.
   */
  test('tapping the feedback pill dismisses it', async ({ browser }) => {
    const club = await createSoloClub('lbtap')
    const game = await createLetterboxedGame(club)
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await boardReady(page, page.locator('svg text').first(), 15000)

    // Reject a word: three board letters that don't spell anything.
    await page.keyboard.type('adl')
    await page.keyboard.press('Enter')
    const pill = page.getByText(/not a word/i).first()
    await expect(pill).toBeVisible({ timeout: 10000 })

    // Tap the message itself — the gesture that used to do nothing.
    await pill.tap()
    await expect(pill, 'the pill clears on a tap').toBeHidden({ timeout: 5000 })

    await ctx.close()
  })
})

/**
 * Custom board (setup) + the `Board` recap row — the round trip that is the
 * whole point of the feature: you play a board you like and hand it to a
 * friend. Drives the real setup dialog through the real
 * `letterboxed-build-board` edge function (custom branch: no sampling, no
 * re-rolling, no quality gates), which is the ONLY coverage that branch has —
 * the Deno tests reach `board.ts` but never the seed lookup.
 *
 * THE BOARD IS SELF-SOURCED rather than hardcoded, and that is the test's real
 * subject. A custom board only works if its twelve letters are in
 * `letterboxed.seeds`, and the design's load-bearing claim is that a board this
 * game BUILT always is — the builder drew those twelve from a seed row, and
 * partitioning only reorders them. So the spec rolls a board, reads it off the
 * screen, and types it back: if that claim is ever false, this goes red without
 * anyone having to guess which letter sets to hardcode.
 *
 * Two clubs, because `is_current_view` allows one live game per club.
 */
test.describe('letterboxed custom board', () => {
  /** The board, read off the twelve SVG letters. They render in `sides` order
   *  (`layout()` emits side groups 0..3 in turn), which is also the order the
   *  setup field takes — clockwise from the top-left.
   *
   *  `allTextContents`, NOT `allInnerTexts`: these are SVG `<text>` nodes, and
   *  innerText is an HTML-rendering concept — it comes back empty here, which
   *  reads exactly like a board that failed to load. */
  const readBoard = async (page: import('@playwright/test').Page) =>
    (await page.locator('svg text').allTextContents()).join('')

  test('a rolled board can be typed back, and the recap reads it in the same form', async ({
    browser,
  }) => {
    // Two clubs and two contexts: createSoloClub mints its OWN member each
    // time, so the second club's page is a 404 to the first club's player.
    // That separation is the point — this is one person handing a board to
    // another, not one person replaying their own game.
    const rollClub = await createSoloClub('lbcb1')
    const typeClub = await createSoloClub('lbcb2')

    // ── Roll a real board through the edge function's RANDOM path ──
    const rollCtx = await browser.newContext()
    await signIn(rollCtx, rollClub.members[0].session)
    const rollPage = await rollCtx.newPage()
    await rollPage.goto(`/c/${rollClub.handle}`)
    await rollPage.getByRole('button', { name: /SnakeBox/ }).first().click()
    await rollPage.getByRole('button', { name: /^Start SnakeBox/ }).click()
    await boardReady(rollPage, rollPage.locator('svg text').first(), 20000)
    await expect(rollPage.locator('svg text')).toHaveCount(12)
    const rolled = await readBoard(rollPage)
    expect(rolled).toMatch(/^[A-Z]{12}$/)
    await rollCtx.close()

    // ── The friend types it in, through the CUSTOM path ──
    const typeCtx = await browser.newContext()
    await signIn(typeCtx, typeClub.members[0].session)
    const page = await typeCtx.newPage()
    await page.goto(`/c/${typeClub.handle}`)
    await page.getByRole('button', { name: /SnakeBox/ }).first().click()
    await page.getByText('Board (optional)').click()
    // Typed WITH separators, the way the app writes it everywhere — the field
    // keeps them and `cleanSides` strips them, which is the behaviour here.
    const written = rolled.match(/.{3}/g)!.join('-')
    const field = page.getByRole('textbox', { name: 'Custom board' })
    await field.fill(written)
    // The separators STAY on screen: you typed a board, so you should see one.
    await expect(field).toHaveValue(written)

    await page.getByRole('button', { name: /^Start SnakeBox/ }).click()

    // The board IS the one typed — same letters, same sides, same positions.
    await boardReady(page, page.locator('svg text').first(), 20000)
    await expect(page.locator('svg text')).toHaveCount(12)
    expect(await readBoard(page)).toBe(rolled)

    // And the recap prints it in the form the dialog takes back — the round
    // trip a friend actually uses.
    await page.getByText('Setup options').click()
    await expect(page.getByText(`Board: ${written}`)).toBeVisible()

    await typeCtx.close()
  })

  /**
   * The rejection a player can actually reach. Twelve distinct letters with no
   * vowels pass the dialog's own shape check (that is all it can judge), so the
   * seed lookup is what refuses them — which is exactly the split the feature
   * is built on: the FE validates shape, the server owns solvability.
   */
  test('a board with no known solution is refused, and the dialog says so', async ({
    browser,
  }) => {
    const club = await createSoloClub('lbcb3')
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/c/${club.handle}`)

    await page.getByRole('button', { name: /SnakeBox/ }).first().click()
    await page.getByText('Board (optional)').click()
    await page.getByRole('textbox', { name: 'Custom board' }).fill('BFG-JKP-QVW-XYZ')
    await page.getByRole('button', { name: /^Start SnakeBox/ }).click()

    // The server's key, rendered by errorCopy — not a raw message, and not a
    // fault: this is a real answer to a real request.
    await expect(page.getByText(/No known solution for the letters/i))
      .toBeVisible({ timeout: 20000 })

    await ctx.close()
  })
})
