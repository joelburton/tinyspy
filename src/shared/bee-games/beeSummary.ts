// cs-unmet

import type { EndingLabel } from '@/common/ending/endingLabel'
import { findWinnerIds } from '@/common/manifest/summaryData'
import { statusLine, tally, verdict, wonBy } from '@/common/manifest/summary'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { RANKS } from '@/shared/rank-ladder/rankLadder'
import type { BeeSummaryData } from './beeGameData'
import { makeBeeEndingLabel } from './endingLabel'

/*
 * The bee games' club lines, one per mode, the same for spellingbee and
 * wordwheel. Each reads the game's `summary_data` and leads, once I am out of
 * play, with my ending label.
 */

/** The game's ending as an ending label reads it, from the summary. */
function makeGameFacts(summary: BeeSummaryData, mode: 'coop' | 'compete') {
  return {
    mode,
    ended: summary.ended,
    reason: summary.ending?.reason ?? null,
    detail: summary.ending?.detail ?? null,
    targetRankIdx: summary.targetRankIdx,
  }
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/** The winners other than me, named: "bea", "bea & cade", "bea, cade & dee". */
function makeOtherWinnerNames(summary: BeeSummaryData, members: readonly Member[], myId: string) {
  const names = findWinnerIds(summary)
    .filter((id) => id !== myId)
    .map((id) => findUsername(members, id) ?? 'someone')
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}

/**
 * What a compete game the clock ended with no winner adds: with a target,
 * that nobody reached it; without one, that nobody scored. Null for any other
 * ending.
 */
function makeNoWinner(summary: BeeSummaryData, rank: string | null) {
  if (summary.outcome !== 'lost' || summary.ending!.reason === 'conceded') return null
  if (rank === null) return 'no winner'
  return `nobody reached "${rank}"`
}

/**
 * A bee game's coop line. The team comes out as one, so it leads with the
 * team's ending label (mine, when I played) and ends with the team's points
 * and words against the required set's.
 */
export function makeBeeCoopSummary(summary: BeeSummaryData, myId: string): string {
  const team = summary.team!
  const points = `${team.foundWordsScore}/${summary.reqdWordsScore} pts`
  const words = tally(team.nFoundWords, summary.nReqdWords, 'words')
  if (summary.ending === null) return statusLine(verdict('Playing'), points, words)
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeBeeEndingLabel(player, makeGameFacts(summary, 'coop'))!
  return statusLine(makeLead(endingLabel), points, words)
}

/**
 * A bee game's compete line, led by my ending label once I am out of play.
 * Two shapes of win: reaching the goal first ("Won by bea at "Genius"", or
 * just the winner when the goal was every required word), and — with no
 * target — the top score when the countdown stops, which ties share. A target
 * game whose clock runs out has no winner, however high the scores got. No
 * player's own score reaches the listing (`summary_data.team` is null).
 */
export function makeBeeCompeteSummary(
  summary: BeeSummaryData,
  members: readonly Member[],
  myId: string,
): string {
  const rank = summary.targetRankIdx === null ? null : RANKS[summary.targetRankIdx]
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeBeeEndingLabel(me, makeGameFacts(summary, 'compete'))
  if (summary.ending === null && myEndingLabel === null) {
    return statusLine(verdict('Playing'), rank === null ? null : `race to "${rank}"`)
  }

  // A target win names the rank reached.
  const isTargetWin = summary.ending?.detail === 'target'
  const wonByOthers = (names: string) => (isTargetWin ? `${wonBy(names)} at "${rank}"` : wonBy(names))
  const noWinner = makeNoWinner(summary, rank)

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      const others = makeOtherWinnerNames(summary, members, myId)
      if (myEndingLabel.labelType === 'won') {
        return others === '' ? makeLead(myEndingLabel) : `${makeLead(myEndingLabel)}, tied with ${others}`
      }
      // Someone else won: name them, beside my place or my concession.
      if (myEndingLabel.labelType === 'placed' || myEndingLabel.labelType === 'conceded') {
        return statusLine(makeLead(myEndingLabel), wonByOthers(others))
      }
      return wonByOthers(others)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return wonByOthers(makeOtherWinnerNames(summary, members, myId))
    case 'lost':
      return summary.ending!.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost', 'out of time'), noWinner)
    case 'neutral':
      return 'Stopped'
    default:
      return summary.outcome!
  }
}
