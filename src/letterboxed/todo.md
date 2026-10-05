# letterboxed — todo

## Bugs

- **The board's word list can be silently cut short.**
  `letterboxed.candidate_words` returns a set with no order and no bound, and
  `letterboxed-build-board` calls it through PostgREST (`index.ts:158`,
  `:266`), so `max_rows` (10,000) applies. Sampling 300 seeds locally, 2 went
  over at the default band 5 (largest 10,694 rows) and 5 at band 6 (largest
  12,714; an earlier sample reached 17,260). Rows past the cap are dropped
  arbitrarily, so those words are missing from the board's accepted list and a
  legal word is refused. Fix: a `.range()` paging loop ordered by a unique key
  (docs/supabase.md → Query bounds), or return the list as one `jsonb` value.
- **`log_hint_or_spoiler` takes no game-row lock.** Every other move locks the
  game row (`select … for update`) so concurrent moves serialize
  (docs/supabase.md → Server conventions). Decide whether a hint/spoiler log
  can race anything that matters; if it can't, say so in the function.

## Soon

- **The below-board reserve is a hand-tuned constant.**
  `components/PlayArea.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 8rem`, where that last term stands for
  everything else in the board column — the entry row, the feedback slot, a
  mobile status bar. Nothing checks that it matches what is actually there.

  **This one is measured and wrong.** At 1128x617 the board column holds a
  95px chain strip + a 12px gap + a 44px entry row = 151px against the 128px
  reserved, and the page ends up 4px past the viewport. Its own comment calls
  the figure "about 8rem", which is the honesty problem in one word.

  Same construction as the shell's own `--game-chrome-height`, which was a
  hand-written `5rem` until 2026-09-15, when it turned out to omit the 1px
  rule under the header and put every desktop game page a pixel past the
  viewport. That one is composed from its terms now; this one is not.

  Too SMALL overflows the page; too LARGE wastes board. Neither shows without
  measuring, and the page-fits-the-viewport e2e cannot see either — it checks
  the play surface against the window, and this is the slack one level in,
  inside the board column.

- **`shuffle` in `supabase/functions/letterboxed-build-board/board.ts` is a
  hand-written Fisher–Yates** — `src/common/utils/shuffle.ts` is the same
  function with the rng optional, so the local one goes, its three seeded
  call sites pass their `rnd` unchanged, and the edge function imports the
  util by relative path with an explicit `.ts`, the way `scrabble-ai-move`
  imports `mulberry32`. The exported `shuffle` also has its own case in
  `board_test.ts` (permutes without mutating), which is pinned beside the
  util now and goes with it.

## Someday

## Maybe

## Won't do

- **A coop player carries no chain counts** (Joel, 2026-10-05: "the
  only-in-team is fine for coop; that makes it clearer"). Words used and
  letters covered describe the shared chain, so in coop they are `team`'s
  alone; a racer carries their own.
- **The blob does not store the word list twice** (Joel, 2026-10-05: "i'm
  trying to save the db from storing json that is twice as long as it needs
  to be"). It carries `words` and the few `uncleanWords`; `makeGameData` makes
  them `[{word, clean}]`.
- **The board's words are `words` everywhere** (Joel, 2026-10-05: "let's call
  it 'words' in all") — the edge function's board, the column, the blob.
- **Hints and spoilers are counted apart** (Joel, 2026-10-05: "two counts"),
  off the log, as `nHintsUsed` and `nSpoilersUsed`; `players.hints_used`
  keeps counting both and nothing reads it.
- **A tile's id is its letter** (Joel, 2026-10-05: "as letter"): the twelve
  are distinct by rule.
- **Covered letters are worked out from the words** (2026-10-05), on the
  board and in the history replay alike; no tile carries a `covered` fact.
- **The seeded pair waits for the end** (2026-10-05). It arrives in
  `game_data` once the game ends, in both modes, and still only shows when a
  player presses Reveal.
- **The move RPCs answer their `result` alone** (2026-10-05): what a word, an
  undo or a clear did, the page reads from the blobs.
