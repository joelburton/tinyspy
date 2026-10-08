// cs-blessed-wordle

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { count, dictLabel, verdict, statusLine, tally, wonBy } from '@/common/manifest/summary'
import { findWinnerIds, type SummaryData, type SummaryPlayer } from '@/common/manifest/summaryData'
import { findUsername } from '@/common/members/memberList'
import type { Member } from '@/common/members/member'
import { db } from './db'
import { findFewestGuessesAhead, makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_WORDLE_SETUP, legalError } from './lib/setup'
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
 * What wordle's two modes share: the `wordle` schema, the PlayArea, SetupForm
 * and Help, and the club line's pieces. The per-game setup is `lib/setup.ts`'s;
 * a countdown timer ends the game server-side via `submitTimeout`. The game
 * itself is `doc.md`'s.
 */
abstract class WordleManifest extends Manifest {
  readonly schema = 'wordle'
  readonly baseGametype = 'wordle'
  // The brand keeps its display casing; code identifiers are the codename.
  readonly name = 'WordNerd'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  readonly PlayArea = playAreaLoader
  readonly setupForm: Manifest['setupForm'] = {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLE_SETUP,
    // Gate Start until legal guesses reach the answer's hardest band (so every
    // possible answer is itself guessable). create_game re-checks.
    validate: (setup) => legalError(setup as GSetup),
  }
  protected readonly db = db

  // The RPC routes on the mode to write the right gametype string and pick the
  // target. No edge function: picking a random target is one SQL line.
  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    return runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setup as GSetup,
        p_player_user_ids: playerUserIds,
        p_mode: this.mode,
      }),
    )
  }

  // The summary reads the game's `summary_data` (`GSummaryData`: the common
  // part with its ending; `team`, the team's guess count, null in compete;
  // compete's winner's count; and the answer band). The answer band rides on
  // every line — a game drawn from the curated Wordle answer list plays very
  // differently from one drawn from the "Expert" end of the dictionary.

  /**
   * The answer band (`summary_data`'s `answerBand`, copied from the setup): 0
   * is the curated NYT-Wordle answer list, 1..6 are the shared dictionary
   * bands. Rendered in the same `dict "…"` slot the other band-sensitive games
   * use, because to a player it answers the same question — how hard are the
   * words here?
   */
  protected answerDictLabel(band: number | null): string | null {
    if (band === 0) return 'dict "Wordle"'
    return dictLabel(band)
  }

  /**
   * A player's ending label, from the summary: their guesses, and the fewest of
   * those ranked above them. Coop carries no per-player guesses and needs none.
   */
  protected makeSummaryEndingLabel(summary: GSummaryData, player: SummaryPlayer) {
    const guessesOf = (id: string) => summary.nGuessesUsedById?.[id] ?? 0
    const players = summary.players.map((p) => ({ finalRanking: p.finalRanking, nGuessesUsed: guessesOf(p.id) }))
    return makeEndingLabel(
      { ...player, nGuessesUsed: guessesOf(player.id) },
      { mode: this.mode, ended: summary.ended, reason: summary.ending?.reason ?? null },
      findFewestGuessesAhead(player, players),
    )
  }
}

class WordleCoopManifest extends WordleManifest {
  readonly gametype = 'wordle_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Guess the word together'
  // Solo or coop up to 6. Must agree with _require_player_count_max(6).
  readonly numberOfPlayers: [number, number] = [1, 6]

  /**
   * The team's guesses and the answer band while it plays; once it ends, the
   * team's ending label (mine, when I played) leads it. The guess count goes
   * once the label says "out of guesses". No "answer revealed" variant:
   * revealing is a display decision on an already-ended game, and the club
   * list describes the ending, not what the players have since looked at.
   */
  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const dict = this.answerDictLabel(summary.answerBand)
    // Coop always has a team.
    const used = tally(summary.team!.nGuessesUsed, summary.maxGuesses, 'guesses')
    if (summary.ending === null) return statusLine(verdict('Playing'), used, dict)
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = this.makeSummaryEndingLabel(summary, player)!
    return statusLine(this.makeLead(endingLabel), summary.ending.reason === 'resource_exhausted' ? null : used, dict)
  }
}

class WordleCompeteManifest extends WordleManifest {
  readonly gametype = 'wordle_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race to guess the word'
  // Compete needs an opposing PLAYER. Must agree with create_game, which
  // checks both ends for a race (PN498 below 2, _require_player_count_max(6)).
  readonly numberOfPlayers: [number, number] = [2, 6]

  /**
   * No progress: a race has no team, guesses are private until the game ends,
   * and this line is readable by the whole club. It leads with my ending label
   * once I am out of play; once won, it names the winner and their count.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const dict = this.answerDictLabel(summary.answerBand)
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(summary, me)
    if (summary.ending === null && myEndingLabel === null) return statusLine(verdict('Playing'), dict)

    const winningGuesses = summary.nWinnerGuesses === null ? null : count(summary.nWinnerGuesses, 'guess', 'guesses')
    const otherWinnerNames = findWinnerIds(summary)
      .filter((id) => id !== myId)
      .map((id) => findUsername(members, id) ?? 'someone')
      .join(' & ')
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), winningGuesses, dict)
        // Someone else won: name them, beside how I came out; a bare loss is
        // said by naming them.
        return myEndingLabel.labelType === 'lost' && myEndingLabel.long === ''
          ? statusLine(wonBy(otherWinnerNames), winningGuesses, dict)
          : statusLine(this.makeLead(myEndingLabel), wonBy(otherWinnerNames), winningGuesses)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return statusLine(wonBy(otherWinnerNames), winningGuesses, dict)
      case 'lost':
        return summary.ending!.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost', summary.ending!.reason === 'timeout' ? 'out of time' : 'out of guesses'), noWinner)
      case 'neutral':
        return statusLine('Stopped', dict)
      default:
        return summary.outcome!
    }
  }
}

/** wordle in coop: the team guesses one word together. */
export const wordleCoopManifest = new WordleCoopManifest()

/** wordle in compete: a race to the same word. */
export const wordleCompeteManifest = new WordleCompeteManifest()
