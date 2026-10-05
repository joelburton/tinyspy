// cs-unmet

import { describe, expect, it } from 'vitest'
import { gametypes } from '@/gametypes'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import type { EndOutcome, GameEndedReason } from '@/common/terminal/gameEnding'

/**
 * The **summary** every game renders, per play state, checked by
 * RUNNING each manifest's `summaryFor` over the states it can reach
 * (docs/game-summary.md).
 *
 * `npm run report:summaries` prints every line as a table, for a reader who wants to
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
 * A family whose summary reads the game's `summary_data` — the shape a game takes when it
 * converts onto the page blobs (plans/seat-view.md). The families still in the old shape above
 * convert one game at a time, and this becomes the only shape once the last does.
 *
 * An ending case names the outcome and reason, and the winner where the summary names one;
 * `ending.by` is always alice.
 */
type EndingCase = { outcome: EndOutcome; reason: GameEndedReason; detail?: string; winner?: string }
type GameEndingCase = [ending: EndingCase, summary: Record<string, unknown>, note: string]
type GameEndingFamily = {
  /** The mid-game `summary_data`, every key present as the builder writes it. */
  live: Record<string, unknown>
  shared?: GameEndingCase[]
  coop?: GameEndingCase[]
  compete?: GameEndingCase[]
}

/** The club a label names its players from; every case's winner and ender is alice. */
const MEMBERS: Member[] = [{ id: 'u-alice', username: 'alice', color: 'red' }]

/** A family in the new shape, told apart from an old one by its `live` blob. */
function isGameEndingFamily(fam: Family | GameEndingFamily): fam is GameEndingFamily {
  return 'live' in fam
}

/**
 * Per gametype FAMILY (baseGametype): a realistic mid-game status blob, then the terminal
 * cases that family actually reaches, per mode.
 *
 * **The status keys must match what the RPC really writes.** A missing key silently falls
 * back to the label's `?? 0` / `?? 'someone'` and prints a plausible-looking lie — that is
 * not a hypothetical: an early version of this matrix omitted spellingbee's `target_rank`
 * on a Stop and "found" a bug the SQL does not have (every spellingbee ending writes
 * target_rank). Check the RPC before adding a case.
 */
// The coop team at 21 of 50 points (rank 3) chasing Genius; the required set is 30 words.
const BEE_TEAM = { nFoundWords: 7, foundWordsScore: 21, rankIdx: 3, targetRankIdx: 6 }
const BEE_LIVE = { team: BEE_TEAM, nReqdWords: 30, reqdWordsScore: 50, targetRankIdx: 6 }
const BEE_RACE = { team: null, nReqdWords: 30, reqdWordsScore: 50, targetRankIdx: 6 }
/** boggle's coop team figures, as `boggle._make_json_found_counts` writes them. */
const BOGGLE_TEAM = {
  nFoundWords: 7, foundWordsScore: 21, nFoundReqdWords: 5, foundReqdWordsScore: 15,
  nFoundBonusWords: 2, foundBonusWordsScore: 6,
}

// spellingbee and wordwheel end alike and their builders write the same blob, so one matrix.
const BEE_CASES: GameEndingFamily = {
  live: BEE_LIVE,
  coop: [
    [{ outcome: 'won', reason: 'reached_goal' }, { ...BEE_LIVE, team: { ...BEE_TEAM, nFoundWords: 20, foundWordsScore: 47, rankIdx: 6 } }, 'reached target'],
    [{ outcome: 'lost', reason: 'timeout' }, BEE_LIVE, 'timeout, target set'],
    [{ outcome: 'neutral', reason: 'timeout' }, { ...BEE_LIVE, team: { ...BEE_TEAM, targetRankIdx: null }, targetRankIdx: null }, 'timeout, no target'],
    [{ outcome: 'neutral', reason: 'stopped' }, BEE_LIVE, 'Stop'],
  ],
  compete: [
    [{ outcome: 'won', reason: 'reached_goal', winner: 'u-alice' }, BEE_RACE, 'someone hit the target'],
    [{ outcome: 'lost', reason: 'timeout' }, BEE_RACE, 'timeout'],
    [{ outcome: 'lost', reason: 'conceded' }, BEE_RACE, 'all conceded'],
    [{ outcome: 'neutral', reason: 'stopped' }, BEE_RACE, 'Stop'],
  ],
}

