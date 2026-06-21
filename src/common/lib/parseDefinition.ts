/**
 * Turn a raw definition string into renderable parts.
 *
 * The definition text stored in `common.words` is authoritative and
 * shown in full — we never drop any of it. The only thing this does
 * is *add* markup: turning the custom format's cross-refs into
 * clickable links. Everything else (the bracketed inflection tags
 * like `[n PENGUINS]`, the `/` sense separators, the `(YEAR)` tags)
 * is rendered verbatim as text; a player who looks up an inflected
 * form whose gloss is only `[n SUPPRESSIONS]` still sees exactly
 * that, rather than a blank.
 *
 *   - **Wiktionary** (`source === 'w'`): clean prose fetched live, no
 *     markup. Returned as a single text part, verbatim.
 *
 *   - **Seeded glosses** (`source` is 's' / 'e' / 'm'): the shared
 *     custom symbology (see the definition-format notes in
 *     docs/games/freebee.md — richer than the original Scrabble
 *     glosses). The only markup we act on is the cross-reference — a
 *     target word + part-of-speech in angle or curly brackets:
 *     `<aah=v>`, `{vulture=n}`. Each becomes a `ref` part the FE
 *     renders as a clickable lookup — tap it to chase the reference
 *     without retyping. The surrounding text passes through untouched.
 *
 * The split keeps the render dumb: the component walks the parts and
 * renders text as text, refs as buttons. It never has to know the
 * markup grammar.
 */

export type DefPart =
  | { kind: 'text'; word?: never; value: string }
  | { kind: 'ref'; value?: never; word: string }

/** A cross-reference token: `<word=pos>` or `{word=pos}`. Capture
 *  the target word; the pos is only there to disambiguate the
 *  dictionary entry and isn't shown. */
const REF_RE = /[<{]([a-z]+)=[a-z]+[>}]/g

export function parseDefinition(def: string, source: string | null): DefPart[] {
  // Only live Wiktionary prose ('w') is plain text; every seeded
  // gloss uses the custom symbology and gets parsed for cross-refs.
  if (source === 'w') {
    return [{ kind: 'text', value: def }]
  }

  const parts: DefPart[] = []
  let last = 0
  // Walk every cross-ref match, emitting the (verbatim) text between
  // matches as text parts and each match as a ref part.
  for (const m of def.matchAll(REF_RE)) {
    const idx = m.index
    if (idx > last) parts.push({ kind: 'text', value: def.slice(last, idx) })
    parts.push({ kind: 'ref', word: m[1] })
    last = idx + m[0].length
  }
  if (last < def.length) {
    parts.push({ kind: 'text', value: def.slice(last) })
  }

  // A def with no cross-refs is just one text part — the whole string.
  return parts.length > 0 ? parts : [{ kind: 'text', value: def }]
}
