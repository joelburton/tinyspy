import { describe, expect, it } from 'vitest'
import { games as GAMES } from './games'
import { ROSTER_KEY, type SetupRow } from './common/lib/game/setupRows'
import type { Member } from './common/lib/games'

/**
 * The roster-wide guard on setup recaps (docs/pdf.md → Setup rows).
 *
 * Each game exports `setupRows()` from `<game>/lib/setupSummary.ts`, and BOTH
 * its info column and its PDF render that one array. Before it, the two lists
 * were written by hand in different files and drifted — in labels everywhere,
 * and in psychicnum's case into reporting different FACTS on paper than on
 * screen. A convention that two lists agree is exactly what failed, so the
 * agreement is asserted here instead.
 *
 * What this pins:
 *
 *   1. **Every game has a summary** (or is named in `NO_RECAP` with a reason),
 *      so a new game can't dodge the rule by not having a module.
 *   2. **Every key of a game's default setup produces a row** (or is named in
 *      `NOT_A_ROW` with a reason). Adding a setup field therefore forces a
 *      decision about whether players should see it recorded.
 *   3. **The roster leads**, since who played is the most useful line on a
 *      record you keep.
 *   4. **Values are plain strings** — the PDF is WinAnsi and can't take a React
 *      node, so the paper is the lower bound for what a shared row may carry.
 */

/** Modules keyed by game folder — the folder is the manifest's `schema`. */
const MODULES = import.meta.glob<{
  setupRows: (setup: never, mode: 'coop' | 'compete', players: Member[], ...rest: never[]) => SetupRow[]
}>('./*/lib/setupSummary.ts', { eager: true })

/** Games with NO setup recap on either surface — nothing to unify. */
const NO_RECAP: Record<string, string> = {
  crosswords:
    'never had a recap on either surface: no <SetupDisclosure>, and its PDF is the ' +
    'whole-cloth ported printer with no Setup block. Adding one would be new UI, ' +
    'not the unification this rule is about.',
}

/**
 * Setup keys that deliberately produce no row, and why. Everything else must
 * appear — that's the point of the test.
 */
const NOT_A_ROW: Record<string, string> = {
  // Conditional controls: they produce a row only when they applied, and these
  // fixtures use each game's DEFAULTS, where they're off/unset. "A control that
  // didn't apply produces no row" is the rule, so their absence here is correct.
  first_turn_user_id: 'only with turn-by-turn coop, and never present in defaults',
  coop_style: 'coop-only, and only with 2+ players',
  target_rank: 'omitted unless a target was chosen',
  unique_letters: 'omitted unless the constraint is on',
  ai_count: 'compete-only, and only when AI seats were taken',
  ai_level: 'reported inside the AI row, not on its own',
  custom_center: 'a board-generation override, not a recap line',
  custom_letters: 'a board-generation override, not a recap line',
  // Puzzle-identity plumbing: the recap shows ONE "Puzzle" row built from these.
  puzzle_id: 'folded into the single Puzzle row',
  puzzleId: 'folded into the single Puzzle row',
  date: 'folded into the single Puzzle row',
  series: 'folded into the single Puzzle row',
  source: 'folded into the single Puzzle row',
  filename: 'folded into the single Puzzle row',
  board: 'an uploaded board, not a choice to recap',
  // bananagrams' word-check bands qualify `word_check`, so they follow it and
  // vanish with it — and the default is 'off'. (This test is what found them
  // missing from BOTH surfaces.)
  dict_2: 'shown only when word-checking is on',
  dict_3plus: 'shown only when word-checking is on',
}

/**
 * Setup keys holding a NESTED OBJECT, whose parts appear as their own rows
 * keyed `<key>.<part>` — so the parent key needs no row of its own.
 *
 * Separate from NOT_A_ROW because this excuse makes a CLAIM, and the test below
 * checks it. boggle's `constraints` sat in NOT_A_ROW saying "its parts are
 * separate rows" when its parts were on neither surface: the guard read as
 * green while the board's own generation targets went unrecorded on screen and
 * on paper. An exemption the test can verify is worth four that it can't.
 */
const PARTS_AS_ROWS: Record<string, string> = {
  constraints: 'boggle board-generation targets — one row per min/max pair',
}

const PLAYERS: Member[] = [
  { user_id: 'u1', username: 'ada', color: 'blue' },
  { user_id: 'u2', username: 'bea', color: 'green' },
]

/** One manifest per game FAMILY — a coop/compete pair shares a summary module. */
const BY_SCHEMA = new Map(GAMES.map((g) => [g.schema, g]))

describe('setup recaps', () => {
  it('every game either has a summary module or is a documented exception', () => {
    const missing = [...BY_SCHEMA.keys()].filter(
      (schema) => !MODULES[`./${schema}/lib/setupSummary.ts`] && !NO_RECAP[schema],
    )
    expect(missing, 'add <game>/lib/setupSummary.ts, or document it in NO_RECAP').toEqual([])
  })

  for (const [schema, manifest] of BY_SCHEMA) {
    const mod = MODULES[`./${schema}/lib/setupSummary.ts`]
    if (!mod) continue

    describe(schema, () => {
      // Extra args (waffle's par, connections' puzzle date) are game-specific;
      // passing none exercises the shape, and TS pins the real call sites.
      const rows = mod.setupRows(
        manifest.setupForm.defaults as never,
        manifest.mode,
        PLAYERS,
        ...([0, null] as never[]),
      )

      it('leads with the roster', () => {
        expect(rows[0]?.key).toBe(ROSTER_KEY)
      })

      it('has plain-string values (the PDF is WinAnsi)', () => {
        for (const r of rows) {
          expect(typeof r.label, `${r.key} label`).toBe('string')
          expect(typeof r.value, `${r.key} value`).toBe('string')
        }
      })

      it('covers every key of the default setup', () => {
        const shown = new Set(rows.map((r) => r.key))
        const uncovered = Object.keys(manifest.setupForm.defaults as object).filter(
          (k) => !shown.has(k) && !NOT_A_ROW[k] && !PARTS_AS_ROWS[k],
        )
        expect(
          uncovered,
          'each setup key needs a row, or an entry in NOT_A_ROW saying why not',
        ).toEqual([])
      })

      it('makes good on every PARTS_AS_ROWS promise', () => {
        const defaults = manifest.setupForm.defaults as Record<string, unknown>
        for (const key of Object.keys(PARTS_AS_ROWS)) {
          const nested = defaults[key]
          // Only a nested object that actually HOLDS something owes rows — an
          // absent or all-empty one is a choice nobody made, and the rule says
          // that produces no row.
          if (!nested || typeof nested !== 'object') continue
          const set = Object.values(nested as Record<string, unknown>).some((v) => v != null)
          if (!set) continue
          const parts = rows.filter((r) => r.key.startsWith(`${key}.`))
          expect(
            parts.length,
            `\`${key}\` is excused from having a row because its parts are ` +
              `separate rows — so it must emit at least one \`${key}.*\` row`,
          ).toBeGreaterThan(0)
        }
      })
    })
  }
})
