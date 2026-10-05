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

- **A compete timeout nobody made progress in crowns everyone.** With every
  chain empty, `submit_timeout`'s `won` check ties every player still in on
  zero letters and zero words, and makes them all co-winners. Ruled: if
  nobody covered a letter, the timeout is `timeout-no-winner`, as boggle,
  wordiply and setgame already do.

- **No ending of its own writes a `reason`.** Every ending writes one into
  the status blob; letterboxed's solve, timeout and Stop say how the game
  ended with their own flags (`solved`, `timed_out`, `stopped`) instead.
  Only `common.concede` writes one here (`'conceded'`). The words wait for
  the shared vocabulary (`plans/game-cards.md` → After the cards, step 7).

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
