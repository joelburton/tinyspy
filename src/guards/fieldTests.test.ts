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
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIELDS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../common/components/fields')

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

describe('the field family', () => {
  it('gives every component its own test file', () => {
    const components = readdirSync(FIELDS_DIR).filter(
      (f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && !NOT_A_FIELD.has(f),
    )
    // A sanity floor: if the glob silently matched nothing, an empty list would
    // pass this guard while proving nothing.
    expect(components.length).toBeGreaterThan(8)

    const missing = components.filter(
      (f) => !existsSync(join(FIELDS_DIR, f.replace(/\.tsx$/, '.test.tsx'))),
    )
    expect(missing, 'field components with no test file — add one, even a short one').toEqual([])
  })

  it('lists nothing under NOT_A_FIELD that has since been deleted', () => {
    // The exemption list is the kind that rots: a file renamed away leaves an
    // entry excusing something that no longer exists, and the next real field
    // to take that name inherits the excuse.
    const stale = [...NOT_A_FIELD].filter((f) => !existsSync(join(FIELDS_DIR, f)))
    expect(stale, 'exemptions naming files that are gone').toEqual([])
  })
})
