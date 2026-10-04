# wordwheel — todo

## Bugs

## Soon

## Someday

- **Compete with no target, when a countdown is set.** The same change as
  spellingbee's (`src/spellingbee/todo.md`), for the same ending code: today
  `create_game` refuses compete with no `target_rank`; compete may leave it
  empty when the timer is a countdown, and the timeout crowns the top score
  (`co-winners` on a tie, nobody if nobody scored). The rule is
  plans/cross-game-consistency.md §3b, "a compete word hunt needs a target,
  a countdown, or both".

- **Every required word is the `goal-intrinsic`: coop with no target wins
  on it.** The same change as spellingbee's (`src/spellingbee/todo.md`),
  for the same ending code: today finding every required word ends and wins
  nothing; a coop game with no target should be `won` when the team finds
  every required word, and its timeout stays the neutral
  `timeout-no-result`.

## Maybe

- **`s`-heavy seeds.** An `s` tile lets each word pluralize once — the classic
  wheel's behavior, kept deliberately. If wheels with an `s` (especially an `s`
  *center*, which makes every word an s-word) feel too plural-y in play, a
  seed-level filter (or center exclusion) is a one-line follow-up in the
  import script or the edge function.

## Won't do

- **`wordsByWord` stays in `hooks/useSubmitWord.ts`** (Joel, 2026-10-04: "don't do
  it; keep what we have"). The map from a typed word to its `GWord` is built
  by the one hook that reads it, not carried on `gd.puzzle` the way
  `tilesById` is.
- **`Board.module.css` + `Tile.module.css` are deliberately NOT folded with
  spellingbee's pair of the same names** (2026-07-31). The rest of the
  pair's CSS is shared (`shared/bee-games`), but these stay separate copies.
  They're structurally parallel in their skeletons (`.board`, `.grid`,
  `.floatAnchor`, a tile), so a fold looks mechanically easy. The reason not
  to: it means picking ONE vocabulary for the shared class names, and a
  honeycomb has hexes where a wheel has tiles. That trades [tokens.md's
  two-vocabularies rule](../../docs/tokens.md#two-vocabularies--global-and-per-game)
  — names track the game's own concepts — for a few dozen lines of dedup, and
  the rules inside don't share anyway: the hive is SVG polygons (a hexagon
  can't be a bordered box) where the wheel is round boxes, so the hive's depth
  is a filter in user units and the wheel's is the shared box-shadow. **If it's
  ever revisited**, the tractable middle is the interaction layer under neutral
  names, leaving each game's shape rules local. Don't fold the whole file just
  because the skeletons rhyme. *(wordwheel is the fork, so this copy governs;
  spellingbee's `todo.md` points here.)*
