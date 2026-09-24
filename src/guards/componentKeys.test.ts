// cs-unmet

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Guard: no key is read by hand.
 *
 * A key is either an action's (`common/actions/registry.ts`) or a component's
 * (`common/keyboard/componentKeys.ts`), and both are matched by the one
 * function in `chord.ts`. That is what lets Help's key list and `gmake
 * dev-keys` show every key the app answers: a handler comparing `e.key ===
 * 'PageDown'` works just as well and belongs to no row, so neither can see it.
 * The club page's list keys were exactly that, missing from both.
 *
 * **What is flagged:** a file that reads `e.key` / `e.code` or listens for
 * `keydown`, and imports neither the matcher nor the component-keys table.
 * Reading `e.key` AFTER a row matched — which of ↑ and ↓ it was — is fine, and
 * is why importing the table is the test rather than never reading the key.
 */

/** Where reading a key by hand is the job. */
const EXEMPT: Record<string, string> = {
  'src/common/actions/chord.ts': 'it IS the matcher',
}

function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'))
}

/** The source with its comments blanked, so a docstring's example is not code. */
const code = (path: string) =>
  readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const READS_A_KEY = /\b(?:e|ev|evt|event)\.(?:key|code)\b|addEventListener\(\s*'keydown'/
const USES_A_ROW = /from '[^']*(?:\/chord|\/componentKeys)'/

describe('component keys', () => {
  it('every hand-written key handler matches through a row', () => {
    const offenders = sourceFiles().filter((f) => {
      if (f in EXEMPT) return false
      const text = code(f)
      return READS_A_KEY.test(text) && !USES_A_ROW.test(text)
    })
    expect(
      offenders,
      'These read a key by hand. Give the key a row in common/keyboard/componentKeys.ts ' +
        '(or make it an action) and match it with `pressed`:',
    ).toEqual([])
  })
})
