import { test, expect } from '@playwright/test'
import {
  createSoloClub,
  createClubWithMembers,
  createStackdownGame,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The terminal solution reveal (docs/ui.md → Terminal results): **local to each
 * player, reversible, and never automatic**.
 *
 * A finished game keeps its answer covered until someone asks — a win included,
 * and here especially, since `replay_board` re-runs the very same board and an
 * answer left on screen would make Restart theater. Reveal is offered twice (the
 * terminal action row and the game menu), both wearing the same two faces, and
 * pressing Hide puts it away again.
 *
 * stackdown stands in for the family (psychicnum's tile-ring half is covered by
 * psychicnum-terminal.e2e.ts): its six words are a text region, so "is the
 * solution on screen?" is directly assertable.
 *
 * Browser-only, and more so than before: the claim is now about what TWO
 * clients draw, which no unit test can reach.
 */
test('stackdown: a lost game hides its words until Reveal — row and menu', async ({
  browser,
}) => {
  const club = await createSoloClub('trev')
  const game = await createStackdownGame(club, 'coop') // solo coop → no presence pause
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })

  const words = page.getByText(/^The words were/)
  const revealRow = page.getByRole('button', { name: /^reveal$/i })

  // Mid-game: no solution, and no reveal control in the action row (the amber
  // Spoiler button beside it is a different thing — one word, and it stays).
  await expect(words).toHaveCount(0)
  await expect(revealRow).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Spoiler' })).toBeVisible()

  // The menu item exists all along but is inert until terminal — the words
  // don't even reach this client before then (stackdown._solution_for gates on
  // is_terminal), so there is nothing it could show.
  const openMenu = () => page.getByRole('button', { name: /menu/i }).first().click()
  await openMenu()
  const revealItem = page.getByRole('menuitem', { name: 'Reveal solution' })
  await expect(revealItem).toBeVisible()
  await expect(revealItem).toBeDisabled()
  await page.keyboard.press('Escape')

  // End the game — a manual end, so NOT a clean win.
  await page.getByRole('button', { name: 'End game' }).first().click()
  await page.locator('[data-floating-panel]').getByRole('button', { name: 'End game' }).click()
  await expect(revealRow).toBeVisible({ timeout: 8000 })

  // Terminal, but the words are still covered.
  await expect(words).toHaveCount(0)

  // Asking opens them, and both controls turn into their other face rather than
  // going inert — the way back has to be as reachable as the way in.
  await revealRow.click()
  await expect(words).toBeVisible()
  const hideRow = page.getByRole('button', { name: /^hide$/i })
  await expect(hideRow).toBeVisible()
  await openMenu()
  await expect(page.getByRole('menuitem', { name: 'Hide solution' })).toBeEnabled()
  await page.keyboard.press('Escape')

  // Hide puts them away again — the info column as the game ended.
  await hideRow.click()
  await expect(words).toHaveCount(0)
  await expect(revealRow).toBeVisible()

  // Restart re-hides too. Nothing on the server remembers the reveal any more,
  // so this is the game's own onRestarted doing it — the one thing every game
  // had to be given explicitly when the shared flag went away.
  await revealRow.click()
  await expect(words).toBeVisible()
  await page.getByRole('button', { name: 'Restart' }).click()
  await expect(words).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Spoiler' })).toBeVisible() // playing again

  await ctx.close()
})

/**
 * The reveal is PERSONAL, and this is the test that says so.
 *
 * It used to be shared — one player pressed Reveal and every board opened,
 * carried on `common.games.solution_revealed` through the same realtime refetch
 * as the rest of the row — on the reasoning that a post-mortem is something the
 * friends do together. That reads generous and plays badly: a post-mortem is
 * people thinking out loud, and one impatient click ended everyone else's
 * thinking. Each player looks when they're ready now.
 *
 * Two real clients, because "my screen changed and yours didn't" is precisely
 * the claim no single-page test can make.
 */
test('stackdown: one player revealing does NOT open the words for the other', async ({
  browser,
}) => {
  const club = await createClubWithMembers(['trva', 'trvb'])
  const game = await createStackdownGame(club, 'coop')

  const ctxA = await browser.newContext()
  await signIn(ctxA, club.members[0].session)
  const a = await ctxA.newPage()
  const ctxB = await browser.newContext()
  await signIn(ctxB, club.members[1].session)
  const b = await ctxB.newPage()

  // Both present, or the game pauses on the presence gate.
  await a.goto(`/g/${game.gametype}/${game.id}`)
  await b.goto(`/g/${game.gametype}/${game.id}`)
  await expect(a.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })
  await expect(b.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })

  const wordsA = a.getByText(/^The words were/)
  const wordsB = b.getByText(/^The words were/)

  // A ends it for the table; neither sees the words yet.
  await a.getByRole('button', { name: 'End game' }).first().click()
  await a.locator('[data-floating-panel]').getByRole('button', { name: 'End game' }).click()
  await expect(a.getByRole('button', { name: /^reveal$/i })).toBeVisible({ timeout: 8000 })
  await expect(wordsA).toHaveCount(0)
  await expect(wordsB).toHaveCount(0)

  // B asks. B's screen opens…
  await b.getByRole('button', { name: /^reveal$/i }).click()
  await expect(wordsB).toBeVisible()

  // …and A's does not. Give the realtime channel a real chance to carry a
  // change that mustn't exist — a bare assertion would pass on timing alone,
  // which is how a "nothing happened" test quietly stops testing anything.
  await a.waitForTimeout(2000)
  await expect(wordsA).toHaveCount(0)
  // A's own control still offers the way in, untouched by B.
  await expect(a.getByRole('button', { name: /^reveal$/i })).toBeVisible()

  await ctxA.close()
  await ctxB.close()
})

/**
 * A player who dropped out of a compete race keeps the Reveal control in their
 * row — **present but inert**, with a tooltip that says why. Two reasons it's
 * disabled rather than absent: the row must not change shape when the last
 * racer finishes (docs/ui.md → Layout stability), and "you can't do this yet"
 * is a better answer than a control that silently vanished.
 *
 * The FE gate mirrors the shield: `stackdown._solution_for` hands the words over
 * only at `is_terminal` — ended for EVERYONE — so a conceder has nothing to
 * show even if the control were live. That is the one piece of this the server
 * still owns, and the reason it can't key on any per-player doneness.
 */
test('stackdown: a conceded player sees Reveal, disabled, while the others race', async ({
  browser,
}) => {
  const club = await createClubWithMembers(['trvc', 'trvd'])
  const [alice, bob] = club.members
  const game = await createStackdownGame(club, 'compete')
  const url = `/g/${game.gametype}/${game.id}`

  const ctxA = await browser.newContext()
  await signIn(ctxA, alice.session)
  const a = await ctxA.newPage()
  await a.goto(url)
  const ctxB = await browser.newContext()
  await signIn(ctxB, bob.session)
  const b = await ctxB.newPage()
  await b.goto(url)

  await expect(a.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })
  await expect(b.locator('[class*="boardCol"]').first()).toBeVisible({ timeout: 20000 })

  a.on('dialog', (d) => void d.accept())
  await a.getByRole('button', { name: 'Concede' }).click()
  await expect(a.getByText('You conceded')).toBeVisible({ timeout: 15000 })

  // Alice is locally done, the game is NOT over — Reveal is there and inert.
  const reveal = a.getByRole('button', { name: /^reveal$/i })
  await expect(reveal).toBeVisible()
  await expect(reveal).toBeDisabled()
  await expect(reveal).toHaveAttribute('data-tooltip', "Can't reveal until all end")

  await ctxA.close()
  await ctxB.close()
})
