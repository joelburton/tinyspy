// cs-unmet

import { describe, expect, it } from 'vitest'
import { gametypes } from '@/gametypes'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import type { EndOutcome, GameEndedReason } from '@/common/ending/gameEnding'

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
 * An ending case names the outcome and reason, and the winners where the summary names them —
 * every player ranked first, so a tie lists two; `ending.by` is always alice.
 */
type EndingCase = { outcome: EndOutcome; reason: GameEndedReason; detail?: string; winners?: string[] }
type GameEndingCase = [ending: EndingCase, summary: Record<string, unknown>, note: string]
type GameEndingFamily = {
  /** The mid-game `summary_data`, every key present as the builder writes it. */
  live: Record<string, unknown>
  shared?: GameEndingCase[]
  coop?: GameEndingCase[]
  compete?: GameEndingCase[]
}

/** The club a label names its players from; every case's winner and ender is alice, and bob
 *  shares a tie. */
const MEMBERS: Member[] = [
  { id: 'u-alice', username: 'alice', color: 'red' },
  { id: 'u-bob', username: 'bob', color: 'blue' },
]

/** Who reads every label: bob, who wins nothing unless a case ties him with alice. */
const MY_ID = 'u-bob'

/** A family in the new shape, told apart from an old one by its `live` blob. */
function isGameEndingFamily(fam: Family | GameEndingFamily): fam is GameEndingFamily {
  return 'live' in fam
}

