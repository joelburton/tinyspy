// cs-unmet

import { lazy } from 'react'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { count, tally, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { findWinnerIds, type SummaryData, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { db } from './db'
import { findScoresAhead, makeEndingLabel } from './lib/endingLabel'
import {
  DEFAULT_WORDIPLY_SETUP_COMPETE,
  DEFAULT_WORDIPLY_SETUP_COOP,
  wordiplySetupError,
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
 * What wordiply's two modes share: the schema, and the `PlayArea`,
 * `SetupForm`, `Help`, `useGame` and CSS, which branch at render time on
 * `gd.mode`. Each mode's setup defaults and intro are the leaves'. Neither
 * carries a `target_rank` — wordiply is not a race-to-rank.
 *
 * "wordiply" is the codename for our Guardian-Wordiply-style base extender: a
 * short BASE (a 2–4 letter combination, not a dictionary word) that every guess
 * must contain, longer than the base, across five guesses. See
 * docs/games/wordiply.md for the rules + architecture (the shipped legal list
 * the FE validates locally, length-only live readout, the compete length-score
 * comparator).
 */
abstract class WordiplyManifest extends Manifest {
  readonly schema = 'wordiply'
  readonly baseGametype = 'wordiply'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'WordWire'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  // Branches on `game.mode` for the compete-only OpponentStrip + win-vs-loss
  // verdict copy.
  readonly PlayArea = playAreaLoader
  // submit_timeout is mode-aware server-side + idempotent.
  protected readonly db = db

  // The starter is chosen in Deno, so this goes through an edge function
  // rather than straight to the RPC — but it comes back the same envelope a
  // direct create_game returns, relayed untouched (see _shared/startGame.ts).
  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    return runEdgeFn<CreatedGame>('wordiply-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode: this.mode,
    })
  }

  /** The length score as the label prints it: `78%`. */
  protected percent(score: number | null) {
    return score === null ? null : `${score}%`
  }

  /**
   * A player's ending label, from the summary: their scores (the team's in
   * coop), and those of the players ranked above them.
   */
  protected makeSummaryEndingLabel(summary: GSummaryData, player: SummaryPlayer) {
    const scoresOf = (id: string) => ({
      lengthScore: summary.team?.lengthScore ?? summary.lengthScoreById?.[id] ?? null,
      nLetters: summary.team?.nLetters ?? summary.nLettersById?.[id] ?? null,
    })
    const players = summary.players.map((p) => ({ finalRanking: p.finalRanking, ...scoresOf(p.id) }))
    return makeEndingLabel(
      { ...player, ...scoresOf(player.id) },
      { mode: this.mode, ended: summary.ended, reason: summary.ending?.reason ?? null },
      findScoresAhead(player, players),
    )
  }
}

class WordiplyCoopManifest extends WordiplyManifest {
  readonly gametype = 'wordiply_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Extend a base in five guesses, together'
  // Plays solo (1 player in their solo club) or coop (up to 6). Must agree
  // with the player-count guard in wordiply.create_game.
  readonly numberOfPlayers: [number, number] = [1, 6]
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'Everyone in the club shares five guesses. Each guess must contain the starter and be longer than it; together you\'re hunting the longest word.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDIPLY_SETUP_COOP,
    validate: (setup) => wordiplySetupError(setup as GSetup),
  }

  /**
   * Mid-game it shows only the words used (the scores wait for the end, per
   * the "length only during play" rule); once it ends, the team's ending label
   * (mine, when I played) leads it, then the letters — the five words played
   * says its length score itself.
   */
  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    // Coop always has a team.
    const team = summary.team!
    if (summary.ending === null) {
      return statusLine(verdict('Playing'), tally(team.nGuessesUsed, summary.maxGuesses, 'guesses'))
    }
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = this.makeSummaryEndingLabel(summary, player)!
    const isFiveWords = endingLabel.labelType === 'ended'
    return statusLine(
      this.makeLead(endingLabel),
      isFiveWords ? null : this.percent(team.lengthScore),
      count(team.nLetters, 'letter'),
    )
  }
}

class WordiplyCompeteManifest extends WordiplyManifest {
  readonly gametype = 'wordiply_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race to the longest word from a shared base'
  // Compete needs an opposing PLAYER. The RPC enforces ≥2 too.
  readonly numberOfPlayers: [number, number] = [2, 6]
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'Each player gets their own five guesses off the same starter. The longest word wins; until the end you only see how many guesses each other has spent, not the words.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDIPLY_SETUP_COMPETE,
    validate: (setup) => wordiplySetupError(setup as GSetup),
  }

  /**
   * Mid-race it shows no progress: a race has no team, and the words and
   * scores are private until the end. It leads with my ending label once I am
   * out of play; once won, it names the winner and their length score; a race
   * nobody scored in is a collective loss.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(summary, me)
    if (summary.ending === null && myEndingLabel === null) return verdict('Playing')

    const winningScore = summary.winnerLengthScore === null ? null : this.percent(summary.winnerLengthScore)
    const otherWinnerNames = findWinnerIds(summary)
      .filter((id) => id !== myId)
      .map((id) => findUsername(members, id) ?? 'someone')
      .join(' & ')
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), winningScore)
        // Someone else won: name them, beside how I came out.
        return statusLine(this.makeLead(myEndingLabel), wonBy(otherWinnerNames), winningScore)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return statusLine(wonBy(otherWinnerNames), winningScore)
      case 'lost':
        return summary.ending!.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost', 'nobody scored'), noWinner)
      case 'neutral':
        return 'Stopped'
      default:
        return summary.outcome!
    }
  }
}

/** wordiply in coop: five shared guesses off one base. */
export const wordiplyCoopManifest = new WordiplyCoopManifest()

/** wordiply in compete: five guesses each, the longest word wins. */
export const wordiplyCompeteManifest = new WordiplyCompeteManifest()
