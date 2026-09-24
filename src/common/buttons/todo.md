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
## Someday

## Maybe

- **Rename the `--button-slot-secondary-*` tokens after what they hold?**
  `secondary` is a treatment and the slot holds a tone, so the name says who
  fills it rather than what it holds; its twin `--button-slot-primary-*` reads
  correctly. Declared in `StandardButton.module.css` and the two themes;
  `FeedbackPill.module.css` re-sets one to borrow a tone.

## Won't do

- **The "+" in "+ New club" stays a typed character, not an icon.** Joel,
  2026-09-24: the button is shown at a very small size, where an icon wouldn't
  read well; the "+" is fine.