const CASES: Record<string, Family | GameEndingFamily> = {
  // No siblings — one manifest, one vocabulary.
  codenamesduet: {
    live: { team: { nFoundAgents: 12, nTurnsUsed: 4, maxTurns: 9, suddenDeath: false } },
    shared: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved' }, { team: { nFoundAgents: 15, nTurnsUsed: 7, maxTurns: 9, suddenDeath: false } }, 'won'],
      [{ outcome: 'lost', reason: 'fatal_move', detail: 'assassin' }, { team: { nFoundAgents: 12, nTurnsUsed: 5, maxTurns: 9, suddenDeath: false } }, 'assassin'],
      [{ outcome: 'lost', reason: 'fatal_move', detail: 'neutral' }, { team: { nFoundAgents: 12, nTurnsUsed: 9, maxTurns: 9, suddenDeath: true } }, 'a bystander in sudden death'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nFoundAgents: 12, nTurnsUsed: 5, maxTurns: 9, suddenDeath: false } }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nFoundAgents: 12, nTurnsUsed: 5, maxTurns: 9, suddenDeath: false } }, 'Stop'],
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
  // psychicnum._make_json_summary_data: `team` holds the found and used counts in coop and
  // is null in compete (plans/team-facts.md); the winner is the common ending's.
  psychicnum: {
    live: { team: { nFoundSecrets: 2, nGuessesUsed: 2 }, nReqdSecrets: 3, maxGuesses: 7 },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal' }, { team: { nFoundSecrets: 3, nGuessesUsed: 5 }, nReqdSecrets: 3, maxGuesses: 7 }, 'found them all'],
      [{ outcome: 'lost', reason: 'resource_exhausted' }, { team: { nFoundSecrets: 2, nGuessesUsed: 7 }, nReqdSecrets: 3, maxGuesses: 7 }, 'out of guesses'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nFoundSecrets: 2, nGuessesUsed: 4 }, nReqdSecrets: 3, maxGuesses: 7 }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nFoundSecrets: 2, nGuessesUsed: 4 }, nReqdSecrets: 3, maxGuesses: 7 }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', winner: 'u-alice' }, { team: null, nReqdSecrets: 3, maxGuesses: 7 }, 'won the race'],
      [{ outcome: 'lost', reason: 'resource_exhausted' }, { team: null, nReqdSecrets: 3, maxGuesses: 7 }, 'budgets exhausted'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, nReqdSecrets: 3, maxGuesses: 7 }, 'timeout'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, nReqdSecrets: 3, maxGuesses: 7 }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, nReqdSecrets: 3, maxGuesses: 7 }, 'Stop'],
    ],
  },
  // connections' summary_data, as its builder writes it: `team` is coop's two counts and
  // null in compete; the winner is the common ending's.
  connections: {
    live: { team: { nMatchedCats: 2, nMistakes: 1 }, maxMistakes: 4 },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal' }, { team: { nMatchedCats: 4, nMistakes: 1 }, maxMistakes: 4 }, 'solved'],
      [{ outcome: 'lost', reason: 'resource_exhausted' }, { team: { nMatchedCats: 2, nMistakes: 4 }, maxMistakes: 4 }, 'four mistakes'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nMatchedCats: 2, nMistakes: 1 }, maxMistakes: 4 }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nMatchedCats: 2, nMistakes: 1 }, maxMistakes: 4 }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', winner: 'u-alice' }, { team: null, maxMistakes: 4 }, 'won the race'],
      [{ outcome: 'lost', reason: 'resource_exhausted' }, { team: null, maxMistakes: 4 }, 'everyone hit four mistakes'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, maxMistakes: 4 }, 'timeout'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, maxMistakes: 4 }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, maxMistakes: 4 }, 'Stop'],
    ],
  },
  // The bee games' summary_data, as their twin builders write it: `team` is the coop team's
  // four figures and null in compete; the target rank is the game's, null when coop set none.
  spellingbee: BEE_CASES,
  wordwheel: BEE_CASES,
  // boggle._make_json_summary_data: `team` is the coop team's six counts and null in compete;
  // the target is the game's share of the required points, null when none was set; the top
  // score is compete's, null until the end.
  boggle: {
    live: { team: BOGGLE_TEAM, targetWinPercent: 65, topScore: null },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal', winner: 'u-alice' }, { team: BOGGLE_TEAM, targetWinPercent: 65, topScore: null }, 'reached the target'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: BOGGLE_TEAM, targetWinPercent: 65, topScore: null }, 'timeout, target set'],
      [{ outcome: 'neutral', reason: 'timeout' }, { team: BOGGLE_TEAM, targetWinPercent: null, topScore: null }, 'timeout, no target'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: BOGGLE_TEAM, targetWinPercent: 65, topScore: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', winner: 'u-alice' }, { team: null, targetWinPercent: 65, topScore: 70 }, 'reached the target'],
      [{ outcome: 'won', reason: 'timeout', winner: 'u-alice' }, { team: null, targetWinPercent: null, topScore: 90 }, 'top score at the buzzer (no target)'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, targetWinPercent: 65, topScore: 40 }, 'timeout, target set'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, targetWinPercent: null, topScore: 0 }, 'timeout, nobody scored'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, targetWinPercent: null, topScore: 0 }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, targetWinPercent: null, topScore: 40 }, 'Stop'],
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
  // wordle._make_json_summary_data: `team` holds the used count in coop and is null in compete
  // (plans/team-facts.md); the winner's count is compete's alone; the answer band is the
  // setup's.
  wordle: {
    live: { team: { nGuessesUsed: 3 }, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal' }, { team: { nGuessesUsed: 4 }, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null }, 'solved'],
      [{ outcome: 'lost', reason: 'resource_exhausted' }, { team: { nGuessesUsed: 6 }, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null }, 'out of guesses'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nGuessesUsed: 3 }, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nGuessesUsed: 3 }, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', winner: 'u-alice' }, { team: null, maxGuesses: 6, answerBand: 0, nWinnerGuesses: 4 }, 'someone won'],
      [{ outcome: 'lost', reason: 'resource_exhausted' }, { team: null, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null }, 'everyone out of guesses'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null }, 'timeout'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null }, 'Stop'],
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
function casesFor<C>(
  mode: string | undefined,
  fam: { shared?: C[]; coop?: C[]; compete?: C[] },
): C[] {
  return [...(fam.shared ?? []), ...(mode === 'compete' ? (fam.compete ?? []) : (fam.coop ?? []))]
}

