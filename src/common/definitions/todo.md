# definitions — todo

## Bugs

## Soon

- **Click-to-define repeats a four-part activation bundle at 14 surfaces**,
  and two of them have already reinvented the same helper — `WordList`'s
  `wordActivation` and wordle's `defineProps`, both returning
  `{ className, title: 'Click to define', data-word, onClick }`. Promote the
  PROPS, not the element: `definableProps(word, define)`. NOT a component —
  the definable thing is not always a word (wordle's is a five-square tile
  row, wordiply's a `<DimmedBaseWord>` with styled parts), and
  `useDefinePopover` holds its state per SURFACE, so a per-word component
  would need `define` threaded to each one or a context. A helper constrains
  no markup and leaves wordle's documented departure standing (colored blocks
  can't take an underline, so its hover cue is a ring). Two real drifts it
  would settle: `data-word` is the e2e handle convention and wordle's and
  letterboxed's spreads omit it, so those words can't be selected the standard
  way; and all fourteen pass a native `title` where the app uses
  `data-tooltip` + `TooltipHost` — the same opt-out, fourteen times.

## Someday

- **`useDefinePopover` is called at sixteen sites, each holding its own
  `{ word, rect }`, and `TooltipHost` is the proof it needn't be.** The
  popover is anchored to the element you clicked, which sounds like a reason
  it must live where the click happens, and isn't: `TooltipHost` is anchored
  to an arbitrary element too, from the root, with delegated document
  listeners — the payload is in the DOM (`data-tooltip`), the anchor is
  measured off `event.target` and rendered `position: fixed` in a body portal.
  Anchoring is a fact about the popover's STATE, not a constraint on its
  MOUNT. Two real differences to answer, neither a blocker: the popover is
  INTERACTIVE (a lookup, an edit affordance), so it has to own focus and
  Escape; and the definable thing is not always a word in the DOM, and
  delegation needs `data-word` everywhere (see the Soon item above).

## Maybe
