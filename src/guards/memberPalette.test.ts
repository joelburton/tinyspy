// cs-audited-members

/**
 * **The member palette is spelled in five places, and nothing made them agree.**
 *
 * The eight color NAMES are written out in `MEMBER_COLORS` and in four separate
 * SQL sites: the CHECK on `common.profiles.color`, the array
 * `common.color_for_username` picks from, and the allow-lists that
 * `claim_username` (PN015) and `update_profile_color` (PN033) reject against.
 * Two of them carried a comment asking a human to keep them in sync — the
 * arrangement that works right up until it doesn't, and the reason this is a
 * test rather than a sixth comment.
 *
 * Drift is quiet in every direction, which is what makes it worth a guard. A
 * name the DB stores but `MEMBER_COLORS` has never heard of resolves to
 * `var(--member-NAME-fill-color)` against a token that does not exist, so the
 * disc takes the body-text fallback and merely looks wrong. A name the picker
 * offers but an allow-list rejects works all the way to the moment a player
 * saves it, then fails as a fault. A name missing from `color_for_username`
 * alone is quietest of all: nothing breaks, one color just never gets handed
 * out.
 *
 * **`color_for_username` also carries the palette's LENGTH**, as the `% 8` that
 * indexes its array. A ninth name added everywhere else would still leave that
 * function unable to return it, so the modulo is asserted alongside the names.
 *
 * **Compared as SETS.** The SQL spellings are membership tests and a hash
 * bucket; order carries no meaning in any of them. `MEMBER_COLORS` is ordered
 * on purpose — it is the order the swatch grid lays out — but that is the
 * picker's business, and asserting it here would fail a harmless reordering of
 * a list SQL has no opinion about.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MEMBER_COLORS } from '../common/members/memberColor'

const MIGRATION = 'supabase/migrations/20260615000000_common.sql'
const BEHAVIOR = 'supabase/sql/common.sql'

/** Each SQL site that writes the eight names out, and the text that finds it. */
const SPELLINGS = [
  {
    what: 'the CHECK on common.profiles.color',
    file: MIGRATION,
    anchor: 'color text not null check (color in',
  },
  {
    what: "common.color_for_username's array",
    file: BEHAVIOR,
    anchor: 'select (array[',
  },
  {
    what: "claim_username's PN015 allow-list",
    file: BEHAVIOR,
    anchor: 'if chosen_color not in',
  },
  {
    what: "update_profile_color's PN033 allow-list",
    file: BEHAVIOR,
    anchor: 'if new_color not in',
  },
]

const read = (file: string) => readFileSync(file, 'utf8')

/**
 * The single-quoted names in the bracketed list that follows `anchor` — the
 * first `(` or `[` after it, up to its closing mate.
 *
 * Returns `[]` when the anchor is gone, which the first test turns into a
 * failure: an extraction that silently stops matching passes just as quietly as
 * one that works.
 */
function namesAfter(file: string, anchor: string): string[] {
  const sql = read(file)
  const at = sql.indexOf(anchor)
  if (at === -1) return []
  const open = sql.slice(at).search(/[([]/) + at
  const close = sql.slice(open).search(/[)\]]/) + open
  if (close <= open) return []
  return [...sql.slice(open, close).matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)
}

const sorted = (names: readonly string[]) => [...names].sort()

describe('the member palette', () => {
  it('finds all four SQL spellings', () => {
    // Not a tautology: each list is located by a sentence in a large file, and
    // a reworded sentence would leave the comparison below matching one empty
    // array against another and going green.
    const missing = SPELLINGS.filter((s) => namesAfter(s.file, s.anchor).length === 0)
    expect(
      missing.map((s) => `${s.what} — no list found after "${s.anchor}" in ${s.file}`),
      'the guard can no longer find a palette it is supposed to be checking',
    ).toEqual([])
  })

  it('spells the same names in SQL as MEMBER_COLORS does', () => {
    const wrong: string[] = []
    for (const s of SPELLINGS) {
      const names = namesAfter(s.file, s.anchor)
      if (names.length === 0) continue // the test above reports it
      if (sorted(names).join(',') !== sorted(MEMBER_COLORS).join(',')) {
        wrong.push(`${s.what}: [${sorted(names)}] — MEMBER_COLORS has [${sorted(MEMBER_COLORS)}]`)
      }
    }
    expect(
      wrong,
      'a palette name the database and the frontend disagree about\n\n' + wrong.join('\n'),
    ).toEqual([])
  })

  it('sizes color_for_username to the palette', () => {
    const m = read(BEHAVIOR).match(/abs\(hashtext\(username\)\) % (\d+)/)
    expect(m, 'the modulo in common.color_for_username moved or was rewritten').not.toBeNull()
    expect(
      Number(m![1]),
      'color_for_username buckets usernames into a different number of colors than the palette has',
    ).toBe(MEMBER_COLORS.length)
  })
})
