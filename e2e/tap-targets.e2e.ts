import { test, expect, type Page } from '@playwright/test'
import {
  createBoggleGame,
  createConnectionsGame,
  createLetterboxedGame,
  createScrabbleGame,
  createSoloClub,
  createSpellingbeeGame,
  createStackdownGame,
  createStrandsGame,
  createWaffleGame,
  createWordwheelGame,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Every board you play by TAPPING must suppress double-tap-to-zoom, or iOS
 * Safari treats the second of two quick taps as the start of a zoom gesture and
 * eats it — you tap out a word and a letter is missing. `touch-action:
 * manipulation` is the opt-out, and every tapped board is supposed to carry it.
 *
 * Why this is an e2e rather than a lint rule or a reading of the CSS: the
 * failure is INVISIBLE IN THE SOURCE. `touch-action` is silently ignored on an
 * SVG child element — a `<g>` generates no CSS box, so the browser drops the
 * declaration on the floor — and spellingbee shipped exactly that for months.
 * The rule was there, on `.hex`, with a comment explaining why it was needed;
 * it just never applied. Reading the stylesheet tells you nothing. Only asking
 * the browser what it actually computed does.
 *
 * So this walks from each game's real tap target up its ancestor chain (which
 * is how the browser resolves a touch's effective behaviour) and requires a
 * `touch-action` on some element that can actually carry one. It catches both
 * failure modes at once: the rule that's missing (wordwheel, strands) and the
 * rule that's present but inert (spellingbee).
 *
 * Adding a game with a tapped board? Add it here.
 */

/** Games you play by tapping the board, with a selector for one tap target. */
const TAPPED_BOARDS = [
  // The two SVG-drawn boards — the shape that made this bug possible. Their
  // rule has to live on the <svg> root, not on the <g> that is the tile.
  { name: 'spellingbee', make: createSpellingbeeGame, target: 'g[role="button"]' },
  { name: 'wordwheel', make: createWordwheelGame, target: 'g[role="button"]' },
  { name: 'letterboxed', make: createLetterboxedGame, target: 'svg circle' },
  // HTML tiles: bespoke ones (strands, boggle, scrabble) and the shared `.tile`
  // (connections, waffle, stackdown).
  { name: 'strands', make: createStrandsGame, target: 'button[class*="tile"]' },
  { name: 'connections', make: createConnectionsGame, target: '[class*="tile"]' },
  { name: 'boggle', make: createBoggleGame, target: '[data-boggle-tile]' },
  { name: 'stackdown', make: createStackdownGame, target: '[class*="tile"]' },
  { name: 'waffle', make: createWaffleGame, target: '[class*="tile"]' },
  { name: 'scrabble', make: createScrabbleGame, target: '[data-rack-tile]' },
] as const

/**
 * Ask the BROWSER whether this element's taps are protected: walk up from it,
 * the way touch-action resolution does, and report the first ancestor with a
 * non-`auto` value that the browser will honour. SVG children are skipped
 * precisely because they're where a declaration goes to die.
 */
async function touchActionFor(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const declared: string[] = []
    let honoured: string | null = null
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const value = getComputedStyle(cur).touchAction
      if (!value || value === 'auto') continue
      // The <svg> root is a replaced element with a real box and DOES carry it;
      // its descendants (<g>, <circle>, <polygon>…) do not.
      const inert = cur instanceof SVGElement && !(cur instanceof SVGSVGElement)
      declared.push(`${cur.tagName.toLowerCase()}=${value}${inert ? ' (INERT: svg child)' : ''}`)
      if (!inert && honoured === null) honoured = `${cur.tagName.toLowerCase()}=${value}`
    }
    return { tag: el.tagName.toLowerCase(), honoured, declared }
  })
}

for (const game of TAPPED_BOARDS) {
  test(`${game.name}: the board's tap target suppresses double-tap zoom`, async ({ browser }) => {
    const club = await createSoloClub(`ta${game.name.slice(0, 5)}`)
    const built = await game.make(club)
    // A touch context, so the page renders the way a phone gets it.
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 900, height: 900 } })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${built.gametype}/${built.id}`)

    const target = page.locator(game.target).first()
    await expect(target, `no tap target matched \`${game.target}\``).toBeVisible({ timeout: 25000 })

    const { tag, honoured, declared } = await touchActionFor(page, game.target)
    expect(
      honoured,
      `<${tag}> taps are not protected from double-tap zoom. ` +
        (declared.length
          ? `touch-action IS declared (${declared.join(', ')}) — but not anywhere the browser honours it.`
          : 'No touch-action on the element or any ancestor.'),
    ).not.toBeNull()
    expect(honoured).toMatch(/manipulation|none/)

    await ctx.close()
  })
}
