# buttons — todo

## Bugs

## Soon

- **Does `ShuffleButton`'s `font-size: 32px` do anything?** The glyph is sized
  by the component (`<IconShuffle size={24}>`), so the declaration only sets
  the line box its `inline-block` span sits on — which may still give the span
  height inside the 35px flex-centered pill, or may be inert. It cannot be
  settled by reading, only in a browser. Left in place until someone looks.
- **Disabled control** — one utility for the disabled look. Today
  `cursor: not-allowed` is written at eleven sites with the opacity spread
  over 0.45 / 0.5 / 0.55 / 0.6 (`Menu.itemDisabled`, `SelectField`,
  `SetupTimerSection`, `AnagramDialog`, `WordEditDialog`). The vocabulary has
  `--opacity-2` (0.5) for it. `StandardButton` states no disabled rule at all —
  its tell is the missing hover, delivered by `:not(:disabled)` on every hover
  rule — so the base is consistent and the hand-written sites are not.
- **`<ShuffleButton>` should never take focus at all** — game stuff doesn't.
  Its `:focus { outline: none }` says a click leaves no ring, then
  `:focus-visible` puts one back for a keyboard that has ⌥Z. The fix is
  removing the tab stop, not restyling the ring.
- **The plus in "+ New club" is a typed `+` character, not a glyph** — the
  last glyph-shaped affordance not in the icon registry. (Carried over from the
  small-buttons item, which is settled: see the folder's doc. A small BUTTON
  takes the `small` prop, which brings type, padding and the icon box together;
  the controls that write a small size by hand are links, triggers and list
  rows, so each is its own folder's to settle. Notes are filed with crosswords
  and scrabble, the two games holding one.)

## Someday

## Maybe
