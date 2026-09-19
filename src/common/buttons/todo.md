# buttons — todo

## Bugs

## Soon

- **Does `ShuffleButton`'s `font-size: 32px` do anything?** The glyph is sized
  by the component (`<IconShuffle size={24}>`), so the declaration only sets
  the line box its `inline-block` span sits on — which may still give the span
  height inside the 35px flex-centered pill, or may be inert. It cannot be
  settled by reading, only in a browser. Left in place until someone looks.
- **One disabled opacity, not five.** `base.css` already gives every
  `button:disabled` the fade and `cursor: not-allowed`, deliberately on the
  ELEMENT so a disabled game piece, keycap or list row behaves like a disabled
  button. Every surface that overrides it makes disabled FAINTER than that
  global, and they disagree with each other — which reads as the global being
  too subtle rather than as each surface needing its own. `--opacity-1` sits
  0.05 from `--chrome-disabled-opacity`, close enough that they cannot be two
  decisions. Picking one number is a `core-css` question; what belongs to a
  button is only that its tell is the missing hover, which every hover rule
  delivers by asking `:not(:disabled)`.
- **The plus in "+ New club" is a typed `+` character, not a glyph** — the
  last glyph-shaped affordance not in the icon registry. (Carried over from the
  small-buttons item, which is settled: see the folder's doc. A small BUTTON
  takes the `small` prop, which brings type, padding and the icon box together;
  the controls that write a small size by hand are links, triggers and list
  rows, so each is its own folder's to settle. Notes are filed with crosswords
  and scrabble, the two games holding one.)

## Someday

## Maybe

## Won't do
