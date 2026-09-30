// cs-unmet

import { execFileSync } from 'node:child_process'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { createSoloClub, createWordleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * wordle's colors as the browser paints them: the on-screen keyboard's, resting
 * and hovered, and a landed row's tiles once they have flipped.
 *
 * Browser-only, and unusually worth the cost: every one of these values is a
 * COMPUTED style, so jsdom can't see any of it. The keyboard's three bugs this
 * spec was first written after were all invisible to the unit suite. They were also all the same
 * bug wearing different hats: `.key:hover` is specificity (0,3,0) where a key color
 * class is (0,1,0), so a hover rule that sets `background` outright beats every
 * key that has a fill of its own. A green key turned white with its white ink
 * still on it; so did ENTER. The fix is the house discipline — the hover rule
 * reads `--kbd-key-hover-fill-color` OFF THE ELEMENT, and anything with its own
 * fill re-sets that token — and this spec is what keeps it fixed.
 *
 * The tiles' colors are CSS alone too: a flipping tile keeps its color class,
 * and the flip's keyframes land on that class's own `--tile-slot-*` tokens. A
 * keyframe reading the wrong token, or a color class that stops reaching a
 * flipping tile, would leave the unit suite green and a player looking at a
 * blank row — so the landed row is read here, with and without reduced motion.
 *
 * It asserts against the TOKENS rather than against literal hexes, by resolving
 * each token in the page and comparing. So retuning the palette (which the color
 * sweep did twice while this was being written) can't break the spec, and the
 * spec can't quietly pin a value nobody meant to freeze.
 *
 * It never prints the answer: the target is read as the superuser only to pick a
 * guess that yields all three colors, and only the guess is logged.
 */

const psql = (sql: string): string[] =>
  execFileSync(
    'psql',
    ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-tAX', '-c', sql],
    { encoding: 'utf8' },
  )
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * wordle's coloring, duplicate-aware: greens first, then each remaining letter
 * takes a yellow only if the target still has an unspent copy of it.
 *
 * The naive version (does the target CONTAIN this letter?) is wrong on repeats —
 * guess RIVER against a target with one R would paint both Rs — and the target is
 * random per game, so a spec that assumed distinct letters would pass most days
 * and fail on the rest. The server is still the authority: this only picks a
 * likely guess, and the assertions read the colors off the keyboard.
 */
function makeGuessColors(target: string, guess: string): string[] {
  const out = Array(guess.length).fill('gray')
  const spare: Record<string, number> = {}
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === target[i]) out[i] = 'green'
    else spare[target[i]] = (spare[target[i]] ?? 0) + 1
  }
  for (let i = 0; i < guess.length; i++) {
    if (out[i] === 'green') continue
    if ((spare[guess[i]] ?? 0) > 0) {
      out[i] = 'yellow'
      spare[guess[i]]--
    }
  }
  return out
}

/**
 * The colors the KEYBOARD will show for a guess — one per distinct letter, the
 * best the letter earned anywhere in the row (`lib/colors.ts` → `makeKeyColors`,
 * which keeps a color only when `colorRank` beats what that key already has).
 *
 * This is not the same set as the row's, and the difference is the whole reason
 * this function exists. A guess whose only yellow sits on a letter that is ALSO
 * green somewhere else is tricolor across its five positions and two-color on the
 * keyboard: the green key wins and no yellow key is ever drawn. Measured against
 * 400 random targets, that is ~5% of games — so picking on the row's colors made
 * this spec fail about one run in twenty, for a reason that looks nothing like
 * its cause.
 */
function makeKeyboardColors(target: string, guess: string): Set<string> {
  const RANK: Record<string, number> = { gray: 0, yellow: 1, green: 2 }
  const colors = makeGuessColors(target, guess)
  const best = new Map<string, string>()
  for (let i = 0; i < guess.length; i++) {
    const prev = best.get(guess[i])
    if (prev === undefined || RANK[colors[i]] > RANK[prev]) best.set(guess[i], colors[i])
  }
  return new Set(best.values())
}

