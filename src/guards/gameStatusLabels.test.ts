// cs-unmet

import { describe, expect, it } from 'vitest'
import { gametypes } from '@/gametypes'
import type { CommonGameListRow } from '@/common/manifest/gameManifest'

/**
 * The club-page **status line** every game renders, per play state, checked by
 * RUNNING each manifest's `labelFor` over the states it can reach
 * (docs/game-status-labels.md).
 *
 * `npm run report:labels` prints every line as a table, for a reader who wants to
 * see what the games actually say. It is a vitest file rather than a script run
 * through tsx because it imports the manifests, which pull in lazy React components
 * and CSS modules, and vitest already resolves both.
 *
 * **When a game gains a play state, add it to CASES.** The matrix is deliberately
 * hand-written: it encodes which states each game can actually reach and which `status`
 * keys its label reads. A generated cross-product would bury the real states in noise
 * (most games echo an "else" branch for states they never see).
 */

const W = { winner_username: 'alice' }

/** A label row: the state, the status blob its label reads, and how to name the case. */
type Case = [state: string, status: Record<string, unknown>, note: string]
/** Cases are split by MODE because a coop manifest never sees `won_compete` and a compete
 *  one never sees coop's `won` — mixing them generates rows for unreachable states, with
 *  whatever the label's `?? 0` fallbacks invent. `shared` is for the mode-less games. */
type Family = {
  playing: Record<string, unknown>
  /** The game's frozen setup, for the labels that read a setup choice (`dict`, a budget). */
  setup?: Record<string, unknown>
  shared?: Case[]
  coop?: Case[]
  compete?: Case[]
}

/**
 * Per gametype FAMILY (baseGametype): a realistic mid-game status blob, then the terminal
 * cases that family actually reaches, per mode.
 *
 * **The status keys must match what the RPC really writes.** A missing key silently falls
 * back to the label's `?? 0` / `?? 'someone'` and prints a plausible-looking lie — that is
 * not a hypothetical: an early version of this matrix omitted spellingbee's `target_rank`
 * on manual end and "found" a bug that the SQL had already fixed (it re-emits target_rank
 * for exactly this reason; see the comment in spellingbee.end_game). Check the RPC before
 * adding a case.
 */
