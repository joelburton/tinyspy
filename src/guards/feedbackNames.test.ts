// cs-audited-feedback

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: bare `feedback` is never a declared name.
 *
 * A feedback message is `feedbackMessage` or `feedbackMsg`; a slot instance
 * is `localFeedbackSlot` or `globalFeedbackSlot`; the type, the hook and the
 * pill carry the word inside a longer name. The bare word is what let
 * "feedback" mean five things at once (docs/code-conventions.md → Feedback
 * naming), and what let a parameter called `feedback` quietly mean "the
 * local one". This was a naming rule and a habit; it is a check now, because
 * the prefix that used to be the reminder (`Generic…`) is gone.
 *
 * The check is lexical: comments and string literals are stripped, then a
 * `feedback` token in an IDENTIFIER position fails — declared with
 * `const`/`let`, destructured or passed (`{ feedback }`, `(feedback)`), a
 * property on its own line (`feedback: X`), used as a member (`feedback.show`),
 * or listed in a dependency array. Prose in JSX text ("colored as feedback")
 * is not a name and is not matched. Hyphenated ids like
 * `act-dismiss-feedback` live in strings and are stripped with them.
 *
 * No allowlist: every `.ts`/`.tsx` file under `src/` is held to this, and a
 * new offender is renamed rather than excused.
 */

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

/** Blank out block comments, line comments, and every string / template
 *  literal — keeping every newline, so line numbers still point home. */
function codeOnly(source: string): string {
  const keepNewlines = (m: string) => m.replace(/[^\n]/g, ' ')
  return source
    .replace(/\/\*[\s\S]*?\*\//g, keepNewlines)
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, keepNewlines)
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
}

/** `feedback` where only an identifier can stand. */
const IDENTIFIER_POSITIONS = [
  /\b(?:const|let|var)\s+feedback\b/, // const feedback =
  /[{(,]\s*feedback\s*[,}):=\]]/,     // { feedback }, (feedback), [a, feedback]
  /^\s*feedback\??\s*:/,              // feedback: X   (a property in a type or literal)
  /\bfeedback\s*\./,                  // feedback.show(
]

function offendingLines(source: string): number[] {
  const lines = codeOnly(source).split('\n')
  const out: number[] = []
  lines.forEach((line, i) => {
    if (IDENTIFIER_POSITIONS.some((re) => re.test(line))) out.push(i + 1)
  })
  return out
}

describe('feedback naming — bare `feedback` is never a declared name', () => {
  const files = walk(SRC).filter((p) => !p.endsWith('feedbackNames.test.ts'))

  it('no file writes the bare name', () => {
    const offenders: string[] = []
    for (const p of files) {
      const lines = offendingLines(readFileSync(p, 'utf8'))
      if (lines.length > 0) offenders.push(`${relative(SRC, p)}:${lines.join(',')}`)
    }
    expect(offenders, 'name it feedbackMessage / feedbackMsg, or localFeedbackSlot / globalFeedbackSlot').toEqual([])
  })
})
