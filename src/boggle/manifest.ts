// cs-unmet

import { lazy } from 'react'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { findWinnerIds, type SummaryData, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { db } from './db'
import { makeEndingLabel } from './lib/endingLabel'
import {
  DEFAULT_BOGGLE_SETUP_COMPETE,
  DEFAULT_BOGGLE_SETUP_COOP,
  boggleSetupError,
} from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

// One lazy component each, shared by both modes.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * What boggle's two modes share: the schema, and the PlayArea, SetupForm, Help
 * and CSS; mode branches at render time and in the RPCs. Each mode's setup
 * defaults and intro are the leaves'. See docs/games/boggle.md for the design.
 */
abstract class BoggleManifest extends Manifest {
  readonly schema = 'boggle'
  readonly baseGametype = 'boggle'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'MothCubes'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  readonly PlayArea = playAreaLoader
  // submit_timeout is mode-aware and idempotent server-side.
  protected readonly db = db

  // The board is rolled in Deno, so this goes through an edge function rather
  // than straight to the RPC — but it comes back the same envelope a direct
  // create_game returns, relayed untouched (see _shared/startGame.ts).
  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    return runEdgeFn<CreatedGame>('boggle-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode: this.mode,
    })
  }

  // The summary reads the game's `summary_data` (`GSummaryData`: the common
  // part with the team's finds, null in compete, the target and the top score).

  /** The game's ending as an ending label reads it, from the summary. */
  protected makeGameFacts(summary: GSummaryData) {
    return {
      mode: this.mode,
      ended: summary.ended,
      reason: summary.ending?.reason ?? null,
      detail: summary.ending?.detail ?? null,
      winPercent: summary.targetWinPercent,
    }
  }
}

class BoggleCoopManifest extends BoggleManifest {
  readonly gametype = 'boggle_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Find words by linking adjacent tiles'
  // Plays solo (1, in a solo club) or coop (up to 8). Must agree with
  // boggle.create_game's player-count guard.
  readonly numberOfPlayers: [number, number] = [1, 8]
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'Everyone hunts the same board together and the team’s finds pile up into one score.',
    Component: setupFormLoader,
    defaults: DEFAULT_BOGGLE_SETUP_COOP,
    validate: (setup) => boggleSetupError(setup as GSetup),
  }

  /**
   * The team comes out as one, so the line leads with the team's ending label
   * (mine, when I played) and ends with the team's tally.
   */
  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    if (summary.ending === null) return statusLine(verdict('Playing'), ...this.teamTally(summary))
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = makeEndingLabel(player, this.makeGameFacts(summary), [])!
    return statusLine(this.makeLead(endingLabel), ...this.teamTally(summary))
  }

  /** The team's words and points. */
  private teamTally(summary: GSummaryData): [string | null, string] {
    const team = summary.team!
    return [count(team.nFoundWords, 'word'), `${team.foundWordsScore} pts`]
  }
}

class BoggleCompeteManifest extends BoggleManifest {
  readonly gametype = 'boggle_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race to find the most words'
  // Compete needs an opposing player; the RPC enforces ≥2 too.
  readonly numberOfPlayers: [number, number] = [2, 8]
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'Everyone races the same board independently — most points wins. You see each other’s word counts, not the words themselves, until the game ends.',
    Component: setupFormLoader,
    defaults: DEFAULT_BOGGLE_SETUP_COMPETE,
    validate: (setup) => boggleSetupError(setup as GSetup),
  }

  /**
   * Led by my ending label once I am out of play. Two shapes of win: reaching
   * the goal first ("Won by bea at 65%", or the score when the goal was every
   * required word), and — with no target — the top score when the timer stops,
   * which ties share. A target game whose timer runs out has no winner, however
   * high the scores got. No player's own score reaches the listing until the
   * game ends.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const pct = summary.targetWinPercent
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(summary, members, me)
    if (summary.ending === null && myEndingLabel === null) {
      return statusLine(verdict('Playing'), pct !== null ? `race to ${pct}%` : null)
    }

    // A target win names the bar; any other win, the winning score.
    const isTargetWin = summary.ending?.detail === 'target'
    const winningScore = !isTargetWin && summary.topScore !== null ? `${summary.topScore} pts` : null
    const wonByOthers = (names: string) => (isTargetWin ? `${wonBy(names)} at ${pct}%` : wonBy(names))
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        const others = this.makeOtherWinnerNames(summary, members, myId)
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), winningScore)
        // Someone else won: name them, beside my place or my concession.
        if (myEndingLabel.labelType === 'placed' || myEndingLabel.labelType === 'conceded') {
          return statusLine(this.makeLead(myEndingLabel), wonByOthers(others), winningScore)
        }
        return statusLine(wonByOthers(others), winningScore)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return statusLine(wonByOthers(this.makeOtherWinnerNames(summary, members, myId)), winningScore)
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

  /** A player's ending label, from the summary, with the others at their place named. */
  private makeSummaryEndingLabel(summary: GSummaryData, members: readonly Member[], player: SummaryPlayer) {
    const tiedWithNames = summary.players
      .filter((o) => o.id !== player.id && player.finalRanking !== null && o.finalRanking === player.finalRanking)
      .map((o) => findUsername(members, o.id) ?? 'someone')
    return makeEndingLabel(player, this.makeGameFacts(summary), tiedWithNames)
  }

  /** The winners other than me, named: "bea", "bea & cade", "bea, cade & dee". */
  private makeOtherWinnerNames(summary: GSummaryData, members: readonly Member[], myId: string) {
    const names = findWinnerIds(summary)
      .filter((id) => id !== myId)
      .map((id) => findUsername(members, id) ?? 'someone')
    if (names.length <= 1) return names.join('')
    return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
  }
}

/** boggle in coop: the team's finds pile into one score. */
export const boggleCoopManifest = new BoggleCoopManifest()

/** boggle in compete: a race on the same board. */
export const boggleCompeteManifest = new BoggleCompeteManifest()
