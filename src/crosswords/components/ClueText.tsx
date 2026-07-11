import { Fragment } from 'react'

/**
 * Render a clue string, turning the `_emphasis_` markers back into real
 * italics. Those underscores are `htmlToText`'s (clueHtml.ts) plaintext
 * stand-in for a clue's `<i>` / `<em>` tags — the right STORED form (it
 * round-trips cleanly to the plaintext PDF / .ipuz export), but on screen a
 * Guardian clue like "singer of _Heigh-Ho_?" should show *Heigh-Ho* in
 * italics the way the source does, not literal underscores.
 *
 * Display-only: the stored `Clue.text` is untouched, so export/AI-explain keep
 * the plaintext form. Splits on the paired `_…_` runs (crossword clue text
 * never contains a lone underscore, so this is unambiguous); an unpaired
 * underscore just renders literally.
 */
export function ClueText({ text }: { text: string }) {
  const parts = text.split(/(_[^_]+_)/)
  return (
    <>
      {parts.map((p, i) =>
        /^_[^_]+_$/.test(p) ? <em key={i}>{p.slice(1, -1)}</em> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  )
}
