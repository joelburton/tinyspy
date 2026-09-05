// cs-unmet

import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, removeAllClubMemberships } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The modal's Close BUTTON — not the panel's `×`, which carries the same
 * accessible name, so a role query matches both. `.primary` is the shared
 * global button class (patterns/button.css); the panel's × has none.
 */
// By ROLE + NAME, not by class. It used to select `button.primary` — a global
// class that stopped existing when the button became a component and its
// treatment moved into a CSS module (hashed at build time). The accessible name
// is the stable handle, and it is what `<StandardButton name>` guarantees.
const closeButton = (page: Page) => page.getByRole('button', { name: 'Close', exact: true })

/**
 * The fault MODAL, in a real browser — that a fault raised anywhere in the app
 * actually reaches the screen.
 *
 * This is about faults, not about the homepage; the homepage is only where we
 * happen to hit one. Everything about the
 * wiring reads as fine — `<FaultModal>` is mounted in App.tsx outside the
 * route switch, and the two tokens it paints with live in the eagerly-loaded
 * theme rather than a lazy chunk — but "reads as fine" is precisely what a
 * silent CSS or mounting failure also looks like. A shell page has twice been
 * caught missing a stylesheet the game pages load, and an undefined custom
 * property invalidates its whole declaration without a word.
 *
 * So the check is a browser, and only a browser can make it.
 */

/**
 * The wiring itself, via the console trigger `FaultModal` installs for exactly
 * this purpose. A real fault is a bug or a dead network, so there is no honest
 * UI path to one on demand.
 */
test('faults: a raised fault reaches the screen as a modal', async ({ browser }) => {
  const club = await createSoloClub('fault')

  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto('/')
  await expect(page.getByText('Your clubs')).toBeVisible({ timeout: 15000 })

  // Nothing on screen before we ask for one — otherwise a modal that is always
  // up would pass every assertion below.
  await expect(closeButton(page)).toHaveCount(0)

  await page.evaluate(() => (window as unknown as { pupfault: () => void }).pupfault())

  // The canned fault's own text, and the diagnostics line under it: a friend
  // reading `word|unplayable-board|EXAMPLE|` down a phone line IS the
  // diagnosis, so it has to be on screen, not only in the console.
  await expect(page.getByText('word|unplayable-board|EXAMPLE|')).toBeVisible()
  await expect(page.getByText(/key=unplayable-board/)).toBeVisible()

  // Close is the way out (backdrop click deliberately isn't — see-and-
  // acknowledge), and it leaves the page usable behind it.
  await closeButton(page).click()
  await expect(page.getByText('word|unplayable-board|EXAMPLE|')).toHaveCount(0)
  await expect(page.getByText('Your clubs')).toBeVisible()

  await ctx.close()
})

/**
 * A REAL fault, raised by the app rather than by the console: a homepage whose
 * clubs query comes back empty.
 *
 * Every profile is created with a solo club, so this cannot happen while the
 * database is intact — which is the point. It says the account is broken, and
 * the app has one way to say broken.
 */
test('faults: an empty club list faults instead of claiming you joined none', async ({
  browser,
}) => {
  const club = await createSoloClub('noclub')
  await removeAllClubMemberships(club.members[0].userId)

  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto('/')

  await expect(page.getByText(/you should always have at least your own solo club/)).toBeVisible(
    { timeout: 15000 },
  )
  // The diagnostics line, which is what says WHICH fault this is. There is no
  // `key=` in it any more: a fault carries an envelope's fields now, and this
  // one is authored by the frontend (`HomePage`), so it has no dbcode to show —
  // `detail` is the field that names the condition. Asserting on it rather than
  // on `severity=fault` keeps this test pinned to THIS fault instead of to any.
  await expect(
    page.getByText(/detail="rows=0; every profile has a solo club"/),
  ).toBeVisible()

  // And behind the modal, the page says something TRUE. The sentence this
  // replaced — "You haven't joined a club yet." — was the finding: it stated a
  // fact about the person when the fact was about the database.
  await closeButton(page).click()
  await expect(page.getByText('No clubs found for your account.')).toBeVisible()
  await expect(page.getByText("You haven't joined a club yet.")).toHaveCount(0)

  await ctx.close()
})
