// cs-unmet

import { lazy } from 'react'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { count, dictLabel, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { findWinnerIds, type SummaryData, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { db } from './db'
import { findFewestSwapsAhead, makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_WAFFLE_SETUP } from './lib/setup'
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
 * What waffle's two modes share: the `waffle` schema, the `src/waffle/`
 * folder, and the PlayArea, SetupForm and Help. Coop solves one board
 * together; compete gives each player their own board, fewest swaps winning.
 * The per-game setup includes an optional countdown timer, ended server-side
 * via `submitTimeout`. A Waffle-style swap-to-solve deduction puzzle — see
 * docs/games/waffle.md.
 */
abstract class WaffleManifest extends Manifest {
  readonly schema = 'waffle'
  readonly baseGametype = 'waffle'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'SyrupSwap'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  readonly PlayArea = playAreaLoader
  readonly setupForm: Manifest['setupForm'] = { Component: setupFormLoader, defaults: DEFAULT_WAFFLE_SETUP }
  protected readonly db = db

  // The board is generated on demand by the `waffle-build-board` edge function
  // (running as the caller), which builds a board for the chosen band and calls
  // `waffle.create_game`. It comes back the same envelope a direct create_game
  // returns, relayed untouched (see _shared/startGame.ts) — which is why naming
  // the answer in waffle.create_game's SQL reaches here: nothing in between
  // rewrites the payload.
  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    return runEdgeFn<CreatedGame>('waffle-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode: this.mode,
    })
  }

  /**
   * A player's ending label, from the summary: their swaps (the team's in
   * coop), and the fewest of those ranked above them.
   */
  protected makeSummaryEndingLabel(summary: GSummaryData, player: SummaryPlayer) {
    const swapsOf = (id: string) => summary.team?.nSwapsUsed ?? summary.nSwapsUsedById?.[id] ?? 0
    const players = summary.players.map((p) => ({ finalRanking: p.finalRanking, nSwapsUsed: swapsOf(p.id) }))
    return makeEndingLabel(
      { ...player, nSwapsUsed: swapsOf(player.id) },
      { mode: this.mode, ended: summary.ended, reason: summary.ending?.reason ?? null, parSwaps: summary.parSwaps },
      findFewestSwapsAhead(player, players),
    )
  }
}

class WaffleCoopManifest extends WaffleManifest {
  readonly gametype = 'waffle_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Unscramble the waffle together'
  // Solo or coop up to 6. Must agree with
  // _require_player_count_max(6) in waffle.create_game.
  readonly numberOfPlayers: [number, number] = [1, 6]

  /**
   * The DICT band rides on every row: a waffle at "Universal" and one at
   * "Expert" are barely the same game, so the band is the single most useful
   * thing about a game you're deciding whether to return to. Coop shows the
   * swaps the team has left; once it ends, the team's ending label (mine, when
   * I played) leads it. No "answer revealed" variant: revealing is a display
   * decision on an already-ended game, and the club list describes the ending,
   * not what the players have since looked at.
   */
  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const dict = dictLabel(summary.band)
    // Coop always has a team.
    const left = count(summary.maxSwaps - summary.team!.nSwapsUsed, 'swap left', 'swaps left')
    if (summary.ending === null) return statusLine(verdict('Playing'), left, dict)
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = this.makeSummaryEndingLabel(summary, player)!
    return statusLine(this.makeLead(endingLabel), summary.outcome === 'won' ? left : null, dict)
  }
}

class WaffleCompeteManifest extends WaffleManifest {
  readonly gametype = 'waffle_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race to unscramble the waffle'
  // Compete needs an opposing PLAYER — racing yourself is degenerate.
  // Lower bound 2 hides the Start button in solo clubs; the RPC also
  // enforces it. Must agree with _require_player_count_max(6).
  readonly numberOfPlayers: [number, number] = [2, 6]

  /**
   * No progress: each racer has their own board, and this line is club-wide
   * readable. It leads with my ending label once I am out of play; once won, it
   * names the winner and their count.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const dict = dictLabel(summary.band)
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(summary, me)
    if (summary.ending === null && myEndingLabel === null) return statusLine(verdict('Playing'), dict)

    const winningSwaps = summary.nWinnerSwaps === null ? null : count(summary.nWinnerSwaps, 'swap', 'swaps')
    const otherWinnerNames = findWinnerIds(summary)
      .filter((id) => id !== myId)
      .map((id) => findUsername(members, id) ?? 'someone')
      .join(' & ')
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), winningSwaps, dict)
        // Someone else won: name them, beside how I came out; a bare loss is
        // said by naming them.
        return myEndingLabel.labelType === 'lost' && myEndingLabel.long === ''
          ? statusLine(wonBy(otherWinnerNames), winningSwaps, dict)
          : statusLine(this.makeLead(myEndingLabel), wonBy(otherWinnerNames), winningSwaps)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return statusLine(wonBy(otherWinnerNames), winningSwaps, dict)
      case 'lost':
        return summary.ending!.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost', summary.ending!.reason === 'timeout' ? 'out of time' : 'out of swaps'), noWinner)
      case 'neutral':
        return statusLine('Stopped', dict)
      default:
        return summary.outcome!
    }
  }
}

/** waffle in coop: one board, solved together. */
export const waffleCoopManifest = new WaffleCoopManifest()

/** waffle in compete: a board each, fewest swaps wins. */
export const waffleCompeteManifest = new WaffleCompeteManifest()
