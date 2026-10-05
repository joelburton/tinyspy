// cs-unmet

/**
 * waffle — the turn-history replay. Given the deal and the log, rebuild what
 * the board looked like after any past swap, plus its label — so the PlayArea
 * can hand the board column a past board the same way it hands it the live one.
 *
 * Each swap is a reversible exchange of two cells, so a past board is just the
 * deal with the swaps up to that point applied.
 *
 * **The letters are replayed; the colors are READ.** Every log row carries the
 * board's colors as of that swap (`waffle.events.colors`, written by
 * `submit_swap`). Replaying letters needs nothing secret, but coloring them
 * needs the solution.
 *
 * **One player's swaps at a time.** A compete log holds every racer's swaps
 * interleaved, and applying a mixed list to the deal would build a board nobody
 * ever saw, so a compete replay applies the viewed row's author's rows only.
 * Mid-race `gd.events` holds only mine anyway (`useGame`'s seat rule).
 *
 * **The boundary is INCLUSIVE**: viewing a swap shows the board *after* it,
 * with the two cells it moved ringed — "this is what swap #N did".
 */
import { coord } from './waffle'
import type { GEvent, GLetterTile, GPlayer, GTile } from '../types'

/** One swap replayed: the board after it, its two tiles, its label and whose
 *  board it is. */
type ReplayedSwap = {
  tiles: GTile[]
  litTileIds: ReadonlySet<string>
  label: string
  author: GPlayer
}

/**
 * Replay the swap with this `id`: its author's swaps (every swap, in coop) up
 * to and including it, applied to the deal, colored by the row's own colors.
 * Null when the id names no row in the log — a Restart emptied it while the
 * row was open — so the live board shows.
 *
 * `n` is the `#N` the log was printing on the clicked row: the log's numbering
 * follows its filter, so it is passed in rather than counted here. Null drops
 * the number from the label.
 */
export function replaySwap(
  dealtTiles: ReadonlyArray<GLetterTile>,
  events: ReadonlyArray<GEvent>,
  id: number,
  n: number | null,
  isCompete: boolean,
): ReplayedSwap | null {
  const viewedEvent = events.find((e) => e.id === id)
  if (!viewedEvent) return null
  const boardEvents = isCompete ? events.filter((e) => e.by === viewedEvent.by) : events

  const letters = new Map(dealtTiles.map((t) => [t.id, t.letter]))
  for (const e of boardEvents.slice(0, boardEvents.indexOf(viewedEvent) + 1)) {
    const [a, b] = e.swaps
    letters.set(a.id, b.letter)
    letters.set(b.id, a.letter)
  }
  const tiles = dealtTiles.map((t): GTile => ({
    id: t.id,
    letter: letters.get(t.id)!,
    color: viewedEvent.colors[Number(t.id)] as GTile['color'],
  }))

  return {
    tiles,
    litTileIds: new Set(viewedEvent.swaps.map((s) => s.id)),
    label: describe(viewedEvent, n),
    author: viewedEvent.by,
  }
}

/**
 * The swap label — "#N: A (A1) ↔ B (C2)", matching the log row's
 * letters-and-coords. Null `n` drops the number.
 */
function describe(swap: GEvent, n: number | null): string {
  const [a, b] = swap.swaps.map((s) => `${s.letter.toUpperCase()} (${coord(Number(s.id))})`)
  return n === null ? `${a} ↔ ${b}` : `#${n}: ${a} ↔ ${b}`
}
