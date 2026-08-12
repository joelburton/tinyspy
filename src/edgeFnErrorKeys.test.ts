/**
 * GUARD: every edge-function error return carries an fe-error-key.
 *
 * The contract (docs/supabase.md → Server errors): an edge function's
 * `json({ error: … })` value is a `key|detail1|detail2|` shape — kebab-case
 * key, ending in `|` — never player-facing prose. The FE owns every word a
 * player reads; a function that answers prose defeats the copy table AND the
 * transport classification (prose off an edge function is codeless, so it
 * used to misfile as "Server; try refresh" over a real answer).
 *
 * Mechanics: scan every `json({ … })` call in `supabase/functions` for its
 * `error:` value.
 *   - A string/template literal must START with an fe-error-key prefix
 *     (template interpolation may follow — `` `no-candidate-words|${band}|` ``
 *     is fine, the check covers the literal head).
 *   - A non-literal value (a variable, `error.message`) is only legal as one
 *     of the APPROVED_EXPRESSIONS below — each an exact snippet with a
 *     justification, per-expression rather than per-file so an exemption
 *     can't shield unrelated lines (the lesson from noRawServerMessage's
 *     file-granular allowlist, review finding 9).
 *
 * UNCONVERTED lists the functions not yet migrated (the burn-down list —
 * docs/supabase.md → Server errors). Deleting a function's entry as its
 * conversion lands is part of that conversion; a NEW violation in a converted
 * function fails immediately.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FUNCTIONS_DIR = join(__dirname, '..', 'supabase', 'functions')

/** Not yet converted to fe-error-keys. EMPTY as of 2026-08-12 — all thirteen
 *  functions are converted and under enforcement. Stays here as the door for
 *  a future function to convert through (a new fn starts enforced; only add
 *  an entry deliberately, with a plan to remove it). */
const UNCONVERTED = new Set<string>([])

/** Non-literal `error:` values that are allowed, each with its reason. */
const APPROVED_EXPRESSIONS: Array<{ file: string; snippet: string; why: string }> = [
  {
    file: '_shared/startGame.ts',
    snippet: 'error: error.message, code: error.code',
    why: 'the create_game relay: the RPC message IS an fe-error-key (SQL raises them), passed verbatim with its SQLSTATE',
  },
  {
    file: 'spellingbee-build-board/index.ts',
    snippet: '{ error: err }',
    why: "validateCustomLetters returns an fe-error-key (board.ts — bad-custom-*), pinned by board_test.ts",
  },
  {
    file: 'wordwheel-build-board/index.ts',
    snippet: '{ error: err }',
    why: "validateCustomLetters returns an fe-error-key (board.ts — bad-custom-*), pinned by board_test.ts",
  },
  {
    file: 'crosswords-import-nyt/index.ts',
    snippet: 'error: error.message, code: error.code',
    why: 'the create_game relay (the importers call it inline): the RPC message IS an fe-error-key, passed with its SQLSTATE',
  },
  {
    file: 'crosswords-import-guardian/index.ts',
    snippet: 'error: error.message, code: error.code',
    why: 'the create_game relay (the importers call it inline): the RPC message IS an fe-error-key, passed with its SQLSTATE',
  },
  {
    file: 'codenamesduet-suggest-clue/index.ts',
    snippet: 'error: error.message, code: error.code',
    why: 'the get_clue_context relay: the RPC message IS an fe-error-key, passed with its SQLSTATE',
  },
  {
    file: 'crosswords-explain-clue/index.ts',
    snippet: 'error: error.message, code: error.code',
    why: 'the reveal_solved_word relay: the RPC message IS an fe-error-key, passed with its SQLSTATE',
  },
  {
    file: 'scrabble-suggest-move/index.ts',
    snippet: 'error: error.message, code: error.code',
    why: 'the suggest-context relay: the RPC message IS an fe-error-key, passed with its SQLSTATE',
  },
  {
    file: 'scrabble-ai-move/index.ts',
    snippet: 'error: error.message, code: error.code',
    why: 'the get_ai_context relay: the RPC message IS an fe-error-key, passed with its SQLSTATE',
  },
  {
    file: 'scrabble-ai-move/index.ts',
    snippet: '{ error: message }',
    why: "fail()'s message is the failing ai_* RPC's error.message — an fe-error-key relay; nothing here is player-facing (the poke is fire-and-forget)",
  },
]

/** `key|` at the head of the literal: kebab-case key, then the delimiter. */
const KEY_PREFIX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\|/

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name.startsWith('.') ? [] : tsFiles(p)
    return name.endsWith('.ts') && !name.endsWith('_test.ts') ? [p] : []
  })
}

/** Every `json({ … })` argument's source text, brace-matched (template `${}`
 *  braces are why a naive `[^}]*` regex can't do this). */
function jsonCallBodies(src: string): string[] {
  const bodies: string[] = []
  const re = /\bjson\(\s*\{/g
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1
    let i = re.lastIndex
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    bodies.push(src.slice(re.lastIndex - 1, i))
  }
  return bodies
}

/** The `error:` value inside one json-call body, or null if it has none. */
function errorValue(body: string): string | null {
  const m = /\berror:\s*/.exec(body)
  if (!m) return null
  return body.slice(m.index + m[0].length).trim()
}

/** The head of a string/template literal, up to its first interpolation. */
function literalHead(value: string): string | null {
  const quote = value[0]
  if (quote !== "'" && quote !== '"' && quote !== '`') return null
  let head = ''
  for (let i = 1; i < value.length; i++) {
    const c = value[i]
    if (c === quote) return head
    if (quote === '`' && c === '$' && value[i + 1] === '{') return head
    if (c === '\\') { head += value[i + 1]; i++; continue }
    head += c
  }
  return head
}

describe('edge functions return fe-error-keys', () => {
  const files = tsFiles(FUNCTIONS_DIR)
  it('scans a plausible number of files (the walker is not silently broken)', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const file of files) {
    const rel = file.slice(FUNCTIONS_DIR.length + 1)
    const fnDir = rel.split('/')[0]
    if (UNCONVERTED.has(fnDir)) continue

    it(`${rel} — every json error is an fe-error-key`, () => {
      const src = readFileSync(file, 'utf8')
      const violations: string[] = []
      for (const body of jsonCallBodies(src)) {
        const value = errorValue(body)
        if (value === null) continue
        const head = literalHead(value)
        if (head !== null) {
          if (!KEY_PREFIX.test(head)) {
            violations.push(`literal does not start with an fe-error-key: ${value.slice(0, 80)}`)
          }
          continue
        }
        const approved = APPROVED_EXPRESSIONS.some(
          (a) => rel === a.file && body.replace(/\s+/g, ' ').includes(a.snippet),
        )
        if (!approved) {
          violations.push(`non-literal error value needs an APPROVED_EXPRESSIONS entry: ${value.slice(0, 80)}`)
        }
      }
      expect(violations, violations.join('\n')).toEqual([])
    })
  }
})
