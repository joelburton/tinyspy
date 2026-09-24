# core-css — todo

## Bugs

## Soon

- **`@starting-style` would let an entering element transition, and nothing
  uses it yet.** A tooltip, a toast, any element that appears by mounting has
  no previous computed value, so a `transition` on it does nothing and the
  entry has to be a `@keyframes` — which is why `TooltipHost.module.css` holds
  eleven lines to fade one opacity. `@starting-style` gives a mounting element
  a "before", so three lines would do it, and it is supported everywhere the
  app cares about (Chrome 117+, Safari 17.5+, Firefox 129+). The question is
  not whether it works: it is whether the app takes it on as a house pattern,
  since the first file to use it is a precedent for every entry animation
  after. Decide here; the tooltip is the first customer either way.

## Someday

- **The chrome shadow names, which nobody chose.** The five `--shadow-*` were
  preserved from what the component modules already held and then given names,
  which is what made them look like a system. Two things are wrong with the
  set as named. They are not a ladder: `toast` sits on the topmost layer and
  blurs the least of the four chrome ones. And the names lead with the KIND
  where the grammar is bucket-first, so `notice` invents a category for a
  single component — written correctly it is `--deviceBlockNotice-shadow`.
  Also worth settling while renaming: `popover`, `panel` and `notice` are one
  geometry (`0 8px 24px`) at three opacities, which is either a deliberate
  three-step or an accident nobody has looked at. Decide the names.
- **`--game-chrome-height` is a hand-written 5rem against a sum of 5rem + 1px.**
  It stands for the body's vertical padding, the header's box
  (`--pageHeader-height` + its padding-bottom + the 1px rule) and GamePage's
  1rem gap, but is not composed from them, so a header or padding change
  moves it by hand — and at the phone breakpoint, where the padding halves,
  the number is over by 0.5rem while `playArea.module.css` trims a pixel the
  other way. Benign today: the play surface is a flex item and gives the
  pixel. Decide: compose it from the tokens the way `--game-header-bottom`
  does, or keep the number and say so.
- **Should `:hover` be gated to pointer devices, app-wide?** A touch device
  applies `:hover` when you tap and leaves it applied until you tap elsewhere,
  so on a phone a tapped row or button stays in its hover look indefinitely.
  The model that makes it a
  decision: hover is a state only a pointer can be in — "I am over this and
  have not committed" — and a finger has no such state, it is off or pressing.
  So the answer pairs with its other half: gate `:hover` to `(hover: hover)`
  and give touch its own feedback with `:active`, which the app has almost
  nowhere. The gate is already used by spellingbee's hexes, strands' tiles and
  the header's marks (which pair it with `:active`); the shared `.tile`, the
  on-screen keyboard's `.key`, and the boards of stackdown, wordwheel, boggle,
  letterboxed, setgame and connections' peer pick are not. Not decided —
  docs/mobile.md → The rules every screen keeps states the gate as the rule,
  so if the answer is no, that doc changes too.
- **`.card` names two different things.** Global `.card` is the bordered
  section of a page; four module stylesheets also declare a local `.card`
  that is not it — a popover's box, a device notice's box, setgame's playing
  card, crosswords' jump dialog. A module class shadows nothing, so this
  costs no pixel; it costs a reader who greps `.card`. Decide whether the
  global one should say what it is for, or whether the collision is fine.
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
  (`StandardButton.module.css`'s icon-to-label gutter, `gap: 0.4em`),
  and em *sizing to* the type — about ten and growing: `--dot-size` at 0.6 /
  0.65 / 0.7em across four files, `--filterSelect-dot: 0.65em`, the entry
  caret at `1.15em`, `StrikeMarks` at `1.05em`, `SetupNextPuzzleSection`'s
  `min-height: 1.4em`. The second family has the real spread and is invisible
  to a spacer guard (widths, heights, custom properties). Re-ask when a later
  area adds to either list.
- **`--border-width-frame-thick`** — the hypothetical fourth width, a heavier
  frame if your-move should ever read lighter than you-lost. Self-explains the
  day it is needed; nothing to rename.

## Won't do
