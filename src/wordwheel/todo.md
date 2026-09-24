# wordwheel — todo

## Bugs

## Soon

## Someday

## Maybe

- **`s`-heavy seeds.** An `s` tile lets each word pluralize once — the classic
  wheel's behavior, kept deliberately. If wheels with an `s` (especially an `s`
  *center*, which makes every word an s-word) feel too plural-y in play, a
  seed-level filter (or center exclusion) is a one-line follow-up in the
  import script or the edge function.

## Won't do

- **`Wheel.module.css` + `Tile.module.css` are deliberately NOT folded with
  spellingbee's `Letters.module.css` + `Letter.module.css`** (2026-07-31). The rest of the
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
