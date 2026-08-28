// cs-unmet

/**
 * EVERY FIELD COMPONENT HAS A TEST FILE.
 *
 * The field family exists to collapse difference: `AllFieldProps` gives them
 * one set of props, and `expectFieldContract` asserts each one actually WIRES
 * them, which the type cannot. Both of those only reach a component that
 * someone remembered to write a file for.
 *
 * This is the one thing a per-component file cannot do for itself. A new
 * `SliderField` landing with no test is invisible — nothing fails, nothing is
 * listed, and the family quietly has a member outside the contract. It is the
 * same reason a "simple" field gets a file at all: not because it needs a test
 * today, but so that there is somewhere obvious for one when it grows a
 * feature. A field with no home for its tests never gets any.
 *
 * **A field does not have to live in `fields/`.** `PuzzleSourceField` is
 * crosswords' own, and it was written with ad-hoc props — no `help`, no
 * `entryHelp`, no `disabled` — precisely because this guard only ever read one
 * directory. So it reads every `*Field.tsx` under `src/` now: the family is
 * defined by what a component IS, not by where it happens to sit.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIELDS_DIR = join(SRC, 'common/components/fields')

/**
 * Files in `fields/` that are not a field. Each is machinery the fields are
 * built FROM rather than a member of the family — and the first two have their
 * own test files anyway.
 */
const NOT_A_FIELD = new Set([
  'Field.tsx', // the shape every field has
  'StandardForm.tsx', // the form that holds them
  'fieldProps.ts', // the props they share
  'formState.ts', // the errors object they read
  'fieldContract.tsx', // the assertions they share
])

/** Every `*Field.tsx` under `src/` that is NOT in `fields/` — a game's own. */
function fieldsOutside(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('Field.tsx') && dir !== FIELDS_DIR) out.push(full)
    }
  }
  walk(SRC)
  return out
}

describe('the field family', () => {
  it('gives every component its own test file', () => {
    const components = [
      ...readdirSync(FIELDS_DIR)
        .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && !NOT_A_FIELD.has(f))
        .map((f) => join(FIELDS_DIR, f)),
      ...fieldsOutside(),
    ]
    // A sanity floor: if the glob silently matched nothing, an empty list would
    // pass this guard while proving nothing.
    expect(components.length).toBeGreaterThan(8)

    const missing = components
      .filter((f) => !existsSync(f.replace(/\.tsx$/, '.test.tsx')))
      .map((f) => f.slice(SRC.length + 1))
    expect(missing, 'field components with no test file — add one, even a short one').toEqual([])
  })

  it('holds a field OUTSIDE fields/ to the same contract', () => {
    // Having a test file is not the same as being held to the family's terms. A
    // game-local field is the one that drifts, because it is written next to the
    // game's own components and nothing about that neighbourhood suggests
    // `AllFieldProps`.
    const loose = fieldsOutside()
      .filter((f) => !readFileSync(f.replace(/\.tsx$/, '.test.tsx'), 'utf8').includes('expectFieldContract('))
      .map((f) => f.slice(SRC.length + 1))
    expect(loose, 'a *Field outside fields/ whose test never CALLS expectFieldContract').toEqual([])
  })

  it('lists nothing under NOT_A_FIELD that has since been deleted', () => {
    // The exemption list is the kind that rots: a file renamed away leaves an
    // entry excusing something that no longer exists, and the next real field
    // to take that name inherits the excuse.
    const stale = [...NOT_A_FIELD].filter((f) => !existsSync(join(FIELDS_DIR, f)))
    expect(stale, 'exemptions naming files that are gone').toEqual([])
  })
})
