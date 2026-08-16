import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createSoloClub, createStrandsGame, createWordleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * **A game you SOLVED starts with its answer on screen.**
 *
 * Six games have a clear win — you can only finish them by producing the answer
 * (strands, psychicnum, stackdown, waffle, connections, wordle) — so asking the
 * solver to press Reveal is asking them to uncover what they're looking at. The
 * control goes inert and says "Solution already shown" instead.
 *
 * wordle stands in for the family: it's the one whose answer is a single word a
 * test can type, and whose reveal adds a visible artifact (the click-to-define
 * answer line) rather than being a no-op.
 *
 * The predicate is "did I SOLVE it", never "was the game won" — the two come
 * apart in compete, and the unit suites pin that half per game. Here we prove the
 * solved half end to end, through a real win rather than a fixture flag.
 */
test('wordle: solving shows the answer unasked, and the control says so', async ({ browser }) => {
  const club = await createSoloClub('slv')
  const game = await createWordleGame(club)

  // The target is grant-hidden from players, so read it the way the pgTAP suites
  // do — as the superuser — and type it in as the winning guess.
  const target = execFileSync(
    'psql',
    [
      // -X: skip ~/.psqlrc, which prints its settings and would otherwise be
      // parsed as part of the answer.
      '-X',
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-tAc',
      `select target from wordle.games where id = '${game.id}'`,
    ],
    { encoding: 'utf8' },
  ).trim()
  expect(target).toMatch(/^[a-z]{5}$/)

  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.getByRole('grid', { name: /board/i })).toBeVisible({ timeout: 20000 })

  // Before the win: nothing revealed, and no reveal control at all (mid-game).
  await expect(page.getByRole('button', { name: /^(Reveal|Hide|Solution) /i })).toHaveCount(0)

  await page.keyboard.type(target)
  await page.keyboard.press('Enter')

  // The win lands…
  await expect(page.getByText('Solved it!')).toBeVisible({ timeout: 10000 })
  // …and the answer line is already up, un-asked-for: the word appears BOTH on
  // the board row and in the info column's definable line.
  await expect(page.getByText(target.toUpperCase(), { exact: true })).not.toHaveCount(0)
  await expect(page.getByText(/The answer was/)).toBeVisible()

  // The control has nothing to do, and says which: inert, not hidden, so the
  // row keeps its shape against a game that ended some other way.
  const reveal = page.getByRole('button', { name: 'Solution already shown' })
  await expect(reveal).toBeVisible()
  await expect(reveal).toBeDisabled()

  // …wearing the plain VIEW eye, not EyeOff. Both readings are technically true
  // (you can't hide what the win put there, and you can't show what's already
  // shown), but this player never pressed Reveal, so there is no "on" state for
  // a struck-through eye to be the "off" of — it reads as a state they don't
  // recognise.
  //
  // The discriminator is the PUPIL: lucide's View draws `<circle cx=12 cy=12
  // r=1>` inside its box, and EyeOff — struck through — has no circle at all,
  // being paths end to end. (An earlier version of this checked for `<line>`,
  // which neither glyph has; it passed against a deliberately broken build,
  // which is how it got caught.)
  const glyph = await reveal.locator('svg').innerHTML()
  expect(glyph).toContain('<circle')

  await ctx.close()
})

/**
 * The COOP half, on the game where it can only be checked in a browser.
 *
 * `solvedByMe` asks the GAME in coop rather than the caller's own row, and
 * strands is one of the three where that is the only thing that works: its coop
 * branch ends the game directly and never writes `strands.players.solved`, so a
 * per-player predicate reads false for the very players who just solved it.
 * (stackdown and psychicnum have their own versions of that, covered by unit
 * tests; strands has no PlayArea suite, so it gets a real win instead.)
 */
test('strands: a coop win names the words unasked', async ({ browser }) => {
  const club = await createSoloClub('slvst')
  const game = await createStrandsGame(club)
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

  // Nothing named yet.
  await expect(page.getByText('Words:')).toHaveCount(0)

  // Trace every hidden word — the theme words and the spangram tile the board
  // exactly, so finding them all IS the win.
  for (const w of game.words) {
    for (const [r, c] of w.coords) await page.locator(`[data-cell="${r},${c}"]`).click()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(120)
  }

  await expect(page.getByText('Won: every word found').first()).toBeVisible({ timeout: 10000 })

  // The words are named without anyone asking — the payoff the reveal adds
  // over a consumed board, since a board draws paths and never spellings.
  await expect(page.getByText('Words:')).toBeVisible({ timeout: 8000 })
  // `.first()`: the spangram appears in the Words line AND in the turn log,
  // which is itself a small proof the line isn't just echoing the log.
  const spangram = game.words.find((w) => w.isSpangram)!
  await expect(
    page.locator('p', { hasText: 'Words:' }).getByText(spangram.word.toUpperCase()),
  ).toBeVisible()

  const reveal = page.getByRole('button', { name: 'Solution already shown' })
  await expect(reveal).toBeVisible()
  await expect(reveal).toBeDisabled()

  await ctx.close()
})
