# core-css — todo

## Bugs

## Soon

- **Scroll region** — a utility for the box that scrolls inside a fixed
  parent: `flex: 1 1 auto` + `min-height: 0` + `overflow-y: auto`. Written
  by hand at dozens of sites (48 `min-height: 0`, 22 `overflow-y: auto` when
  counted).

## Someday

- **Six chrome shadow levels nobody chose.** They were preserved from what the
  component modules already held and given names, which is what made them look
  like a system. Five of the six have exactly ONE reader (`popover` alone has
  four: Menu ×2, FilterSelect, DefinitionPopover), so the rule that a value
  with one reader belongs in its class as a number disqualifies most of them;
  three share a geometry (`0 8px 24px`) and differ only in opacity (18 / 12 /
  8%); and they are not a ladder — `toast` is the TOPMOST layer and blurs 16
  where `dialog` blurs 48. The names also lead with the KIND where the grammar
  is bucket-first, and `notice` invents a category for one component
  (`DeviceBlockNotice`; global, it would be `--deviceBlockNotice-shadow`).
  Decide the count and the names.
- **Should `:hover` be gated to pointer devices, app-wide?** A touch device
  applies `:hover` when you tap and leaves it applied until you tap elsewhere,
  so on a phone a tapped row or button stays in its hover look indefinitely.
  The app has never used `@media (hover: hover)`. The model that makes it a
  decision: hover is a state only a pointer can be in — "I am over this and
  have not committed" — and a finger has no such state, it is off or pressing.
  So the answer pairs with its other half: gate `:hover` to `(hover: hover)`
  and give touch its own feedback with `:active`, which the app has almost
  nowhere. The header's marks are where it first bites (their background
  would carry both hover and press); the header may take it as a local rule
  first. Not decided.
- **`.card` and `.actions` each name two different things.** Global `.card` is
  the page card; a list row's inner box was also called `.card`. Global
  `.actions` is a COLUMN of buttons; `.modalActions` is an end-aligned ROW.
- **Padding on the spacer ramp?** `--spacer-*` governs `gap` and `margin`;
  padding is parked, not excluded. The room inside a box tends to run smaller
  and today's tuples are fitted to their box, so paddings stay ad hoc and the
  vocabulary guard does not look at them. Decide once there is more than two
  data points; every padding in the repo is one grep away.
- **`--opacity-1 / -2` want role names.** Numbers are a holding position:
  opacity spans at least two KINDS (a disabled control, a separator), and the
  role names arrive once the spectrum is visible.
- **Two `3px` borders survive** (the rank bar, the verdict outline) against
  `--border-width-line-thick` at 2px. Not pre-decided; the a/b/c rule at
  their area.
- **The resting width of the typeface.** Roboto Flex sets narrower than SF
  Pro; 110% was indistinguishable from what Joel is used to on the `/font`
  page. Not adopted — use it a while first, then tune, and re-check the
  surfaces already converted.
- **Fallback font metrics.** The system face stands in until the file lands
  and takes different space, so the `swap` moves text. `size-adjust` and the
  `ascent-override` family on a fallback `@font-face` make the stand-in
  occupy the same box. Understood as not urgent.

## Maybe

- **An EM vocabulary — and is it one vocabulary or two?** The eight
  vocabularies are rem or unitless; the one em vocabulary that exists is
  `letter-spacing`, and nobody thought that odd, because a ratio to the type
  is a good thing to name. The inventory forks: em spacing *between* things
  (`button.css`'s icon-to-label gutter, `gap: 0.4em`, and one former sibling),
  and em *sizing to* the type — about ten and growing: `--dot-size` at 0.6 /
  0.65 / 0.7em across four files, `--filter-select-dot: 0.65em`, the entry
  caret at `1.15em`, `StrikeMarks` at `1.05em`, `SetupNextPuzzleSection`'s
  `min-height: 1.4em`. The second family has the real spread and is invisible
  to a spacer guard (widths, heights, custom properties). Re-ask when a later
  area adds to either list.
- **`--border-width-frame-thick`** — the hypothetical fourth width, a heavier
  frame if your-move should ever read lighter than you-lost. Self-explains the
  day it is needed; nothing to rename.
