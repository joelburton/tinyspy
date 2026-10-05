// cs-blessed-codenamesduet

/**
 * codenamesduet — the turn-history replay. Given the dealt tiles and the log,
 * rebuild the table as it stood at the END of a past turn, and which tiles that
 * turn decided — so the play surface hands `<Board>` a past board the same way
 * it hands it the live one.
 *
 * ADD-style replay: a guess only ever ADDS a reveal, so a past board is the
 * dealt tiles with every guess up to that turn folded on, by the builder's own
 * rule (supabase/sql/codenamesduet.sql → `_make_json_board`): an agent or the
 * assassin shows for both and points at nobody; a bystander shows `N` and
 * points at whoever turned it over.
 *
 * **Folded by turn.** The log lists TURNS — a clue and the guesses that
 * answered it, or in sudden death a single guess — and LINKS a turn by an event
 * id, as every game does. **The boundary is INCLUSIVE**: viewing turn N shows
 * the board AFTER turn N's guesses, with those tiles ringed.
 *
 * Pure (no React / supabase) + unit-tested.
 */

import { cluesOf, guessesOf } from './events'
import type { GClueEvent, GEvent, GGuessEvent, GPlayer, GPuzzleTile, GTile } from '../types'

/** One past turn, ready for the board and the viewer banner. */
type ReplayedTurn = {
  // The table as of the END of the viewed turn; nothing on it is guessable.
  tiles: GTile[]
  // The tiles this turn's guesses decided — ringed in the history blue.
  litTileIds: ReadonlySet<string>
  // A short, name-free label for the viewer banner (the log row shows who).
  label: string
}

/**
 * Replay the turn of event `eventId`: the table after it, its own tiles lit,
 * and its label. Null for an id the log does not hold.
 */
export function replayTurn(
  events: ReadonlyArray<GEvent>,
  puzzleTiles: ReadonlyArray<GPuzzleTile>,
  eventId: number,
  // The `#N` the log printed for the turn, so the banner shows back the number
  // that was clicked; null for an opening that came from no numbered row.
  n: number | null,
): ReplayedTurn | null {
  const turnNum = events.find((e) => e.id === eventId)?.turnNum
  if (turnNum === undefined) return null
  const tilesById = new Map(puzzleTiles.map((t) => [t.id, t]))
  const guesses = guessesOf(events, tilesById).filter((g) => g.turnNum <= turnNum)

  const shown = new Map<string, 'G' | 'A'>()
  const bystanderBy = new Map<string, Set<GPlayer>>()
  for (const g of guesses) {
    if (g.result === 'N') {
      const by = bystanderBy.get(g.tileId) ?? new Set<GPlayer>()
      by.add(g.by)
      bystanderBy.set(g.tileId, by)
    } else shown.set(g.tileId, g.result)
  }

  const tiles: GTile[] = puzzleTiles.map((puzzleTile) => {
    const contacted = shown.get(puzzleTile.id)
    const arrows = bystanderBy.get(puzzleTile.id)
    return {
      id: puzzleTile.id,
      puzzleTile,
      revealed: contacted !== undefined
        ? { as: contacted, arrows: new Set<GPlayer>() }
        : arrows !== undefined ? { as: 'N', arrows } : null,
      guessable: false,
    }
  })

  const turnGuesses = guesses.filter((g) => g.turnNum === turnNum)
  const clue = cluesOf(events).find((c) => c.turnNum === turnNum) ?? null
  const suddenDeath = events.find((e) => e.id === eventId)!.suddenDeath
  return {
    tiles,
    litTileIds: new Set(turnGuesses.map((g) => g.tileId)),
    label: describe(suddenDeath ? null : clue, turnGuesses, n),
  }
}

/** "#3: 2 BREAD → STEEL, COFFEE" — the number the log printed, the clue given that
 *  turn, then the words guessed in order (name-free; the log row already shows who).
 *  A guess-less turn reads "…— passed". A sudden-death turn has no clue:
 *  "#10: Sudden death → STEEL". */
function describe(clue: GClueEvent | null, turnGuesses: GGuessEvent[], n: number | null): string {
  const cluePart = clue ? `${clue.clueCount} ${clue.clueWord.toUpperCase()}` : 'Sudden death'
  const guessed = turnGuesses.map((g) => g.word.toUpperCase())
  const head = n === null ? cluePart : `#${n}: ${cluePart}`
  if (guessed.length === 0) return `${head} — passed`
  return `${head} → ${guessed.join(', ')}`
}
