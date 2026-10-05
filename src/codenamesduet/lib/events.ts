// cs-blessed-codenamesduet

import type { GClueEvent, GEvent, GGuessEvent, GPuzzleTile } from '../types'

/** Every clue given, in the order given. */
export function cluesOf(events: ReadonlyArray<GEvent>): GClueEvent[] {
  return events.filter((e): e is GClueEvent => e.kind === 'clue')
}

/** Every guess, in the order made, each with the word on its tile. */
export function guessesOf(
  events: ReadonlyArray<GEvent>,
  tilesById: ReadonlyMap<string, GPuzzleTile>,
): GGuessEvent[] {
  return events
    .filter((e) => e.kind === 'guess')
    .map((e) => ({ ...e, word: tilesById.get(e.tileId!)!.word }) as GGuessEvent)
}