/** A game's summary_data in the new shape: a null ending is a game still played. */
const makeSummaryData = (
  gametype: string,
  ending: EndingCase | null,
  own: Record<string, unknown>,
): SummaryData => ({
  id: 'g',
  gametype,
  title: 'A game',
  statusChangedAt: '2026-09-01T00:00:00Z',
  ended: ending !== null,
  outcome: ending?.outcome ?? null,
  ending: ending && { reason: ending.reason, detail: ending.detail ?? ending.reason, by: 'u-alice', winner: ending.winner ?? null },
  ...own,
})

/** A row in the OLD shape, for a game not yet on the page blobs; its summaryFor still reads
 *  `play_state` and `status`, which the common blob does not carry, so the cast is a lie the
 *  game's conversion removes. */
const row = (
  gametype: string,
  state: string,
  status: Record<string, unknown>,
  setup: Record<string, unknown>,
): SummaryData =>
  ({ id: 'g', gametype, play_state: state, is_terminal: state !== 'playing', status, setup }) as unknown as SummaryData

/** Every summary as a markdown table, one `| game | state | message |` row per case. */
function buildTable(): string {
  const lines = ['| game | state | status message |', '|---|---|---|']
  for (const m of gametypes) {
    const fam = CASES[m.baseGametype]
    if (!fam) continue
    if (isGameEndingFamily(fam)) {
      const labelOf = (ending: EndingCase | null, own: Record<string, unknown>) =>
        m.summaryFor(makeSummaryData(m.gametype, ending, own), MEMBERS)
      lines.push(`| **${m.gametype}** | playing | \`${labelOf(null, fam.live)}\` |`)
      for (const [ending, own, note] of casesFor(m.mode, fam)) {
        lines.push(
          `| | ${ending.outcome}/${ending.reason} — ${note} | \`${labelOf(ending, own)}\` |`,
        )
      }
      continue
    }
    const label = (state: string, status: Record<string, unknown>) =>
      m.summaryFor(row(m.gametype, state, status, fam.setup ?? {}), MEMBERS)
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

  it.runIf(process.env.REPORT === '1')('prints every summary (npm run report:summaries)', () => {
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
      let readsAsLive: boolean
      let unknown: string
      if (isGameEndingFamily(fam)) {
        // A game ending whose outcome and reason no game writes today.
        const futureEnding = {
          outcome: 'an_outcome_from_the_future',
          reason: 'a_reason_from_the_future',
        } as unknown as EndingCase
        const playing = m.summaryFor(makeSummaryData(m.gametype, null, fam.live), MEMBERS)
        unknown = m.summaryFor(makeSummaryData(m.gametype, futureEnding, fam.live), MEMBERS)
        readsAsLive = unknown === playing
      } else {
        const setup = fam.setup ?? {}
        const playing = m.summaryFor(row(m.gametype, 'playing', fam.playing, setup), MEMBERS)
        unknown = m.summaryFor(row(m.gametype, 'a_state_from_the_future', fam.playing, setup), MEMBERS)
        readsAsLive = unknown === playing
      }
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
      // A converted family has no play_state: its outcome and its reason are two columns,
      // so the overlap this test forbids cannot arise there.
      if (isGameEndingFamily(fam)) continue
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