/** A legal guess whose KEYBOARD wears all three colors — see `makeKeyboardColors`. */
function pickTricolorGuess(gameId: string): string {
  const [target, band] = psql(
    `select target, legal_band from wordle.games where game_id = '${gameId}';`,
  )[0].split('|')
  const words = psql(
    `select word from common.words where len = 5 and difficulty <= ${Number(band)} ` +
      `and word <> '${target}' limit 4000;`,
  )
  for (const w of words) {
    if (makeKeyboardColors(target, w).size === 3) return w
  }
  throw new Error('no legal word paints all three colors onto the keyboard for this target')
}

/** A token's value as the browser resolves it — the spec's source of truth. */
function resolveToken(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => {
    const probe = document.createElement('div')
    probe.style.color = `var(${n})`
    document.body.append(probe)
    const v = getComputedStyle(probe).color
    probe.remove()
    return v
  }, name)
}

/**
 * A signed-in page on a fresh game, with a guess that shows all three colors
 * played through the real input path — so the board and the keyboard color the
 * way they do for a player rather than from seeded rows — and its row landed.
 */
async function playTricolorGuess(
  browser: Browser,
  clubName: string,
  reducedMotion: 'reduce' | 'no-preference',
) {
  const club = await createSoloClub(clubName)
  const game = await createWordleGame(club)
  const guess = pickTricolorGuess(game.id)

  const ctx = await browser.newContext({ reducedMotion })
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

  for (const ch of guess) await page.keyboard.press(ch)
  await page.keyboard.press('Enter')
  // The keys tint when the row lands. Poll on the color CLASSES rather than on a
  // computed color, so this wait can't be the one place in the spec that pins a
  // literal value.
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('[aria-label="Keyboard"] button')].filter((b) =>
            /wordle(Green|Yellow|Gray)/.test(b.className),
          ).length,
      ),
    )
    .toBeGreaterThan(1)

  return { ctx, page, guess }
}

/**
 * The landed row's tiles, once the flip has finished, each against its color's
 * `--wordle-*` fill, edge and ink. Polled, because the flip is staggered per tile
 * and a tile reads its first-half look until its own turn comes; the list of
 * tiles that don't match yet has to empty.
 */
async function expectLandedRowColors(page: Page) {
  const tokens: Record<string, { fill: string; edge: string; ink: string }> = {}
  for (const color of ['green', 'yellow', 'gray']) {
    tokens[color] = {
      fill: await resolveToken(page, `--wordle-${color}-fill-color`),
      edge: await resolveToken(page, `--wordle-${color}-edge-color`),
      ink: await resolveToken(page, `--wordle-${color}-ink-color`),
    }
  }
  const readFirstRow = () =>
    page.evaluate(() => {
      const row = document.querySelector('[data-board] [role="row"]')!
      return [...row.querySelectorAll('[role="gridcell"]')].map((tile) => {
        const cls = tile.className
        const color = /wordleGreen/.test(cls)
          ? 'green'
          : /wordleYellow/.test(cls)
            ? 'yellow'
            : /wordleGray/.test(cls)
              ? 'gray'
              : ''
        const style = getComputedStyle(tile)
        return { color, fill: style.backgroundColor, edge: style.borderTopColor, ink: style.color }
      })
    })
  // Every tile of a landed row wears a color class.
  expect((await readFirstRow()).every((tile) => tile.color !== '')).toBe(true)
  await expect
    .poll(async () =>
      (await readFirstRow())
        .map((tile, i) => ({ i, ...tile }))
        .filter((tile) => {
          const want = tokens[tile.color]!
          return tile.fill !== want.fill || tile.edge !== want.edge || tile.ink !== want.ink
        }),
    )
    .toEqual([])
}

