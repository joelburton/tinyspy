import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createSoloClub, createWordleGame } from './helpers/fixtures'
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

  await ctx.close()
})
