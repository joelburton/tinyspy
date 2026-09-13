// cs-blessed-homepage

import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, removeAllClubMemberships } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The fault modal's Close button, by role and accessible name — the handle
 * `<StandardButton>` guarantees, where a class name is hashed at build time.
 */
const closeButton = (page: Page) => page.getByRole('button', { name: 'Close', exact: true })

/**
 * The fault MODAL, in a real browser — that a fault raised anywhere in the app
 * actually reaches the screen.
 *
 * The first test is about the host and lands on the homepage only because it
 * is the page after sign-in; the second is the homepage's own fault. Everything
 * about the wiring reads as fine — `<FaultModal>` is mounted in App.tsx outside
 * the route switch, and the tokens it paints with are the theme's, loaded at
 * boot rather than in a game's lazy chunk — but "reads as fine" is precisely
 * what a silent CSS or mounting failure also looks like: an undefined custom
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
  // reading that line down a phone line IS the diagnosis, so it has to be on
  // screen, not only in the console. The line is `diagnosticsLine`'s, so the
  // assertion is on two of its fields rather than the whole string.
  await expect(page.getByText('This board cannot be played. Start a new game.')).toBeVisible()
  await expect(page.getByText(/dbcode=P0001 .*window\.pupfault/)).toBeVisible()

  // Close is the way out (backdrop click deliberately isn't — see-and-
  // acknowledge), and it leaves the page usable behind it.
  await closeButton(page).click()
  await expect(page.getByText('This board cannot be played. Start a new game.')).toHaveCount(0)
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
  // The diagnostics line, which is what says WHICH fault this is. A fault
  // carries an envelope's fields, and this one is authored by the frontend
  // (`HomePage`), so it has no dbcode to show — `detail` is the field that
  // names the condition. Asserting on it rather than on `severity=fault` keeps
  // this test pinned to THIS fault instead of to any.
  await expect(
    page.getByText(/detail="rows=0; every profile has a solo club"/),
  ).toBeVisible()

  // And behind the modal, the page's own line says what is TRUE — a fact about
  // the database, not about the person.
  await closeButton(page).click()
  await expect(page.getByText('No clubs found for your account.')).toBeVisible()

  await ctx.close()
})
