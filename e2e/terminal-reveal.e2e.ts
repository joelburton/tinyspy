import { test, expect } from '@playwright/test'
import {
  createSoloClub,
  createClubWithMembers,
  createStackdownGame,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The terminal solution gate (docs/ui.md → Terminal results) and the one common
 * flag behind it, `common.games.solution_revealed`.
 *
 * A game that ends WITHOUT a clean win keeps its answer covered: `replay_board`
 * re-runs the very same board, so a force-reveal would make Restart theater.
 * The solution opens on an explicit Reveal — offered twice, in the terminal
 * action row and in the game menu — and both controls disable themselves once
 * it's showing.
 *
 * stackdown stands in for the family (psychicnum's tile-ring half is covered by
 * psychicnum-terminal.e2e.ts): its six words are a text region, so "is the
 * solution on screen?" is directly assertable.
 *
 * Browser-only: the pieces are a server flag, a realtime refetch, and what a
 * component chooses to draw — no one layer can show this on its own.
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
  const revealRow = page.getByRole('button', { name: /^reveal/i })

  // Mid-game: no solution, and no reveal control in the action row (the amber
  // Spoiler button beside it is a different thing — one word, and it stays).
  await expect(words).toHaveCount(0)
  await expect(revealRow).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Spoiler' })).toBeVisible()

  // The menu item exists all along but is inert until terminal — matching the
  // server, where common.reveal_solution rejects a game that isn't over.
  const openMenu = () => page.getByRole('button', { name: /menu/i }).first().click()
  await openMenu()
  const revealItem = page.getByRole('menuitem', { name: 'Reveal solution' })
  await expect(revealItem).toBeVisible()
  await expect(revealItem).toBeDisabled()
  await page.keyboard.press('Escape')

  // End the game — a manual end, so NOT a clean win.
  await page.getByRole('button', { name: /^end$/i }).click()
  await page.getByRole('button', { name: 'End game' }).click()
  await expect(revealRow).toBeVisible({ timeout: 8000 })

  // Terminal, but the words are still covered.
  await expect(words).toHaveCount(0)

  // Asking opens them, and both controls go inert.
  await revealRow.click()
  await expect(words).toBeVisible()
  await expect(revealRow).toBeDisabled()
  await openMenu()
  await expect(page.getByRole('menuitem', { name: 'Reveal solution' })).toBeDisabled()
  await page.keyboard.press('Escape')

  // Restart re-hides it — `common.reset_game` clears the flag, which is the
  // whole reason it's a common column instead of per-game FE state.
  await page.getByRole('button', { name: 'Restart' }).click()
  await expect(words).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Spoiler' })).toBeVisible() // playing again

  await ctx.close()
})

/**
 * The flag is SHARED, which is the point of putting it on the row: a
 * post-mortem is something the friends do together, so one player's Reveal
 * opens the solution on everyone's screen through the same realtime refetch
 * that carries the rest of `common.games`.
 */
test('stackdown: one player revealing opens the words for the other', async ({ browser }) => {
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
  await a.getByRole('button', { name: /^end$/i }).click()
  await a.getByRole('button', { name: 'End game' }).click()
  await expect(a.getByRole('button', { name: /^reveal/i })).toBeVisible({ timeout: 8000 })
  await expect(wordsA).toHaveCount(0)
  await expect(wordsB).toHaveCount(0)

  // B asks — and A's screen opens too, without A touching anything.
  await b.getByRole('button', { name: /^reveal/i }).click()
  await expect(wordsB).toBeVisible()
  await expect(wordsA).toBeVisible({ timeout: 10000 })

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
 * The FE gate mirrors the server's: `common.reveal_solution` requires
 * `is_terminal` — ended for EVERYONE — so a conceder can't spoil a live race
 * even by calling the RPC directly.
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
  const reveal = a.getByRole('button', { name: /^reveal/i })
  await expect(reveal).toBeVisible()
  await expect(reveal).toBeDisabled()
  await expect(reveal).toHaveAttribute('data-tooltip', "Can't reveal until all end")

  await ctxA.close()
  await ctxB.close()
})