const CASES: Record<string, Family> = {
  // No siblings — one manifest, one vocabulary.
  codenamesduet: {
    playing: { found_agents_count: 12, turns_remaining: 5 },
    shared: [
      ['sudden_death', { found_agents_count: 12 }, 'sudden death'],
      ['won', { found_agents_count: 15, reason: 'solved' }, 'won'],
      ['lost', { found_agents_count: 12, reason: 'assassin' }, 'assassin'],
      ['lost', { found_agents_count: 12, reason: 'turns' }, 'out of turns'],
      ['lost', { found_agents_count: 12, reason: 'timeout' }, 'timeout'],
      ['ended', { found_agents_count: 12, reason: 'manual' }, 'manual end'],
    ],
  },
  // strands' coop loss is the clock alone: the roster's rule is "you lose if
  // the game had a reachable end and you didn't reach it", and finding every
  // theme word is exactly such an end (docs/states.md).
  strands: {
    // words_found ONLY — the TOTAL never reaches `status`, because a
    // club-readable blob announcing "this board holds 6 words" would leak part
    // of a deliberately shielded puzzle.
    playing: { words_found: 2 },
    shared: [['ended', { reason: 'manual', words_found: 2 }, 'manual end']],
    coop: [
      ['won', { reason: 'solved', words_found: 6 }, 'found them all'],
      ['lost', { reason: 'timeout', words_found: 2 }, 'timeout'],
    ],
    // Compete publishes NOTHING mid-race — `status` is club-readable, so a
    // count there would leak what the guesses RLS protects, and the
    // fewest-hints winner isn't known until everyone stops. The terminal
    // labels name the MARGIN rather than the finish order.
    compete: [
      ['won_compete', { reason: 'solved', best_hints: 0 }, 'won on 0 hints'],
      ['lost_compete', { reason: 'timeout' }, 'timeout'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
      ['lost_compete', { reason: 'unsolved' }, 'nobody solved it'],
    ],
  },
  psychicnum: {
    playing: { guesses_used: 2, found_secrets_count: 2, required_secrets_count: 3 },
    // The budget the mid-game line reads guesses_used against.
    setup: { max_guesses: 7 },
    shared: [['ended', { reason: 'manual', found_secrets_count: 2, required_secrets_count: 3 }, 'manual end']],
    coop: [
      ['won', W, 'found it'],
      ['lost', { reason: 'exhausted', found_secrets_count: 2, required_secrets_count: 3 }, 'out of guesses'],
      ['lost', { reason: 'timeout', found_secrets_count: 2, required_secrets_count: 3 }, 'timeout'],
    ],
    compete: [
      ['won_compete', W, 'won the race'],
      ['lost_compete', { reason: 'exhausted' }, 'budgets exhausted'],
      ['lost_compete', { reason: 'timeout' }, 'timeout'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
    ],
  },
  connections: {
    playing: { found_categories_count: 2, mistake_count: 1 },
    shared: [['ended', { reason: 'manual', found_categories_count: 2 }, 'manual end']],
    coop: [
      ['won', { found_categories_count: 4, mistake_count: 1 }, 'solved'],
      ['lost', { reason: 'mistakes', found_categories_count: 2 }, 'four mistakes'],
      ['lost', { reason: 'timeout', found_categories_count: 2 }, 'timeout'],
    ],
    compete: [
      ['won_compete', W, 'won the race'],
      ['lost_compete', { reason: 'mistakes' }, 'everyone hit four mistakes'],
      ['lost_compete', { reason: 'timeout' }, 'timeout'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
    ],
  },
  spellingbee: {
    playing: { found_words_score: 21, required_words_score: 50, found_words_count: 7, required_words_count: 30, target_rank: 6 },
    coop: [
      ['won', { reason: 'target', target_rank: 6, found_words_score: 47, required_words_score: 50 }, 'reached target'],
      ['lost', { reason: 'timeout', target_rank: 6, found_words_score: 21, required_words_score: 50, found_words_count: 7, required_words_count: 30 }, 'timeout, target set'],
      ['ended', { reason: 'timeout', target_rank: null, found_words_score: 21, required_words_score: 50, found_words_count: 7, required_words_count: 30 }, 'timeout, no target'],
      ['ended', { reason: 'manual', target_rank: 6, found_words_score: 21, required_words_score: 50, found_words_count: 7, required_words_count: 30 }, 'manual end'],
    ],
    compete: [
      ['won_compete', { target_rank: 6, ...W }, 'someone hit the target'],
      // end_game re-emits target_rank precisely so this doesn't read "at Start".
      ['lost_compete', { reason: 'timeout', target_rank: 6 }, 'timeout'],
      ['ended', { reason: 'manual', target_rank: 6 }, 'manual end'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
    ],
  },
  wordwheel: {
    playing: { found_words_score: 21, required_words_score: 50, found_words_count: 7, required_words_count: 30, target_rank: 6 },
    coop: [
      ['won', { reason: 'target', target_rank: 6, found_words_score: 47, required_words_score: 50 }, 'reached target'],
      ['lost', { reason: 'timeout', target_rank: 6, found_words_score: 21, required_words_score: 50, found_words_count: 7, required_words_count: 30 }, 'timeout, target set'],
      ['ended', { reason: 'timeout', target_rank: null, found_words_score: 21, required_words_score: 50, found_words_count: 7, required_words_count: 30 }, 'timeout, no target'],
      ['ended', { reason: 'manual', target_rank: 6, found_words_score: 21, required_words_score: 50, found_words_count: 7, required_words_count: 30 }, 'manual end'],
    ],
    compete: [
      ['won_compete', { target_rank: 6, ...W }, 'someone hit the target'],
      ['lost_compete', { reason: 'timeout', target_rank: 6 }, 'timeout'],
      ['ended', { reason: 'manual', target_rank: 6 }, 'manual end'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
    ],
  },
  // boggle's terminal state now depends on whether a TARGET was set —
  // setup.win_percent, which the label reads off the row's setup.
  boggle: {
    playing: { found_words_count: 7, found_words_score: 21, leaderboard: [{}, {}] },
    setup: { win_percent: 65 },
    coop: [
      ['won', { reason: 'target', found_words_count: 30, found_words_score: 90 }, 'reached target'],
      ['lost', { reason: 'timeout', found_words_count: 7, found_words_score: 21 }, 'timeout, target set'],
      ['ended', { reason: 'timeout', found_words_count: 7, found_words_score: 21 }, 'timeout, no target'],
      ['ended', { reason: 'manual', found_words_count: 7, found_words_score: 21 }, 'manual end'],
    ],
    compete: [
      ['won_compete', { reason: 'target', ...W }, 'reached target'],
      ['won_compete', { reason: 'timeout', top_score: 90, ...W }, 'top score at the buzzer (no target)'],
      ['won_compete', { reason: 'timeout', top_score: 90 }, 'tied top score (no target)'],
      ['lost_compete', { reason: 'timeout' }, 'timeout, target set'],
      ['lost_compete', { reason: 'timeout', leaderboard: [] }, 'timeout, nobody scored'],
      ['ended', { reason: 'manual' }, 'manual end'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
    ],
  },
  bananagrams: {
    playing: { bunch_remaining: 12 },
    shared: [
      ['won', W, 'someone went out'],
      ['lost', { reason: 'timeout' }, 'timeout'],
      ['lost', { reason: 'conceded' }, 'all conceded'],
      ['ended', { reason: 'manual' }, 'manual end'],
    ],
  },
  waffle: {
    playing: { swaps_used: 4, max_swaps: 12 },
    setup: { difficulty: 3 },
    shared: [
      // No 'revealed' case: the mid-game give-up that wrote it is gone
      // (2026-08-03) — revealing is a display decision on an already-ended
      // game now, so the only reason a manual end can carry is 'manual'.
      ['ended', { reason: 'manual' }, 'manual end'],
    ],
    coop: [
      ['won', { swaps_used: 9, max_swaps: 12 }, 'solved'],
      ['lost', { reason: 'exhausted' }, 'out of swaps'],
      ['lost', { reason: 'timeout' }, 'timeout'],
    ],
    compete: [
      ['won_compete', { reason: 'solved', winner_swaps: 8, ...W }, 'someone won'],
      ['lost_compete', { reason: 'exhausted' }, 'everyone out of swaps'],
      ['lost_compete', { reason: 'timeout' }, 'timeout'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
    ],
  },
  wordle: {
    playing: { guesses_used: 3, max_guesses: 6 },
    setup: { answer_band: 0 },
    shared: [
      // No 'revealed' case: the mid-game give-up that wrote it is gone
      // (2026-08-03) — revealing is a display decision on an already-ended
      // game now, so the only reason a manual end can carry is 'manual'.
      ['ended', { reason: 'manual' }, 'manual end'],
    ],
    coop: [
      ['won', { reason: 'solved', guesses_used: 4, max_guesses: 6 }, 'solved'],
      ['lost', { reason: 'exhausted', guesses_used: 6, max_guesses: 6 }, 'out of guesses'],
      ['lost', { reason: 'timeout', guesses_used: 3, max_guesses: 6 }, 'timeout'],
    ],
    compete: [
      ['won_compete', { reason: 'solved', winner_guesses: 4, ...W }, 'someone won'],
      ['lost_compete', { reason: 'exhausted' }, 'everyone out of guesses'],
      ['lost_compete', { reason: 'timeout' }, 'timeout'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
    ],
  },
  stackdown: {
    playing: { found_words_count: 3, required_words_count: 6 },
    setup: { band: 3 },
    shared: [['ended', { reason: 'manual', found_words_count: 3, required_words_count: 6 }, 'manual end']],
    coop: [
      ['won', { reason: 'cleared', found_words_count: 6, required_words_count: 6 }, 'cleared'],
      // The clock is stackdown's ONLY loss — no move budget, and every board
      // is guaranteed clearable.
      ['lost', { reason: 'timeout', found_words_count: 3, required_words_count: 6 }, 'timeout'],
    ],
    compete: [
      ['won_compete', W, 'someone won'],
      ['lost_compete', { reason: 'timeout' }, 'timeout'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
    ],
  },
  scrabble: {
    playing: { team_score: 152, bag_count: 7 },
    shared: [['ended', { reason: 'manual', team_score: 152 }, 'manual end']],
    coop: [
      // No coop win state: every finish is `ended`, only the clock loses.
      ['ended', { reason: 'complete', team_score: 152 }, 'bag empty'],
      ['lost', { reason: 'timeout', team_score: 152 }, 'timeout'],
    ],
    compete: [
      ['won_compete', { winner_score: 312, ...W }, 'highest score'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
    ],
  },
  crosswords: {
    playing: { title: 'Sun 2026-07-04' },
    shared: [['ended', { reason: 'manual' }, 'manual end']],
    coop: [
      ['won', {}, 'solved'],
      ['lost', { reason: 'timeout' }, 'timeout'],
    ],
    compete: [
      ['won_compete', W, 'first to finish'],
      ['lost_compete', { reason: 'timeout' }, 'timeout'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
    ],
  },
  // letterboxed's compete race ENDS on the first solve (the bar is "cover the
  // twelve inside the cap"), so a win names the winner. A TIMEOUT instead
  // resolves on the most letters covered, which is a different sentence — hence
  // two won_compete rows. A manual stop is 'ended' in both modes.
  // setgame's status is public in BOTH modes — every claim happened face-up on
  // a shared table — so unlike wordle's or stackdown's compete blobs there is
  // nothing withheld mid-game. The interesting labels are the two endings the
  // rest of the roster doesn't have: a coop win that STRANDS cards (the normal
  // ending; a full clear is ~2% of games and says so), and a compete tie, which
  // is a real reason here because the ranking has no speed tiebreak.
  setgame: {
    // The deck is a SETUP fact, and the label needs it: "perfect clear" is
    // `sets * 3 === deck size`, derived rather than stored.
    setup: { deck: 'full' },
    playing: { sets_found: 6, deck_left: 45 },
    coop: [
      ['won', { reason: 'cleared', sets_found: 24 }, 'deck cleared'],
      ['won', { reason: 'cleared', sets_found: 27 }, 'perfect clear'],
      ['lost', { reason: 'timeout', sets_found: 9 }, 'timeout'],
      ['ended', { reason: 'manual', sets_found: 9 }, 'manual end'],
    ],
    compete: [
      [
        'won_compete',
        {
          reason: 'cleared',
          sets_found: 24,
          winner_username: 'alice',
          leaderboard: [
            { user_id: 'a', username: 'alice', sets_found: 14, won: true },
            { user_id: 'b', username: 'bob', sets_found: 10, won: false },
          ],
        },
        'most sets',
      ],
      [
        'won_compete',
        {
          reason: 'timeout',
          sets_found: 24,
          winner_user_id: null,
          leaderboard: [
            { user_id: 'a', username: 'alice', sets_found: 12, won: true },
            { user_id: 'b', username: 'bob', sets_found: 12, won: true },
          ],
        },
        'tied — co-winners',
      ],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
      ['lost_compete', { reason: 'timeout' }, 'nobody scored'],
      ['ended', { reason: 'manual', sets_found: 9 }, 'manual end'],
    ],
  },
  letterboxed: {
    playing: {
      max_words: 5,
      words_used: 2,
      letters_covered: 7,
      leaderboard: [
        { username: 'alice', letters_covered: 7, words_used: 2 },
        { username: 'bob', letters_covered: 4, words_used: 1 },
      ],
    },
    coop: [
      ['won', { solved: true, words_used: 3, letters_covered: 12, max_words: 5 }, 'covered the board'],
      ['lost', { solved: false, timed_out: true, letters_covered: 8 }, 'timeout'],
      ['ended', { solved: false, stopped: true, letters_covered: 8 }, 'manual end'],
    ],
    compete: [
      ['won_compete', { solved: true, words_used: 3, letters_covered: 12, ...W }, 'first to finish'],
      [
        'won_compete',
        {
          solved: false,
          timed_out: true,
          best_letters_covered: 9,
          leaderboard: [{ username: 'alice', letters_covered: 9, words_used: 3 }],
        },
        'timeout, most letters',
      ],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
      ['ended', { solved: false, stopped: true }, 'manual end'],
    ],
  },
  // wordiply writes 'won_compete' only when a winner is picked; otherwise 'ended'.
  wordiply: {
    playing: { guesses_used: 2, leaderboard: [{ guesses_used: 2 }, { guesses_used: 3 }] },
    coop: [
      ['ended', { length_score: 60, letter_count: 14, reason: 'complete' }, 'guesses used'],
      ['lost', { length_score: 60, letter_count: 14, reason: 'timeout' }, 'timeout'],
      ['ended', { length_score: 60, letter_count: 14, reason: 'manual' }, 'manual end'],
    ],
    compete: [
      ['won_compete', { leaderboard: [{ won: true, length_score: 60 }], ...W }, 'one winner'],
      ['won_compete', { leaderboard: [{ won: true, length_score: 60 }, { won: true, length_score: 60 }] }, 'co-winners'],
      ['lost_compete', { reason: 'conceded' }, 'all conceded'],
      ['lost_compete', { reason: 'timeout', leaderboard: [] }, 'timeout, nobody scored'],
      ['lost_compete', { reason: 'complete', leaderboard: [] }, 'out of guesses, nobody scored'],
      ['ended', { reason: 'manual' }, 'manual end'],
    ],
  },
}

/** The cases a manifest can actually reach: the shared ones plus its own mode's. */
function casesFor(mode: string | undefined, fam: Family): Case[] {
  return [...(fam.shared ?? []), ...(mode === 'compete' ? (fam.compete ?? []) : (fam.coop ?? []))]
}

const row = (
  gametype: string,
  state: string,
  status: Record<string, unknown>,
  setup: Record<string, unknown>,
): CommonGameListRow => ({
  id: 'g', gametype, play_state: state, is_terminal: state !== 'playing', status, setup,
})

/** Every status line as a markdown table, one `| game | state | message |` row per case. */
function buildTable(): string {
  const lines = ['| game | state | status message |', '|---|---|---|']
  for (const m of gametypes) {
    const fam = CASES[m.baseGametype]
    if (!fam) continue
    const label = (state: string, status: Record<string, unknown>) =>
      m.labelFor(row(m.gametype, state, status, fam.setup ?? {}))
    lines.push(`| **${m.gametype}** | playing | \`${label('playing', fam.playing)}\` |`)
    for (const [state, status, note] of casesFor(m.mode, fam)) {
      lines.push(`| | ${state} — ${note} | \`${label(state, status)}\` |`)
    }
  }
  return lines.join('\n')
}

describe('game status labels', () => {
  it('every gametype has a CASES family', () => {
    const missing = gametypes.map((m) => m.baseGametype).filter((g) => !CASES[g])
    expect(missing, 'No CASES entry — add one (see the docstring):').toEqual([])
  })

  it.runIf(process.env.REPORT === '1')('prints every status line (npm run report:labels)', () => {
    // Straight to stdout: the reporter does not show a passing test's console.log.
    process.stdout.write(`\n${buildTable()}\n\n`)
  })

  /**
   * A real invariant, not a snapshot: an unhandled play state must never render as the
   * game's IN-PROGRESS text. These four reach their in-progress string through a switch
   * `default:`, so a state they don't recognize makes a *finished* game read as `solving…`
   * (or `7 tiles left`) in the club list — quietly wrong, which is the worst kind.
   * Echoing the raw state (codenamesduet, bananagrams) is ugly but visibly wrong; a
   * distinct terminal-ish phrase (psychicnum's `lost`) at least doesn't lie about whether
   * the game is over.
   *
   * The allowlist below is today's offenders, pinned so the test guards against NEW ones
   * (the same shape as `VOCABULARY_COMPLETENESS` in cssTokens.test.ts). **It's a punch
   * list — delete each line as that game's fallback is fixed**, and the test tightens by
   * itself. Adding to it should feel like a decision, not a fix.
   */
  const UNKNOWN_READS_AS_LIVE = new Set<string>([
    // EMPTY, and worth keeping that way. All eight offenders (waffle, wordle,
    // stackdown and scrabble, both modes) were fixed in the 2026-08-01 status-
    // line pass: each label is now an exhaustive `switch` whose `default`
    // returns the raw play_state, so an unrecognized state renders visibly
    // wrong instead of quietly claiming the game is still live.
  ])

  it('no NEW game renders an unknown state as its in-progress label', () => {
    const offenders: string[] = []
    const fixed: string[] = []
    for (const m of gametypes) {
      const fam = CASES[m.baseGametype]
      if (!fam) continue
      const setup = fam.setup ?? {}
      const playing = m.labelFor(row(m.gametype, 'playing', fam.playing, setup))
      const unknown = m.labelFor(row(m.gametype, 'a_state_from_the_future', fam.playing, setup))
      const readsAsLive = unknown === playing
      if (readsAsLive && !UNKNOWN_READS_AS_LIVE.has(m.gametype)) {
        offenders.push(`${m.gametype} → "${unknown}"`)
      }
      if (!readsAsLive && UNKNOWN_READS_AS_LIVE.has(m.gametype)) fixed.push(m.gametype)
    }
    expect(
      offenders,
      'These render an UNKNOWN play state exactly like an in-progress one, so a finished ' +
        'game would look live in the club list. Give the fallback a distinct phrase:\n' +
        offenders.join('\n'),
    ).toEqual([])
    // Keep the punch list honest in the other direction too.
    expect(
      fixed,
      `Fixed — remove from UNKNOWN_READS_AS_LIVE: ${fixed.join(', ')}`,
    ).toEqual([])
  })

  /**
   * states.md's vocabulary invariant: `play_state` names the VERDICT,
   * `status.reason` names the CAUSE, and no string may serve both jobs. The
   * split is load-bearing, not stylistic — status-blob merges mean an
   * inherited `reason` key reads as data, so a value that could be either
   * side would be genuinely ambiguous in a stored row.
   *
   * The play_states come from this file's CASES matrix (whose charter is
   * "every reachable state, per game"); the reasons are the roster table in
   * docs/states.md §"status.reason names the CAUSE" plus every reason a
   * fixture row carries — so a reason first introduced in CASES is checked
   * even before someone remembers to add it to the transcribed list.
   */
  const ROSTER_REASONS = [
    'timeout', 'manual', 'conceded', 'exhausted', 'mistakes', 'assassin', 'turns',
    'solved', 'target', 'cleared', 'complete', 'blocked', 'revealed',
  ]

  it('no reason value doubles as a play_state value (states.md)', () => {
    const playStates = new Set(['playing'])
    const reasons = new Set(ROSTER_REASONS)
    for (const fam of Object.values(CASES)) {
      for (const [state, status] of [...(fam.shared ?? []), ...(fam.coop ?? []), ...(fam.compete ?? [])]) {
        playStates.add(state)
        if (typeof status.reason === 'string') reasons.add(status.reason)
      }
    }
    expect(
      [...reasons].filter((r) => playStates.has(r)),
      'These strings are used as BOTH a play_state and a reason — states.md forbids ' +
        'the overlap (the verdict and the cause are different questions):',
    ).toEqual([])
  })
})
