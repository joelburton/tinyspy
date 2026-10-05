// cs-unmet

import type { GEvent } from '../types'

/**
 * stackdown — the turn-history replay. Given the event log and the id of a row in
 * it, reconstruct what the board looked like *at the moment that turn was about to
 * be played*, plus how to describe the turn.
 *
 * This is the removal-based twin of scrabble's `historyBoard`. scrabble *adds*
 * tiles each turn, so its replay folds placements onto an empty grid; stackdown
 * *removes* tiles (an accepted word clears its tiles off the stack), so the
 * replay is the reverse — start from the full board and take away the tiles that
 * earlier valid words had already cleared. Pure (no React, no supabase) and
 * unit-tested, so the PlayArea can hand `<Board>` a historical snapshot the same
 * way it hands it the live one.
 *
 * **A turn is named by its row's id**, and this resolves that id against the list
 * it is handed (coop = the shared log, compete = one racer's rows). `stackdown.events`
 * is keyed by a `bigint identity` in insert order, so the id is chronological across
 * a shared coop board and unambiguous under any filter the log applies — which is
 * why the `#N` a row shows (its place in the rows on screen) and the handle it
 * carries are two different values.
 *
 * The key boundary is **strictly before**: the snapshot for the viewed turn
 * removes tiles cleared by valid words at earlier positions, not including its own. That
 * leaves the viewed turn's own word still ON the board — which is exactly what we
 * want, because we then ring those tiles green ("this is the word this turn
 * played"), the same green scrabble uses for a turn's placements.
 *
 * See docs/games/stackdown.md for the rules and docs/playarea.md
 * for why turn-history is the feature driving the PlayArea decomposition.
 */

/** A past turn, replayed: the board as it stood when the turn was played. */
type HistorySnapshot = {
  // Tiles gone from the board as of the START of this turn — every VALID
  // word's at a position strictly before the viewed row's: the stack to show
  // while the turn is open.
  offTileIds: Set<string>
  // Tiles to ring green: this turn's OWN word tiles, but only when the turn is a
  // valid word (a hint / spoiler / rejected attempt cleared nothing, so this is
  // empty). These tiles are still on the board — the whole point of the
  // strictly-before boundary.
  litTileIds: Set<string>
  // A short, name-free label of what the turn did, keyed off its kind and
  // verdict. The log row already shows *who* played it, so the actor is omitted.
  label: string
}

/**
 * Reconstruct the board + label for the turn with this `id`, within the rows it
 * is resolved against — coop's shared log, or the rows of whoever wrote the row
 * being opened.
 */
export function makeHistorySnapshot(events: readonly GEvent[], id: number): HistorySnapshot {
  const index = events.findIndex((e) => e.id === id)
  const offTileIds = new Set<string>()
  for (const e of events.slice(0, Math.max(index, 0))) {
    if (e.kind === 'word' && e.valid) for (const t of e.tiles) offTileIds.add(t.id)
  }

  const turn = events[index]
  const isValidWord = turn !== undefined && turn.kind === 'word' && turn.valid === true
  const litTileIds = new Set<string>(isValidWord ? turn.tiles.map((t) => t.id) : [])

  return { offTileIds, litTileIds, label: makeLabel(turn) }
}

/**
 * The kind-aware turn label. A valid word "cleared" its letters; a rejected word
 * was "entered … — not a word"; a hint names its clue, a spoiler the word it
 * handed over.
 */
function makeLabel(turn: GEvent | undefined): string {
  if (!turn) return 'This turn'
  if (turn.kind === 'hint') return `Hint: ${turn.clue}`
  const word = turn.word!.toUpperCase()
  if (turn.kind === 'spoiler') return `Revealed ${word}`
  return turn.valid ? `Cleared ${word}` : `Entered ${word} — not a word`
}
