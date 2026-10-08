// cs-unmet

import { lazy } from 'react'
import { runEdgeFn } from '@/common/supabase/dbResult'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { count, dictLabel, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { findWinnerIds, type SummaryData, type SummaryPlayer } from '@/common/manifest/summaryData'
import { findUsername } from '@/common/members/memberList'
import type { Member } from '@/common/members/member'
import { db } from './db'
import { findFewestMissesAhead, makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_WORDLEONE_SETUP } from './lib/setup'
import logoUrl from './logo.svg?url'
import type { GSetup, GSummaryData } from './types'

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
 * What wordleone's two modes share: the `wordleone` schema, the PlayArea,
 * SetupForm and Help, and the club line's pieces. The per-game setup is
 * `lib/setup.ts`'s; a countdown timer ends the game server-side via
 * `submitTimeout`. The game itself is `doc.md`'s.
 */
abstract class WordleoneManifest extends Manifest {
  readonly schema = 'wordleone'
  readonly baseGametype = 'wordleone'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'WordNerdier'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  readonly PlayArea = playAreaLoader
  readonly setupForm: Manifest['setupForm'] = { Component: setupFormLoader, defaults: DEFAULT_WORDLEONE_SETUP }
  protected readonly db = db

  // The puzzle is built on demand by the `wordleone-build-board` edge function
  // (running as the caller), which builds one at the chosen band and difficulty
  // and calls `wordleone.create_game`. The function relays create_game's
  // envelope untouched (supabase/functions/_shared/startGame.ts), so this
  // answers as a direct create_game would.
  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    return runEdgeFn<CreatedGame>('wordleone-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode: this.mode,
    })
  }

  // The summary reads the game's `summary_data` (`GSummaryData`: the common
  // part with its ending; `team`, the team's misses, null in compete; compete's
  // winner's misses; and the setup's band and difficulty). The band rides on
  // every line in the `dict "…"` slot every band-sensitive game uses, the
  // difficulty beside it.

  /** The band and the difficulty, as every line carries them. */
  protected makePuzzleLabel(summary: GSummaryData): string | null {
    return statusLine(dictLabel(summary.legalBand), summary.difficulty)
  }

  /**
   * A player's ending label, from the summary: their misses, and the fewest of
   * those ranked above them. Coop carries no per-player misses and needs none.
   */
  protected makeSummaryEndingLabel(summary: GSummaryData, player: SummaryPlayer) {
    const missesOf = (id: string) => summary.nMissesById?.[id] ?? 0
    const players = summary.players.map((p) => ({ finalRanking: p.finalRanking, nMisses: missesOf(p.id) }))
    return makeEndingLabel(
      { ...player, nMisses: missesOf(player.id) },
      { mode: this.mode, ended: summary.ended, reason: summary.ending?.reason ?? null },
      findFewestMissesAhead(player, players),
    )
  }
}

class WordleoneCoopManifest extends WordleoneManifest {
  readonly gametype = 'wordleone_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Find the one word that fits, together'
  // Solo or coop up to 6. Must agree with _require_player_count_max(6).
  readonly numberOfPlayers: [number, number] = [1, 6]

  /**
   * The team's misses and the puzzle while it plays; once it ends, the team's
   * ending label (mine, when I played) leads it.
   */
  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const puzzle = this.makePuzzleLabel(summary)
    // Coop always has a team.
    const misses = count(summary.team!.nMisses, 'miss', 'misses')
    if (summary.ending === null) return statusLine(verdict('Playing'), misses, puzzle)
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = this.makeSummaryEndingLabel(summary, player)!
    return statusLine(this.makeLead(endingLabel), misses, puzzle)
  }
}

class WordleoneCompeteManifest extends WordleoneManifest {
  readonly gametype = 'wordleone_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race to find the one word that fits'
  // Compete needs an opposing PLAYER. Must agree with create_game, which
  // checks both ends for a race (PN518 below 2, _require_player_count_max(6)).
  readonly numberOfPlayers: [number, number] = [2, 6]

  /**
   * No progress: a race has no team, guesses are private until the game ends,
   * and this line is readable by the whole club. It leads with my ending label
   * once I am out of play; once won, it names the winner and their misses.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const puzzle = this.makePuzzleLabel(summary)
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(summary, me)
    if (summary.ending === null && myEndingLabel === null) return statusLine(verdict('Playing'), puzzle)

    const winningMisses = summary.nWinnerMisses === null ? null : count(summary.nWinnerMisses, 'miss', 'misses')
    const otherWinnerNames = findWinnerIds(summary)
      .filter((id) => id !== myId)
      .map((id) => findUsername(members, id) ?? 'someone')
      .join(' & ')
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), winningMisses, puzzle)
        // Someone else won: name them, beside how I came out; a bare loss is
        // said by naming them.
        return myEndingLabel.labelType === 'lost' && myEndingLabel.long === ''
          ? statusLine(wonBy(otherWinnerNames), winningMisses, puzzle)
          : statusLine(this.makeLead(myEndingLabel), wonBy(otherWinnerNames), winningMisses)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return statusLine(wonBy(otherWinnerNames), winningMisses, puzzle)
      case 'lost':
        return summary.ending!.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost', 'out of time'), noWinner)
      case 'neutral':
        return statusLine('Stopped', puzzle)
      default:
        return summary.outcome!
    }
  }
}

/** wordleone in coop: the team finds the one word that fits. */
export const wordleoneCoopManifest = new WordleoneCoopManifest()

/** wordleone in compete: a race to the one word that fits. */
export const wordleoneCompeteManifest = new WordleoneCompeteManifest()
