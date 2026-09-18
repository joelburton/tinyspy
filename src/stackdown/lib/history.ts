// cs-unmet

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
 * it is handed (coop = the shared log, compete = the caller's own). `stackdown.events`
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

/**
 * The event fields the replay needs — a structural subset of the hook's
 * `EventRow` (kept local so this lib stays free of any React/hook import).
 * A `word` submission carries the `tile_ids` it cleared and a `valid` verdict; a
 * `hint` / `spoiler` request carries neither (its `tile_ids` is null).
 */
export interface Submission {
  /** The row's own id — what the viewer addresses, resolved against the list
   *  being folded rather than indexed into it. */
  id: number
  kind: 'word' | 'hint' | 'spoiler'
  word: string | null
  tile_ids: number[] | null
  valid: boolean | null
}

export interface HistorySnapshot {
  /** Tiles gone from the board as of the START of this turn — the union of
   *  `tile_ids` from every VALID word at a position strictly before the viewed
   *  row's. Feed straight to `<Board offBoard>`. */
  offBoard: Set<number>
  /** Tiles to ring green: this turn's OWN word tiles, but only when the turn is a
   *  valid word (a hint / spoiler / rejected attempt cleared nothing, so this is
   *  empty). These tiles are still present in `offBoard`'s complement — the whole
   *  point of the strictly-before boundary. */
  historyLitTiles: Set<number>
  /** A short, name-free historyLabel of what the turn did, keyed off its kind and
   *  verdict. The log row already shows *who* played it, so the actor is omitted. */
  historyLabel: string
}

/**
 * Reconstruct the board + historyLabel for the turn with this `id`, within the
 * rows it is resolved against — coop's shared log, or the rows of whoever wrote
 * the row being opened.
 *
 * An `id` this list does not hold — a compete opponent's word, against your own
 * board — yields an empty green set and a neutral historyLabel, and an empty
 * `offBoard`: there is nothing of theirs here to replay.
 */
export function historySnapshot(submissions: ReadonlyArray<Submission>, id: number): HistorySnapshot {
  const index = submissions.findIndex((s) => s.id === id)
  const offBoard = new Set<number>()
  for (let i = 0; i < index && i < submissions.length; i++) {
    const s = submissions[i]
    if (s.kind === 'word' && s.valid && s.tile_ids) {
      for (const id of s.tile_ids) offBoard.add(id)
    }
  }

  const turn = submissions[index]
  const isValidWord = !!turn && turn.kind === 'word' && turn.valid === true
  const historyLitTiles =
    isValidWord && turn.tile_ids ? new Set(turn.tile_ids) : new Set<number>()

  return { offBoard, historyLitTiles, historyLabel: describe(turn) }
}

/**
 * The kind-aware turn label. A valid word "cleared" its letters; a rejected word
 * was "entered … — not a word"; a hint / spoiler names the text it surfaced (both
 * store their revealed text in `word` — the clue for a hint, the word itself for
 * a spoiler). Falls back gracefully if a row is missing its text.
 */
function describe(turn: Submission | undefined): string {
  if (!turn) return 'This turn'
  const word = turn.word?.toUpperCase()
  if (turn.kind === 'hint') return turn.word ? `Hint: ${turn.word}` : 'Requested a hint'
  if (turn.kind === 'spoiler') return word ? `Revealed ${word}` : 'Requested a word'
  // kind === 'word'
  if (turn.valid) return word ? `Cleared ${word}` : 'Cleared a word'
  return word ? `Entered ${word} — not a word` : 'Not a word'
}
