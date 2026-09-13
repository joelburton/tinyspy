// cs-blessed-definitions

/** A piece of a parsed definition: text shown verbatim, or a word to look up. */
export type DefPart =
  | { kind: 'text'; word?: never; value: string }
  | { kind: 'ref'; value?: never; word: string }

/** A cross-reference token: `<word=pos>` or `{word=pos}`. Capture
 *  the target word; the pos is only there to disambiguate the
 *  dictionary entry and isn't shown. */
const REF_RE = /[<{]([a-z]+)=[a-z]+[>}]/g

/**
 * Turn a raw definition string into renderable parts: the text verbatim, with
 * each cross-reference as a `ref` part the view renders as a clickable lookup.
 *
 * The stored text is authoritative and shown in full — the bracketed
 * inflection tags (`[n PENGUINS]`), the `/` sense separators and the `(YEAR)`
 * tags all pass through as text, so a gloss that is only `[n SUPPRESSIONS]`
 * still shows exactly that rather than a blank. Live Wiktionary prose
 * (`source === 'w'`) has no markup and comes back as one text part; the seeded
 * glosses ('s'/'e'/'m') use the upstream word list's compact format, where a
 * cross-reference is a word and part of speech in angle or curly brackets:
 * `<aah=v>`, `{vulture=n}`.
 */
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