/**
 * Per gametype FAMILY (baseGametype): a realistic mid-game status blob, then the ending
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
    [{ outcome: 'won', reason: 'reached_goal', detail: 'target' }, { ...BEE_LIVE, team: { ...BEE_TEAM, nFoundWords: 20, foundWordsScore: 47, rankIdx: 6 } }, 'reached target'],
    [{ outcome: 'won', reason: 'reached_goal', detail: 'solved' }, { ...BEE_LIVE, team: { ...BEE_TEAM, nFoundWords: 30, foundWordsScore: 50, rankIdx: 6, targetRankIdx: null }, targetRankIdx: null }, 'every required word (no target)'],
    [{ outcome: 'lost', reason: 'timeout' }, BEE_LIVE, 'timeout, target set'],
    [{ outcome: 'neutral', reason: 'timeout' }, { ...BEE_LIVE, team: { ...BEE_TEAM, targetRankIdx: null }, targetRankIdx: null }, 'timeout, no target'],
    [{ outcome: 'neutral', reason: 'stopped' }, BEE_LIVE, 'Stop'],
  ],
  compete: [
    [{ outcome: 'won', reason: 'reached_goal', detail: 'target', winners: ['u-alice'] }, BEE_RACE, 'someone hit the target'],
    [{ outcome: 'won', reason: 'reached_goal', detail: 'solved', winners: ['u-alice'] }, { ...BEE_RACE, targetRankIdx: null }, 'every required word first (no target)'],
    [{ outcome: 'won', reason: 'timeout', winners: ['u-alice'] }, { ...BEE_RACE, targetRankIdx: null }, 'top score at the countdown (no target)'],
    [{ outcome: 'won', reason: 'timeout', winners: ['u-alice', 'u-bob'] }, { ...BEE_RACE, targetRankIdx: null }, 'tied — co-winners (no target)'],
    [{ outcome: 'lost', reason: 'timeout' }, BEE_RACE, 'timeout'],
    [{ outcome: 'lost', reason: 'timeout' }, { ...BEE_RACE, targetRankIdx: null }, 'timeout, nobody scored (no target)'],
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
  // strands._make_json_summary_data: `team` holds coop's words found — the
  // TOTAL never reaches the summary, because a club-readable line announcing
  // "this board holds 6 words" would leak part of a deliberately shielded
  // puzzle. Compete's line says nothing mid-race; its end names the MARGIN,
  // `nWinnerHints`, rather than the finish order.
  strands: {
    live: { team: { nFoundPuzzleWords: 2, nHintsUsed: 1, hintPoints: 1 }, nWinnerHints: null, nHintsUsedById: null },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved' }, { team: { nFoundPuzzleWords: 8, nHintsUsed: 1, hintPoints: 0 }, nWinnerHints: null, nHintsUsedById: null }, 'found them all'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nFoundPuzzleWords: 2, nHintsUsed: 1, hintPoints: 1 }, nWinnerHints: null, nHintsUsedById: null }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nFoundPuzzleWords: 2, nHintsUsed: 1, hintPoints: 1 }, nWinnerHints: null, nHintsUsedById: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved', winners: ['u-alice'] }, { team: null, nWinnerHints: 0, nHintsUsedById: { 'u-alice': 0, 'u-bob': 2 } }, 'won on 0 hints'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, nWinnerHints: null, nHintsUsedById: { 'u-alice': 1, 'u-bob': 2 } }, 'timeout'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, nWinnerHints: null, nHintsUsedById: { 'u-alice': 1, 'u-bob': 2 } }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, nWinnerHints: null, nHintsUsedById: { 'u-alice': 1, 'u-bob': 2 } }, 'Stop'],
    ],
  },
  // psychicnum._make_json_summary_data: `team` holds the found and used counts in coop and
  // is null in compete (docs/common-schema.md → A player's facts); the winner
  // is the common ending's.
  psychicnum: {
    live: { team: { nFoundSecrets: 2, nGuessesUsed: 2 }, nReqdSecrets: 3, maxGuesses: 7 },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal' }, { team: { nFoundSecrets: 3, nGuessesUsed: 5 }, nReqdSecrets: 3, maxGuesses: 7 }, 'found them all'],
      [{ outcome: 'lost', reason: 'resource_exhausted' }, { team: { nFoundSecrets: 2, nGuessesUsed: 7 }, nReqdSecrets: 3, maxGuesses: 7 }, 'out of guesses'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nFoundSecrets: 2, nGuessesUsed: 4 }, nReqdSecrets: 3, maxGuesses: 7 }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nFoundSecrets: 2, nGuessesUsed: 4 }, nReqdSecrets: 3, maxGuesses: 7 }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', winners: ['u-alice'] }, { team: null, nReqdSecrets: 3, maxGuesses: 7 }, 'won the race'],
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
      [{ outcome: 'won', reason: 'reached_goal', winners: ['u-alice'] }, { team: null, maxMistakes: 4 }, 'won the race'],
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
      [{ outcome: 'won', reason: 'reached_goal', detail: 'target' }, { team: BOGGLE_TEAM, targetWinPercent: 65, topScore: null }, 'reached the target'],
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved' }, { team: BOGGLE_TEAM, targetWinPercent: null, topScore: null }, 'every required word (no target)'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: BOGGLE_TEAM, targetWinPercent: 65, topScore: null }, 'timeout, target set'],
      [{ outcome: 'neutral', reason: 'timeout' }, { team: BOGGLE_TEAM, targetWinPercent: null, topScore: null }, 'timeout, no target'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: BOGGLE_TEAM, targetWinPercent: 65, topScore: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'target', winners: ['u-alice'] }, { team: null, targetWinPercent: 65, topScore: 70 }, 'reached the target'],
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved', winners: ['u-alice'] }, { team: null, targetWinPercent: null, topScore: 80 }, 'every required word first (no target)'],
      [{ outcome: 'won', reason: 'timeout', winners: ['u-alice'] }, { team: null, targetWinPercent: null, topScore: 90 }, 'top score at the buzzer (no target)'],
      [{ outcome: 'won', reason: 'timeout', winners: ['u-alice', 'u-bob'] }, { team: null, targetWinPercent: null, topScore: 90 }, 'tied — co-winners (no target)'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, targetWinPercent: 65, topScore: 40 }, 'timeout, target set'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, targetWinPercent: null, topScore: 0 }, 'timeout, nobody scored'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, targetWinPercent: null, topScore: 0 }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, targetWinPercent: null, topScore: 40 }, 'Stop'],
    ],
  },
  // bananagrams._make_json_summary_data: the bunch's count beside the common part; the
  // winner is the common `ending.winner`. Compete only, so one vocabulary.
  bananagrams: {
    live: { nBunchTiles: 12 },
    shared: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'complete', winners: ['u-alice'] }, { nBunchTiles: 0 }, 'someone went out'],
      [{ outcome: 'lost', reason: 'timeout' }, { nBunchTiles: 12 }, 'timeout'],
      [{ outcome: 'lost', reason: 'conceded' }, { nBunchTiles: 12 }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { nBunchTiles: 12 }, 'Stop'],
    ],
  },
  // waffle._make_json_summary_data: `team` holds coop's swaps and is null in compete; the
  // winner's count is compete's alone; the band is the setup's.
  waffle: {
    live: { team: { nSwapsUsed: 4 }, maxSwaps: 12, parSwaps: 7, band: 3, nWinnerSwaps: null, nSwapsUsedById: null },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved' }, { team: { nSwapsUsed: 9 }, maxSwaps: 12, parSwaps: 7, band: 3, nWinnerSwaps: null, nSwapsUsedById: null }, 'solved'],
      [{ outcome: 'lost', reason: 'resource_exhausted', detail: 'exhausted' }, { team: { nSwapsUsed: 12 }, maxSwaps: 12, parSwaps: 7, band: 3, nWinnerSwaps: null, nSwapsUsedById: null }, 'out of swaps'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nSwapsUsed: 5 }, maxSwaps: 12, parSwaps: 7, band: 3, nWinnerSwaps: null, nSwapsUsedById: null }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nSwapsUsed: 5 }, maxSwaps: 12, parSwaps: 7, band: 3, nWinnerSwaps: null, nSwapsUsedById: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved', winners: ['u-alice'] }, { team: null, maxSwaps: 12, parSwaps: 7, band: 3, nWinnerSwaps: 8, nSwapsUsedById: { 'u-alice': 8, 'u-bob': 12 } }, 'someone won'],
      [{ outcome: 'lost', reason: 'resource_exhausted', detail: 'exhausted' }, { team: null, maxSwaps: 12, parSwaps: 7, band: 3, nWinnerSwaps: null, nSwapsUsedById: { 'u-alice': 9, 'u-bob': 12 } }, 'everyone out of swaps'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, maxSwaps: 12, parSwaps: 7, band: 3, nWinnerSwaps: null, nSwapsUsedById: { 'u-alice': 9, 'u-bob': 12 } }, 'timeout'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, maxSwaps: 12, parSwaps: 7, band: 3, nWinnerSwaps: null, nSwapsUsedById: { 'u-alice': 9, 'u-bob': 12 } }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, maxSwaps: 12, parSwaps: 7, band: 3, nWinnerSwaps: null, nSwapsUsedById: { 'u-alice': 9, 'u-bob': 12 } }, 'Stop'],
    ],
  },
  // wordle._make_json_summary_data: `team` holds the used count in coop and is null in compete
  // (docs/common-schema.md → A player's facts); the winner's count is compete's
  // alone; the answer band is the setup's.
  wordle: {
    live: { team: { nGuessesUsed: 3 }, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null, nGuessesUsedById: null },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal' }, { team: { nGuessesUsed: 4 }, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null, nGuessesUsedById: null }, 'solved'],
      [{ outcome: 'lost', reason: 'resource_exhausted' }, { team: { nGuessesUsed: 6 }, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null, nGuessesUsedById: null }, 'out of guesses'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nGuessesUsed: 3 }, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null, nGuessesUsedById: null }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nGuessesUsed: 3 }, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null, nGuessesUsedById: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', winners: ['u-alice'] }, { team: null, maxGuesses: 6, answerBand: 0, nWinnerGuesses: 4, nGuessesUsedById: { 'u-alice': 3, 'u-bob': 6 } }, 'someone won'],
      [{ outcome: 'lost', reason: 'resource_exhausted' }, { team: null, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null, nGuessesUsedById: { 'u-alice': 3, 'u-bob': 6 } }, 'everyone out of guesses'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null, nGuessesUsedById: { 'u-alice': 3, 'u-bob': 6 } }, 'timeout'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null, nGuessesUsedById: { 'u-alice': 3, 'u-bob': 6 } }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, maxGuesses: 6, answerBand: 0, nWinnerGuesses: null, nGuessesUsedById: { 'u-alice': 3, 'u-bob': 6 } }, 'Stop'],
    ],
  },
  // wordleone._make_json_summary_data: `team` holds the misses in coop and is null in compete;
  // the winner's misses are compete's alone; the band and difficulty are the setup's. Nothing
  // runs out, so no ending is resource_exhausted.
  wordleone: {
    live: { team: { nMisses: 2 }, legalBand: 2, difficulty: 'medium', nWinnerMisses: null, nMissesById: null },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal' }, { team: { nMisses: 1 }, legalBand: 2, difficulty: 'medium', nWinnerMisses: null, nMissesById: null }, 'solved'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nMisses: 3 }, legalBand: 2, difficulty: 'medium', nWinnerMisses: null, nMissesById: null }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nMisses: 3 }, legalBand: 2, difficulty: 'medium', nWinnerMisses: null, nMissesById: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', winners: ['u-alice'] }, { team: null, legalBand: 2, difficulty: 'medium', nWinnerMisses: 1, nMissesById: { 'u-alice': 1, 'u-bob': 4 } }, 'someone won'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, legalBand: 2, difficulty: 'medium', nWinnerMisses: null, nMissesById: { 'u-alice': 1, 'u-bob': 4 } }, 'timeout'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, legalBand: 2, difficulty: 'medium', nWinnerMisses: null, nMissesById: { 'u-alice': 1, 'u-bob': 4 } }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, legalBand: 2, difficulty: 'medium', nWinnerMisses: null, nMissesById: { 'u-alice': 1, 'u-bob': 4 } }, 'Stop'],
    ],
  },
  // stackdown._make_json_summary_data: `team` holds coop's three counts and is null in compete,
  // whose line names no count; the band is the setup's.
  stackdown: {
    live: { team: { nFoundWords: 3, nHintsUsed: 1, nSpoilersUsed: 0 }, nReqdWords: 6, band: 3 },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'cleared' }, { team: { nFoundWords: 6, nHintsUsed: 1, nSpoilersUsed: 0 }, nReqdWords: 6, band: 3 }, 'cleared'],
      // The clock is stackdown's ONLY loss — no move budget, and every board
      // is guaranteed clearable.
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nFoundWords: 3, nHintsUsed: 1, nSpoilersUsed: 0 }, nReqdWords: 6, band: 3 }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nFoundWords: 3, nHintsUsed: 1, nSpoilersUsed: 0 }, nReqdWords: 6, band: 3 }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'cleared', winners: ['u-alice'] }, { team: null, nReqdWords: 6, band: 3 }, 'first to clear'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, nReqdWords: 6, band: 3 }, 'timeout'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, nReqdWords: 6, band: 3 }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, nReqdWords: 6, band: 3 }, 'Stop'],
    ],
  },
  // scrabble._make_json_summary_data: `team` holds coop's score and is null in compete; the
  // winners and the score they share are compete's. Every tile played is coop's `won` — every
  // teammate ranked first — and the timer with tiles left over is no result; a compete tie that
  // the score before the leftovers cannot break shares rank 1.
  scrabble: {
    live: { team: { score: 152 }, nBagTiles: 47, winnerScore: null },
    coop: [
      [{ outcome: 'won', reason: 'resource_exhausted', detail: 'complete' }, { team: { score: 312 }, nBagTiles: 0, winnerScore: null }, 'every tile played'],
      [{ outcome: 'neutral', reason: 'timeout' }, { team: { score: 152 }, nBagTiles: 47, winnerScore: null }, 'timeout, tiles left over'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { score: 152 }, nBagTiles: 47, winnerScore: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'resource_exhausted', detail: 'complete', winners: ['u-alice'] }, { team: null, nBagTiles: 0, winnerScore: 312 }, 'highest score'],
      [{ outcome: 'won', reason: 'all_passed', detail: 'blocked', winners: ['u-alice', 'u-bob'] }, { team: null, nBagTiles: 0, winnerScore: 280 }, 'tied — co-winners'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, nBagTiles: 30, winnerScore: null }, 'timeout, nobody played a word'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, nBagTiles: 30, winnerScore: null }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, nBagTiles: 30, winnerScore: null }, 'Stop'],
    ],
  },
  // crosswords._make_json_summary_data: `team` holds coop's filled-cell count and is null in
  // compete, where each racer fills their own grid; `nCells` is the cells a player fills. The
  // clock is coop's one loss; a race ends on the first correct grid.
  crosswords: {
    live: { nCells: 180, team: { nFilledCells: 108 } },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved' }, { nCells: 180, team: { nFilledCells: 180 } }, 'solved'],
      [{ outcome: 'lost', reason: 'timeout' }, { nCells: 180, team: { nFilledCells: 108 } }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { nCells: 180, team: { nFilledCells: 108 } }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved', winners: ['u-alice'] }, { nCells: 180, team: null }, 'first to finish'],
      [{ outcome: 'lost', reason: 'timeout' }, { nCells: 180, team: null }, 'timeout'],
      [{ outcome: 'lost', reason: 'conceded' }, { nCells: 180, team: null }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { nCells: 180, team: null }, 'Stop'],
    ],
  },
  // setgame._make_json_summary_data: `team` holds coop's counts and is null in compete; nothing
  // is withheld mid-game, since every claim happened face-up. The two endings the rest of the
  // roster doesn't have: a coop deck emptied that STRANDS tiles (the normal ending, no result; only
  // a perfect clear, ~2% of games, wins), and a compete tie, a real result because there is no
  // speed tiebreak.
  setgame: {
    live: { team: { nSetsFound: 6, nHintsUsed: 1 }, nTableSetsFound: 6, nTilesInDeck: 45, perfectClear: null, nWinnerSets: null },
    coop: [
      [{ outcome: 'neutral', reason: 'resource_exhausted', detail: 'cleared' }, { team: { nSetsFound: 24, nHintsUsed: 1 }, nTableSetsFound: 24, nTilesInDeck: 0, perfectClear: false, nWinnerSets: null }, 'deck emptied, tiles left over'],
      [{ outcome: 'won', reason: 'reached_goal', detail: 'cleared' }, { team: { nSetsFound: 27, nHintsUsed: 1 }, nTableSetsFound: 27, nTilesInDeck: 0, perfectClear: true, nWinnerSets: null }, 'perfect clear'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nSetsFound: 9, nHintsUsed: 1 }, nTableSetsFound: 9, nTilesInDeck: 42, perfectClear: null, nWinnerSets: null }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nSetsFound: 9, nHintsUsed: 1 }, nTableSetsFound: 9, nTilesInDeck: 42, perfectClear: null, nWinnerSets: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'resource_exhausted', detail: 'cleared', winners: ['u-alice'] }, { team: null, nTableSetsFound: 24, nTilesInDeck: 0, perfectClear: null, nWinnerSets: 14 }, 'most sets'],
      [{ outcome: 'won', reason: 'timeout', winners: ['u-alice', 'u-bob'] }, { team: null, nTableSetsFound: 24, nTilesInDeck: 30, perfectClear: null, nWinnerSets: 12 }, 'tied — co-winners'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, nTableSetsFound: 17, nTilesInDeck: 30, perfectClear: null, nWinnerSets: null }, 'all conceded'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, nTableSetsFound: 0, nTilesInDeck: 30, perfectClear: null, nWinnerSets: null }, 'nobody scored'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, nTableSetsFound: 17, nTilesInDeck: 30, perfectClear: null, nWinnerSets: null }, 'Stop'],
    ],
  },
  // wordsy._make_json_summary_data: compete only, so `team` is always null; the rounds
  // finished, and the total every winner shares once seven rounds end it. A tie is shared, so
  // co-winners are an ordinary result; a player who scored nothing is not ranked.
  wordsy: {
    live: { team: null, nRoundsPlayed: 3, winnerTotal: null, legalBand: 4, roundStyle: 'timer' },
    compete: [
      [{ outcome: 'won', reason: 'resource_exhausted', detail: 'rounds_played', winners: ['u-alice'] }, { team: null, nRoundsPlayed: 7, winnerTotal: 46, legalBand: 4, roundStyle: 'timer' }, 'highest total'],
      [{ outcome: 'won', reason: 'resource_exhausted', detail: 'rounds_played', winners: ['u-alice', 'u-bob'] }, { team: null, nRoundsPlayed: 7, winnerTotal: 39, legalBand: 4, roundStyle: 'timer' }, 'tied — co-winners'],
      [{ outcome: 'lost', reason: 'resource_exhausted', detail: 'rounds_played' }, { team: null, nRoundsPlayed: 7, winnerTotal: null, legalBand: 4, roundStyle: 'timer' }, 'nobody scored'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, nRoundsPlayed: 3, winnerTotal: null, legalBand: 4, roundStyle: 'timer' }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, nRoundsPlayed: 3, winnerTotal: null, legalBand: 4, roundStyle: 'timer' }, 'Stop'],
    ],
  },
  // letterboxed._make_json_summary_data: `team` holds coop's chain and is null in compete; the
  // best coverage and the winner's chain are compete's. The race ENDS on the first solve, so a
  // win names the winner's word count; a TIMEOUT resolves on the most letters covered, which is
  // a different sentence — hence two compete wins. The one `live` blob serves both modes, so it
  // carries coop's team and compete's best coverage together.
  letterboxed: {
    live: { team: { nWordsUsed: 2, nCoveredLetters: 7 }, maxWords: 5, band: 5,
      nBestCoveredLetters: 7, nWinnerWords: null, nWinnerCoveredLetters: null,
      nCoveredLettersById: null, nWordsUsedById: null },
    coop: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved' }, { team: { nWordsUsed: 3, nCoveredLetters: 12 }, maxWords: 5, band: 5, nBestCoveredLetters: null, nWinnerWords: null, nWinnerCoveredLetters: null, nCoveredLettersById: null, nWordsUsedById: null }, 'covered the board'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nWordsUsed: 4, nCoveredLetters: 8 }, maxWords: 5, band: 5, nBestCoveredLetters: null, nWinnerWords: null, nWinnerCoveredLetters: null, nCoveredLettersById: null, nWordsUsedById: null }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nWordsUsed: 4, nCoveredLetters: 8 }, maxWords: 5, band: 5, nBestCoveredLetters: null, nWinnerWords: null, nWinnerCoveredLetters: null, nCoveredLettersById: null, nWordsUsedById: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'reached_goal', detail: 'solved', winners: ['u-alice'] }, { team: null, maxWords: 5, band: 5, nBestCoveredLetters: 12, nWinnerWords: 3, nWinnerCoveredLetters: 12, nCoveredLettersById: { 'u-alice': 9, 'u-bob': 6 }, nWordsUsedById: { 'u-alice': 3, 'u-bob': 4 } }, 'first to finish'],
      [{ outcome: 'won', reason: 'timeout', winners: ['u-alice'] }, { team: null, maxWords: 5, band: 5, nBestCoveredLetters: 9, nWinnerWords: null, nWinnerCoveredLetters: 9, nCoveredLettersById: { 'u-alice': 9, 'u-bob': 6 }, nWordsUsedById: { 'u-alice': 3, 'u-bob': 4 } }, 'timeout, most letters'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, maxWords: 5, band: 5, nBestCoveredLetters: 4, nWinnerWords: null, nWinnerCoveredLetters: null, nCoveredLettersById: { 'u-alice': 9, 'u-bob': 6 }, nWordsUsedById: { 'u-alice': 3, 'u-bob': 4 } }, 'all conceded'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, maxWords: 5, band: 5, nBestCoveredLetters: 4, nWinnerWords: null, nWinnerCoveredLetters: null, nCoveredLettersById: { 'u-alice': 9, 'u-bob': 6 }, nWordsUsedById: { 'u-alice': 3, 'u-bob': 4 } }, 'Stop'],
    ],
  },
  // wordiply._make_json_summary_data: `team` holds coop's track, its scores null until the end,
  // and is null in compete; the winner's length score is compete's alone.
  wordiply: {
    live: { team: { nGuessesUsed: 2, lengthScore: null, nLetters: null }, maxGuesses: 5, winnerLengthScore: null, lengthScoreById: null, nLettersById: null },
    coop: [
      [{ outcome: 'neutral', reason: 'resource_exhausted', detail: 'complete' }, { team: { nGuessesUsed: 5, lengthScore: 60, nLetters: 14 }, maxGuesses: 5, winnerLengthScore: null, lengthScoreById: null, nLettersById: null }, 'five words played, no result'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: { nGuessesUsed: 3, lengthScore: 60, nLetters: 14 }, maxGuesses: 5, winnerLengthScore: null, lengthScoreById: null, nLettersById: null }, 'timeout'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: { nGuessesUsed: 3, lengthScore: 60, nLetters: 14 }, maxGuesses: 5, winnerLengthScore: null, lengthScoreById: null, nLettersById: null }, 'Stop'],
    ],
    compete: [
      [{ outcome: 'won', reason: 'resource_exhausted', detail: 'complete', winners: ['u-alice'] }, { team: null, maxGuesses: 5, winnerLengthScore: 60, lengthScoreById: { 'u-alice': 60, 'u-bob': 40 }, nLettersById: { 'u-alice': 20, 'u-bob': 18 } }, 'someone won'],
      [{ outcome: 'lost', reason: 'conceded' }, { team: null, maxGuesses: 5, winnerLengthScore: null, lengthScoreById: null, nLettersById: null }, 'all conceded'],
      [{ outcome: 'lost', reason: 'timeout' }, { team: null, maxGuesses: 5, winnerLengthScore: null, lengthScoreById: null, nLettersById: null }, 'timeout, nobody scored'],
      [{ outcome: 'lost', reason: 'resource_exhausted', detail: 'complete' }, { team: null, maxGuesses: 5, winnerLengthScore: null, lengthScoreById: null, nLettersById: null }, 'out of guesses, nobody scored'],
      [{ outcome: 'neutral', reason: 'stopped' }, { team: null, maxGuesses: 5, winnerLengthScore: null, lengthScoreById: null, nLettersById: null }, 'Stop'],
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
  ending: ending && { reason: ending.reason, detail: ending.detail ?? ending.reason, by: 'u-alice' },
  // Each club member, ranked first when the case names them a winner.
  // Each club member as the server writes them at that ending: a winner `won`
  // and ranked first (the whole team in a coop win); everyone conceded when
  // the game ended by conceding; the rest `neutral` in a game nobody won or
  // lost, else `lost`.
  players: MEMBERS.map((member) => {
    // A case that names no winners but was won is a coop win: the whole team.
    const won = ending?.winners?.includes(member.id) ?? ending?.outcome === 'won'
    const conceded = ending?.reason === 'conceded'
    const outcome = ending === null ? null
      : won ? 'won'
      : ending.outcome === 'neutral' && !conceded ? 'neutral'
      : 'lost'
    return {
      id: member.id,
      ending: conceded ? { at: '2026-09-01T00:00:00Z', reason: 'conceded', detail: 'conceded' } : null,
      outcome,
      finalRanking: won ? 1 : null,
      conceded,
      solved: false,
      stillPlaying: ending === null,
    } as const
  }),
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
  ({ id: 'g', gametype, play_state: state, ended: state !== 'playing', status, setup }) as unknown as SummaryData

/** Every summary as a markdown table, one `| game | state | message |` row per case. */
function buildTable(): string {
  const lines = ['| game | state | status message |', '|---|---|---|']
  for (const m of gametypes) {
    const fam = CASES[m.baseGametype]
    if (!fam) continue
    if (isGameEndingFamily(fam)) {
      const labelOf = (ending: EndingCase | null, own: Record<string, unknown>) =>
        m.summaryFor(makeSummaryData(m.gametype, ending, own), MEMBERS, MY_ID)
      lines.push(`| **${m.gametype}** | playing | \`${labelOf(null, fam.live)}\` |`)
      for (const [ending, own, note] of casesFor(m.mode, fam)) {
        lines.push(
          `| | ${ending.outcome}/${ending.reason} — ${note} | \`${labelOf(ending, own)}\` |`,
        )
      }
      continue
    }
    const label = (state: string, status: Record<string, unknown>) =>
      m.summaryFor(row(m.gametype, state, status, fam.setup ?? {}), MEMBERS, MY_ID)
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
   * distinct game-over phrase (psychicnum's `lost`) at least doesn't lie about whether
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
        const playing = m.summaryFor(makeSummaryData(m.gametype, null, fam.live), MEMBERS, MY_ID)
        unknown = m.summaryFor(makeSummaryData(m.gametype, futureEnding, fam.live), MEMBERS, MY_ID)
        readsAsLive = unknown === playing
      } else {
        const setup = fam.setup ?? {}
        const playing = m.summaryFor(row(m.gametype, 'playing', fam.playing, setup), MEMBERS, MY_ID)
        unknown = m.summaryFor(row(m.gametype, 'a_state_from_the_future', fam.playing, setup), MEMBERS, MY_ID)
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
