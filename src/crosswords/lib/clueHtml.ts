/**
 * Minimal HTML→plain-text for crossword clue markup — shared by the puzzle
 * converters (`nyt.ts`, `guardian.ts`). Both feeds ship clue text with HTML
 * tags (italics for cross-reference emphasis) and/or entities (`&amp;`,
 * `&mdash;`), which must land in our grid as (almost) plain UTF-8. Ported from
 * crossplay's `htmlToText`.
 *
 * The ONE tag we KEEP is italic emphasis, normalized to `<em>…</em>`: the
 * renderers (`ClueText`, `pdf/clues.ts` via `parseClueRuns`) turn it back into
 * real italics. We keep the *tag* rather than an underscore stand-in (the old
 * crossplay convention) because underscores collide with literal ones — NYT
 * fill-in clues like `A_P_E` would be misread as emphasis. `<em>` never occurs
 * in real clue prose, so it's unambiguous. The raw-text consumers (the AI
 * explain-clue prompt, the .ipuz export) strip it via `stripClueEmphasis`.
 *
 * Pure, no fetch, `.ts` specifier — so it resolves under Deno (the import
 * edge functions) as well as vitest.
 */

/** Convert clue HTML to (almost) plain text, KEEPING italic emphasis as
 *  `<em>…</em>`. Order matters (tags before their entities). The Latin-1
 *  transliteration table is intentionally not ported — output is UTF-8. */
export function htmlToText(html: string): string {
  return html
    // Italics → a single normalized <em> tag we deliberately keep (see header).
    .replace(/<i>(.*?)<\/i>/gi, '<em>$1</em>')
    .replace(/<em>(.*?)<\/em>/gi, '<em>$1</em>')
    .replace(/<sub>(.*?)<\/sub>/gi, '$1')
    .replace(/<sup>([\d\s]+)<\/sup>/gi, '^$1')
    .replace(/<sup>(.*?)<\/sup>/gi, '$1')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<s>(.*?)<\/s>/gi, '[*cross out* $1]')
    // Strip every OTHER tag; the negative lookahead spares <em>/</em>.
    .replace(/<(?!\/?em>)[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&vert;/g, '|')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&bull;/g, '*')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
}
