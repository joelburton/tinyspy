/**
 * stackdown — the turn-history replay. Given the submission log and a turn's
 * `seq`, reconstruct what the board looked like *at the moment that turn was
 * about to be played*, plus how to describe the turn.
 *
 * This is the removal-based twin of scrabble's `boardUpToSeq`. scrabble *adds*
 * tiles each turn, so its replay folds placements onto an empty grid; stackdown
 * *removes* tiles (an accepted word clears its tiles off the stack), so the
 * replay is the reverse — start from the full board and take away the tiles that
 * earlier valid words had already cleared. Pure (no React, no supabase) and
 * unit-tested, so the PlayArea can hand `<Board>` a historical snapshot the same
 * way it hands it the live one.
 *
 * The key boundary is **strictly before**: the snapshot for turn N removes tiles
 * cleared by valid words with `seq < N`, NOT `≤ N`. That leaves turn N's own word
 * still ON the board — which is exactly what we want, because we then ring those
 * tiles green ("this is the word this turn played"), the same green scrabble uses
 * for a turn's placements.
 *
 * See docs/games/stackdown.md for the rules and docs/playarea-decomposition-plan.md
 * for why turn-history is the feature driving the PlayArea decomposition.
 */

/**
 * The submission fields the replay needs — a structural subset of the hook's
 * `SubmissionRow` (kept local so this lib stays free of any React/hook import).
 * A `word` submission carries the `tile_ids` it cleared and a `valid` verdict; a
 * `hint` / `reveal` request carries neither (its `tile_ids` is null).
 */
export interface Submission {
  seq: number
  kind: 'word' | 'hint' | 'reveal'
  word: string | null
  tile_ids: number[] | null
  valid: boolean | null
}

export interface TurnSnapshot {
  /** Tiles gone from the board as of the START of this turn — the union of
   *  `tile_ids` from every VALID word submission with `seq < seq`. Feed straight
   *  to `<Board offBoard>`. */
  offBoard: Set<number>
  /** Tiles to ring green: this turn's OWN word tiles, but only when the turn is a
   *  valid word (a hint / reveal / rejected attempt cleared nothing, so this is
   *  empty). These tiles are still present in `offBoard`'s complement — the whole
   *  point of the strictly-`<` boundary. */
  greenTiles: Set<number>
  /** A short, name-free description of what the turn did, keyed off its kind and
   *  verdict. The log row already shows *who* played it, so the actor is omitted. */
  description: string
}

/**
 * Reconstruct the board + description for the turn at `seq`, over the submissions
 * visible to the caller (coop = the shared log, compete = the caller's own — the
 * PlayArea passes whichever list it already shows, so the mode split is free).
 * `submissions` need not be sorted (we filter on `seq`, we don't slice).
 *
 * A `seq` with no matching submission (shouldn't happen — the caller only ever
 * passes a row's own seq) yields an empty green set and a neutral description; the
 * `offBoard` is still well-defined (every valid word strictly before it).
 */
export function turnSnapshot(submissions: ReadonlyArray<Submission>, seq: number): TurnSnapshot {
  const offBoard = new Set<number>()
  for (const s of submissions) {
    if (s.seq < seq && s.kind === 'word' && s.valid && s.tile_ids) {
      for (const id of s.tile_ids) offBoard.add(id)
    }
  }

  const turn = submissions.find((s) => s.seq === seq)
  const isValidWord = !!turn && turn.kind === 'word' && turn.valid === true
  const greenTiles =
    isValidWord && turn.tile_ids ? new Set(turn.tile_ids) : new Set<number>()

  return { offBoard, greenTiles, description: describe(turn) }
}

/**
 * The kind-aware turn label. A valid word "cleared" its letters; a rejected word
 * was "entered … — not a word"; a hint / reveal names the help it surfaced (both
 * store their revealed text in `word` — the clue for a hint, the peeked word for
 * a reveal). Falls back gracefully if a row is missing its text.
 */
function describe(turn: Submission | undefined): string {
  if (!turn) return 'This turn'
  const word = turn.word?.toUpperCase()
  if (turn.kind === 'hint') return turn.word ? `Hint: ${turn.word}` : 'Requested a hint'
  if (turn.kind === 'reveal') return word ? `Revealed ${word}` : 'Requested a word'
  // kind === 'word'
  if (turn.valid) return word ? `Cleared ${word}` : 'Cleared a word'
  return word ? `Entered ${word} — not a word` : 'Not a word'
}