test('the keyboard wears the right fill and ink, resting and hovered', async ({ browser }) => {
  const { ctx, page, guess } = await playTricolorGuess(browser, 'kbdcol', 'no-preference')
  const token = (name: string) => resolveToken(page, name)

  const key = (label: string) =>
    page.locator('[aria-label="Keyboard"]').getByRole('button', { name: label, exact: true })

  const look = async (label: string) => {
    const b = key(label)
    // Park the pointer first: the previous look left it over a key, and a key
    // that has since gone live would read its hover fill as "resting".
    await page.mouse.move(0, 0)
    const resting = await b.evaluate((e) => ({
      fill: getComputedStyle(e).backgroundColor,
      ink: getComputedStyle(e).color,
    }))
    await b.hover()
    const hovered = await b.evaluate((e) => ({
      fill: getComputedStyle(e).backgroundColor,
      ink: getComputedStyle(e).color,
    }))
    return { resting, hovered }
  }

  // Which letter earned which color, read off the KEYS themselves — the server's
  // answer, not a recomputation of it.
  const letterByColor = await page.evaluate(() => {
    const out: Record<string, string> = {}
    for (const b of document.querySelectorAll('[aria-label="Keyboard"] button')) {
      const cls = b.className
      const color = /wordleGreen/.test(cls)
        ? 'green'
        : /wordleYellow/.test(cls)
          ? 'yellow'
          : /wordleGray/.test(cls)
            ? 'gray'
            : ''
      const label = b.getAttribute('aria-label') ?? ''
      if (color && !out[color] && label.length === 1) out[color] = label
    }
    return out
  })
  expect(Object.keys(letterByColor).sort()).toEqual(['gray', 'green', 'yellow'])

  // `--ink-onDark-color`, not `--ink-on-dark-color`. An undefined custom property
  // does not throw — `var()` on one just leaves the probe's `color` inherited —
  // so the old name silently resolved to the page's body text and this read as a
  // white key wearing black ink.
  const white = await token('--ink-onDark-color')
  const darkInk = await token('--kbd-key-ink-color')

  // A JUDGED key wears its wordle color, resting AND hovered — the hover must not
  // repaint a key that has a fill of its own.
  for (const [color, letter] of Object.entries(letterByColor)) {
    const fill = await token(`--wordle-${color}-fill-color`)
    const { resting, hovered } = await look(letter)
    expect(resting, `${color} key at rest`).toEqual({ fill, ink: white })
    expect(hovered, `${color} key hovered`).toEqual({ fill, ink: white })
  }

  // An UNTRIED key is the warm near-white cap with dark ink, and lightens to pure
  // white under the pointer — the one key that does change, because a near-white
  // cap gives a drop shadow almost nothing to read against.
  const untried = [...'abcdefghijklmnopqrstuvwxyz'].find((c) => !guess.includes(c))!
  const plain = await look(untried)
  expect(plain.resting).toEqual({ fill: await token('--kbd-key-fill-color'), ink: darkInk })
  expect(plain.hovered).toEqual({ fill: await token('--kbd-key-hover-fill-color'), ink: darkInk })

  // ENTER is a Submit, so it is the action blue with white ink. With the entry
  // EMPTY — as it is now, the guess having just landed — the cap is the same
  // bound action the physical key answers to, and that action is gray with
  // nothing to submit: no hover, the resting fill under the pointer too.
  const idle = await look('Enter')
  expect(idle.resting).toEqual({ fill: await token('--button-normal-primary-color'), ink: white })
  expect(idle.hovered).toEqual(idle.resting)
  await expect(key('Enter')).toBeDisabled()

  // With a letter typed it is live, and DARKENS on hover like every other filled
  // action button. The tokens are the BUTTON vocabulary's — the key is styled as
  // one (`--button-normal-primary-*`), which is the point: retuning the primary
  // button retunes this key with it.
  await page.keyboard.press(untried)
  await expect(key('Enter')).toBeEnabled()
  const enter = await look('Enter')
  expect(enter.resting).toEqual({ fill: await token('--button-normal-primary-color'), ink: white })
  expect(enter.hovered).toEqual({
    fill: await token('--button-normal-primary-hover-color'),
    ink: white,
  })

  await ctx.close()
})

test('a landed row settles on each tile\'s own fill, edge and ink', async ({ browser }) => {
  const { ctx, page } = await playTricolorGuess(browser, 'tilecol', 'no-preference')
  await expectLandedRowColors(page)
  await ctx.close()
})

test('with reduced motion, the row skips the flip and shows the same colors', async ({ browser }) => {
  const { ctx, page } = await playTricolorGuess(browser, 'tilecolrm', 'reduce')
  await expectLandedRowColors(page)
  await ctx.close()
})
