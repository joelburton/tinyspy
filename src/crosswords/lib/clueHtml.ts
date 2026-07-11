/**
 * Minimal HTML→plain-text for crossword clue markup — shared by the puzzle
 * converters (`nyt.ts`, `guardian.ts`). Both feeds ship clue text with HTML
 * tags (italics for cross-reference emphasis) and/or entities (`&amp;`,
 * `&mdash;`), which must land in our grid as plain UTF-8. Ported verbatim from
 * crossplay's `htmlToText`.
 *
 * Pure, no fetch, `.ts` specifier — so it resolves under Deno (the import
 * edge functions) as well as vitest.
 */

/** Convert clue HTML to plain text. Order matters (tags before their
 *  entities). The Latin-1 transliteration table is intentionally not ported —
 *  output is UTF-8. */
export function htmlToText(html: string): string {
  return html
    .replace(/<i>(.*?)<\/i>/gi, '_$1_')
    .replace(/<em>(.*?)<\/em>/gi, '_$1_')
    .replace(/<sub>(.*?)<\/sub>/gi, '$1')
    .replace(/<sup>([\d\s]+)<\/sup>/gi, '^$1')
    .replace(/<sup>(.*?)<\/sup>/gi, '$1')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<s>(.*?)<\/s>/gi, '[*cross out* $1]')
    .replace(/<[^>]+>/g, '')
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
