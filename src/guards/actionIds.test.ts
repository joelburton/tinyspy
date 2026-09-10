// cs-unmet

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACTIONS } from '../common/actions/registry'

/**
 * Guard: an action is spelled the same way twice.
 *
 * An action has two names — `'act-new-game'` in the registry and `actNewGame`
 * for the value a component binds it to — and they exist so that either one
 * finds every trace of the action in one grep. That only holds while they
 * agree, and nothing in the type system relates a string literal to a variable
 * name, so it is asserted here:
 *
 *   - every registry id is `act-` plus lowercase words;
 *   - every `useBoundAction('act-x-y', …)` in `src/` is assigned to `actXY`.
 *
 * The second check reads the source rather than the types on purpose — the
 * variable name is not a value and there is nothing else to ask.
 *
 * What is deliberately NOT here: whether two actions that can be on screen
 * together share a chord. That depends on what is mounted, which a static check
 * cannot know; the folder's `todo.md` carries the runtime version.
 */

const ID = /^act-[a-z0-9]+(-[a-z0-9]+)*$/

/** `act-new-game` → `actNewGame`. */
function boundName(id: string): string {
  return id
    .split('-')
    .map((word, i) => (i === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join('')
}

/** Every tracked TypeScript file under `src/`, via git so build output and
 *  anything untracked can't leak in. */
function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
}

describe('action ids', () => {
  it('finds files to read at all', () => {
    // Without this, a broken `git ls-files` would make the guard below pass
    // while reading nothing — the failure mode a guard must not have.
    expect(sourceFiles().length).toBeGreaterThan(100)
  })

  it('are all `act-` plus lowercase words', () => {
    const wrong = Object.keys(ACTIONS).filter((id) => !ID.test(id))
    expect(wrong, 'an id the registry cannot be grepped by').toEqual([])
  })

  it('are bound to a variable spelled the same way', () => {
    // `const actNewGame = useBoundAction('act-new-game'` — the whole shape, so
    // a binding assigned to nothing at all is caught too.
    const call = /(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*useBoundAction\(\s*'([^']+)'/g
    const wrong: string[] = []
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8')
      for (const [, variable, id] of src.matchAll(call)) {
        const want = boundName(id!)
        if (variable !== want) wrong.push(`${file}: ${variable} = useBoundAction('${id}') — want ${want}`)
      }
      // A bind that isn't assigned at all has no name to check, and the point
      // of the pair is that both spellings exist.
      const calls = [...src.matchAll(/useBoundAction\(/g)].length
      const assigned = [...src.matchAll(call)].length
      if (calls > assigned && !file.endsWith('useBoundAction.ts') && !file.includes('.test.')) {
        wrong.push(`${file}: a useBoundAction(…) that isn't assigned to an act… variable`)
      }
    }
    expect(
      wrong,
      "An action's two spellings have drifted. `useBoundAction('act-x-y', …)` " +
        'is assigned to `actXY`, so either name finds every trace of the ' +
        'action.\n\n' + wrong.join('\n'),
    ).toEqual([])
  })
})
