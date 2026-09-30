// cs-blessed-psychicnum

import type { PrintHeader, SetupRow } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import { memberById } from '@/common/members/memberList'
import type { EventRow } from '../hooks/useGame'

/**
 * Build the psychicnum print model — the pure half, away from jsPDF so the
 * judgment is testable without a renderer.
 *
 * The judgment that lives here: **whose marks belong on whose board.** The
 * board WORDS are shared, but in compete every player races their own copy —
 * each with their own ✓/✗ marks, their own score and their own event log — so
 * the printout is one track per player (`common/pdf/columns.ts`), not one
 * merged board that silently blends everyone's guesses.
 */

export type PrintTile = { word: string; state: 'correct' | 'miss' | 'undecided' }

/** One player's page-column: their board, their score line, their guesses. */
export type PrintTrack = {
  who: string
  board: PrintTile[]
  turns: TurnRow[]
  // Their own score line ("2 of 3 secrets found · 4 guesses used").
  result: string
}

export type PsychicnumPrintModel = PrintHeader & {
  // Grid columns (rows derive from `board.length`).
  cols: number
  // Coop is a single shared track; compete is one per player once the game has
  // ended, or just yours during play (RLS hides rivals' guesses until then).
  tracks: PrintTrack[]
}

/** Fold one set of events into the shared words' per-tile states; only the
 *  guesses mark a tile. */
function boardOf(words: readonly string[], events: readonly EventRow[]): PrintTile[] {
  const results = new Map<string, boolean>()
  for (const event of events) if (event.kind === 'guess') results.set(event.word, event.is_correct)
  return words.map((w) => ({
    word: w.toUpperCase(),
    state: results.has(w) ? (results.get(w) ? 'correct' : 'miss') : 'undecided',
  }))
}

/** The on-screen event-log wording, one row per guess/hint/spoiler. */
function turnsOf(events: readonly EventRow[], whoOf: (event: EventRow) => string): TurnRow[] {
  return events.map((event, i) => ({
    seq: i + 1,
    who: whoOf(event),
    text:
      event.kind === 'hint'
        ? `Hint: ${event.word}`
        : event.kind === 'spoiler'
          ? `${event.word.toUpperCase()} — Spoiler`
          : `${event.word.toUpperCase()} — ${event.is_correct ? 'Correct' : 'Wrong'}`,
  }))
}

export function buildPsychicnumPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  mode: 'coop' | 'compete'
  isGameEnded: boolean
  // The shared board words (lowercase, as the row stores them).
  words: readonly string[]
  // Every event the viewer can see — guesses, hints, spoilers. Compete
  // mid-game: only their own.
  events: EventRow[]
  // How many secrets the board hides.
  requiredSecretsCount: number
  players: { user_id: string; username: string }[]
  selfId: string
  setupRows: SetupRow[]
}): PsychicnumPrintModel {
  const nameOf = (id: string) => memberById(o.players, id)?.username ?? 'someone'

  const track = (who: string, events: EventRow[], whoOf: (event: EventRow) => string): PrintTrack => {
    const board = boardOf(o.words, events)
    const found = board.filter((t) => t.state === 'correct').length
    const used = events.filter((event) => event.kind === 'guess').length
    return {
      who,
      board,
      turns: turnsOf(events, whoOf),
      result: `${found} of ${o.requiredSecretsCount} secrets found · ${used} guess${used === 1 ? '' : 'es'} used`,
    }
  }

  // Coop is ONE shared board however many players are round it, so it's one
  // track and the log names whoever made each guess. Compete is one track per
  // player — but only once the game has ended, since mid-game RLS means the
  // viewer holds nobody's guesses but their own and empty rival tracks would be
  // misleading.
  let tracks: PrintTrack[]
  if (o.mode === 'coop') {
    tracks = [track('Team', o.events, (event) => nameOf(event.user_id))]
  } else if (o.isGameEnded) {
    tracks = o.players.map((p) =>
      track(
        p.user_id === o.selfId ? `${p.username} (you)` : p.username,
        o.events.filter((event) => event.user_id === p.user_id),
        () => p.username,
      ),
    )
  } else {
    tracks = [
      track('You', o.events.filter((event) => event.user_id === o.selfId), () => 'you'),
    ]
  }

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    // Coop's header line carries the team score (each compete track carries
    // its own); compete's says only what the page holds.
    summary: o.mode === 'coop' ? `Co-op · ${tracks[0].result}` : `Compete · ${o.players.length} players`,
    setupRows: o.setupRows,
    mode: o.mode,
    cols: Math.ceil(Math.sqrt(o.words.length)),
    tracks,
  }
}
