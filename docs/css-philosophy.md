# CSS philosophy — what we share, and why we haven't

> 🚧 **A LIVE CONVERSATION, not a decision.** Nothing here is blessed, nothing
> here has been applied, and no code or other doc has been changed on its basis.
> It exists so the reasoning survives the session it happened in — which is
> itself one of the things this conversation is about. When any part of it
> settles, that part moves into [ui.md](ui.md) or
> [code-conventions.md](code-conventions.md) and gets deleted from here.
>
> Started 2026-08-18, immediately after the button sweep.

## The trigger

Joel opened `AnagramDialog.module.css` — chosen at random, not because it was
bad — expecting roughly fifteen lines, and found four times that. The dialog
looks like every other dialog in the app: same shell, same shape, same form.
Almost everything in the file was a local re-statement of something another
dialog also states locally.

The question that came out of it isn't "fix this file". It's: **why does the
codebase work this way, is it good, and should it change?**

## The diagnosis

**We have a rigorous naming discipline for _values_ and none at all for
_patterns_.**

`theme.css` holds hundreds of carefully-reasoned tokens. Almost every one of
them is a *value* — a colour, a radius, an opacity. Meanwhile the *shapes* those
values get assembled into — a dialog body, a compact panel field, a line of
muted help text, a scrolling list inside a panel — have no names at all. Each is
re-assembled from tokens, locally, wherever it's needed.

Tokens can't see shape. `--radius-md` guarantees every dialog has identical
corners; nothing whatsoever guarantees two conceptually-identical inputs have
identical padding. And the one machine guard we built (`no unnamed colors`) only
looks at colour, so the drift it can't see is exactly the drift that accumulated.

### What we actually measured

Enough to establish the pattern is real, not enough to plan from:

- `theme.css` already ships global `.error` and `.muted` utilities. Several
  components re-implement `.error` locally anyway, in about five different
  spellings of the same idea.
- The "compact panel field" (the small input in the ⌥\` finder, the word lookup,
  the number-jump dialog, the crosswords search…) is a real repeated pattern.
  Every copy agrees on its colours and disagrees on its padding, several ways.
  It also uses *different tokens* from the global `input` rule — so there are two
  input families in the app and only one has a name.
- The iOS focus-zoom floor is re-declared per-file. It has to be: `theme.css`
  floors every `input` at 16px on touch, but a local class that sets its own
  `font-size` out-ranks the element rule, so each file re-adds the floor by hand.
  **The duplication is caused by the duplication.**
- Module CSS outweighs `theme.css` by roughly ten to one.

**A methodological warning, because it bit us inside this very conversation:**
the first pass looked for repeated patterns by searching for repeated *class
names*, and concluded some things were bespoke that aren't. AnagramDialog's
`.hint` is a case in point — it is not a hint (we use that word for "help me win
this game"); it is **help text**, smaller and muted, and that pattern is all over
the app under a different local name each time. Local names hide shared patterns,
so searching by local name to find shared patterns reproduces the bug it is
looking for.

## Why it ended up this way: modules don't forbid sharing, they price it

The tool never says no. It makes one path cost a keystroke and the other cost a
decision.

**Writing local costs typing.** The stylesheet already exists beside the
component and is already imported. The name can't collide with anything, so you
needn't even think about what to call it. You don't consider other consumers,
because you can't affect them.

**Promoting to shared costs judgment.** Decide it's general; pick where it lives;
pick a name that will read correctly at call sites that don't exist yet; consider
who else should adopt it; accept that changing it later means checking everyone.
None of that is hard. All of it is a *decision*, arriving exactly when you're
trying to finish something else.

Three things make the gradient irresistible rather than merely tempting:

1. **At the moment of writing, the evidence doesn't exist yet.** Building the
   second dialog you have two examples, one half-finished. "Is this general?" is
   genuinely unanswerable, so the careful answer is *"I don't know yet, keep it
   local"* — and that is the **right call, each time**. The bad outcome isn't
   produced by carelessness; it accumulates from a run of individually-correct
   decisions.
2. **Nobody comes back, because duplication is invisible from where the work
   happens.** You see one file at a time. Six copies of one idea in six
   directories are only visible from a whole-tree vantage point that normal work
   never occupies.
3. **Scoping deletes collisions — and collisions were the feedback signal.** In a
   global stylesheet, two people writing `.error` crash into each other, and the
   crash *forces the conversation*: merge, or say how they differ. Modules remove
   the irritation and the signal together. Five `.error` classes now coexist in
   perfect ignorance of each other. A question that used to be forced became a
   non-event.

And the price is asymmetric in time: local is cheap now and expensive later,
shared is expensive now and cheap later. Everyone discounts the future, so the
gradient runs downhill on every single occasion, without anyone ever *choosing*
duplication.

**The proof is inside this codebase.** Tokens got a cheap path — one obvious
file, one line to add, and the name is the whole artifact (you commit to a value,
not to a shape). So we built hundreds, carefully, with real reasoning attached.
Patterns had no such path, so we built almost none. Same people, same standards,
opposite outcomes. The difference was price, not intent.

Which is why this is not fixed by resolving to do better. It is fixed by
**re-pricing**: making the shared thing already exist, obvious and reachable, so
using it is the lazy option. Nobody wrote a bespoke dialog because they wanted
one. They wrote it because reaching for the shared one wasn't cheaper than typing
it.

## The conflation in `theme.css`, and the rule that inverted

Two ideas share that file and want opposite treatment. Terminology below is
**conversational, not blessed** — useful for this discussion, not proposed names.

| | what it is | why it's global |
|---|---|---|
| **standard look** | something used in many places that we want *consistent* — the padding inside a button, the density of a dialog | so it is **identical everywhere**; its defining property is that a variant must never exist |
| **theme** | something that would change if we swapped light / dark / cupcake mode | so it can be **swapped in one place**; its defining property is that a variant exists, or might |

Those are nearly opposite motivations, and they landed in one file because both
are "shared".

**Which makes `theme.css`'s standing instruction — _"Anything in this file is
GLOBAL — use sparingly"_ — correct for one and exactly inverted for the other.**
For theme, sparing is real economy: every token is a promise to supply a value in
every future variant, so a hundred colours becomes two hundred the day dark mode
ships. For standard look, sparing is an *instruction to duplicate*: the more of
the standard look lives in one place, the more consistent the app actually is and
the fewer copies exist. Told to be sparing there, the only remaining option is to
write it locally — which we did, hundreds of times, while believing we were being
disciplined.

### In this app, theme is almost entirely colour

Some apps re-theme structurally: buttons get rounder, boards resize, densities
change. Ours won't — the layouts are dense and specific and deliberately tuned.
Dark mode is white-on-black; cupcake would be pink-on-purple. **Spacing, density,
shape and layout are not theme at all.**

That has a sharp structural consequence: **those things don't want to be tokens.
They want to be classes.**

A token exists so a value can be reached from many places. If a shape lives in
one shared class there is only one place, so a token adds an indirection that
buys nothing and a name to maintain. **Tokens are for values with many readers; a
value inside a shared class has one.** Which gives an uncomfortable corollary
worth keeping:

> **Naming a value is sometimes a workaround for not having named the pattern.**

We have been minting tokens partly as a substitute for classes we weren't allowed
to write. A hypothetical `--form-gap: 0.4rem` is the tell — once the pattern has
a name, the number inside it doesn't need one.

It also **bounds the magic-number rule properly.** Guarding unnamed *colour* is
right: colour is theme-variable with many readers. Extending that instinct to
spacing would produce `--dialog-gap`, `--tight-dialog-gap`, `--form-gap` —
duplication with extra ceremony. Numbers inside a named pattern are fine as
numbers.

### Theme cuts ACROSS the structure, it doesn't nest inside it

Cupcake's purple titlebar isn't a dialog decision; it's a panel or app decision.
Its pink submit button isn't a dialog decision either. That's the tell that the
two axes are independent: colour doesn't live at any level of the structure, it
crosses all of them.

**So the shape classes should hold no colour of their own.** They compose it from
the palette.

**Which is, accidentally, exactly what the button sweep just built.** `.button` is
standard look — padding, border width, radius, no colour at all. `.primary` and
`.secondary` are the paint, and they read slot tokens rather than hexes so a
theme can move them without touching the shape. That is the standard-look /
theme separation done correctly, for exactly one element, arrived at by fixing a
bug rather than by design. **It is the model for everything else.**

### The test

> **Would a cupcake mode change this?**
> Yes → theme. Be sparing.
> No → standard look. Be generous.

### Colour is assumed-theme. Everything else waits to be asked for.

**Themes never change layout.** That is a rule, not an observation, and it is
load-bearing for everything below.

A theme might one day want a non-colour knob — a different opacity, a thicker
border in a place where `box-sizing: border-box` means nothing moves (the
declared width already includes the border, so thickening it eats inward instead
of pushing outward). Probably ten such
places will surface the first time a dark mode is actually built. **We add each
one when the need is identified, not proactively.** Colour, and only colour, is
assumed to be theme until something proves otherwise.

**This looks like it contradicts the tone-family completeness rule** — *write all
five values now, including the ones nothing reads* — and it's worth being clear
why it doesn't. Two conditions held there and neither holds here:

- **We knew the shape of the set.** Four tones × five roles is a closed grid you
  can enumerate. "Which shape properties might a dark mode need?" has no
  principled enumeration; any list written today is a guess wearing a
  vocabulary's clothes.
- **We had one formula.** Every tone value came from the same oklab derivation,
  which is what made completeness cheap and a later one-off dangerous. There is
  no formula for "how much thicker in dark mode" — each will be judged against an
  actual screen.

> **Complete the family when you know its shape and its formula. Wait when you
> know neither.**

The cost asymmetry agrees. The tone families had an *expensive* retrofit: a
missing value added later gets re-derived, possibly by a different method,
silently out of family. A theme knob has a *cheap* retrofit: find the hard-coded
value, name it, point one class at it — mechanical, local, verifiable. Proactive
completeness earns its keep exactly when the retrofit is expensive.

And the no-layout rule is what makes waiting safe: the worst case of guessing
wrong is a colour or a weight slightly off until someone adds a knob — visible,
cosmetic, fixed in one place. If themes could move things, a wrong guess could
break a board's geometry and the knobs would need enumerating up front. **The
constraint buys the permission.** (Same reason to add a border knob late rather
than early: whether thickening it is safe depends on the element's `box-sizing`
and on whether anything reads its content width — checkable in context, not
really in the abstract.)

**That seam turns out to be narrower than it first looked.** `theme.css` sets
`box-sizing: border-box` universally (`*, *::before, *::after`), so a thicker
border eats inward almost everywhere and moves nothing. There are exactly two
deliberate `content-box` exceptions — bananagrams' outer board border and
strands' board frame, both wanting the frame *outside* the measured content.
Both are **board geometry**, which is the one band games own outright under the
philosophy below. The exceptions land precisely where the model predicts they
should, which is some evidence the split is cut along a real joint.

**The failure mode to watch is not the one you'd expect.** It isn't failing to
predict the ten places. It's what happens when the tenth arrives: someone
hard-codes the dark value in a `prefers-color-scheme` block beside the light one
instead of naming a knob. Cheaper in the moment, invisible afterwards — the same
disease as everything else in this document.

One encouraging sign that the line is drawn in the right place: **it is already
machine-checked.** The `no unnamed colors` guard says every colour must be a
named token, which is exactly "colour is theme, so name it." The philosophy and
the existing guard turn out to be the same statement.

### The one seam that remains

**Density driven by _device_ rather than theme.** The mobile breakpoint changes
real spacing, and that is neither standard look nor theme — it's a third thing,
and the split doesn't currently have a place for it.

## Naming: local names, promoted on repetition

A worked question, using AnagramDialog's result count — a small muted line that
happens to look exactly like the help text above it. Two ways to write it:

| | |
|---|---|
| **A — utilities** | `<span class="muted smaller">` — compose the look at the call site; the classes know nothing about why |
| **B — a local name** | `<span class={styles.count}>` — a named class in the component's module |

**Settled: B.** With a test for when it applies:

> **Can you say what the thing is, in a sentence that doesn't mention how it
> looks?** *"The number of results found"* — yes, name it. *"This bit should be
> quieter than its neighbour"* — no, that's an adjustment, and utilities are
> honest.

The count passes. That its look currently coincides with help text is a fact
about styling, not about what it is. A thing with a **why** earns a name even
when its why doesn't yet earn a distinct look. (This is the distinction between
a **decided look** — `help-text`, which knows it is help and should look the same
in the info column, the setup dialog and a tight dialog alike — and a **utility**
— `muted`, which just means grey and knows nothing about why.)

Three reasons, in order of weight:

1. **Naming is cheap to keep and expensive to recover.** A local `.count` is
   *promotable*: the day a second component wants it, the name already exists and
   you lift it. Utilities sprayed across twenty call sites must be re-discovered
   *and* re-named from scratch, and nothing tells you which instances were ever
   the same idea. Utilities preserve information about **appearance**; names
   preserve information about **intent**. Appearance is recoverable by looking at
   the screen. Intent is not recoverable at all.
2. **The call site should record intent, not appearance** — intent survives a
   redesign, appearance is what the redesign changes.
3. **Utilities mix the two axes we just separated.** `muted` is colour (theme);
   `smaller` is size (standard look). Composing them in one attribute re-creates,
   at the call site, exactly the conflation we're pulling apart in `theme.css`.

The honest argument for A: utilities make duplication **visible in the markup**,
which attacks the vantage-point problem directly. But visible *as what?* Six
`muted smaller` might be one concept repeated or six unrelated quiet things, and
the markup can't say which — which is precisely the judgment you need. Visible
-but-meaningless versus invisible-but-meaningful; meaning is the input to the
decision. Utilities also drift as *combinations* — `muted smaller`,
`smaller muted nowrap`, `muted smaller tight` — which is the same drift relocated
into markup, where it is harder to audit rather than easier.

**Where A genuinely wins:** things with no role at all — spacing nudges,
alignment, a `nowrap`. Naming those manufactures fake semantics, and a fake
concept is worse than none, because future readers hunt for a meaning that was
never there. Roughly: **utilities for adjustments, names for things.**

### The decision point is the SECOND write, not the first

B's weakness is the one this document opened with: local names hide shared
patterns. The antidote is to promote on repetition — the moment three modules
are saying the same thing, that belongs in one place. But *when* do you decide?

Not at the first write. There the evidence genuinely doesn't exist and "keep it
local" is correct (see the gradient, above). **The second write is the moment**,
and it has two properties nothing else does:

- **The evidence has arrived.** One instance is a thing; two is a pattern with a
  witness.
- **You are, right then, the only person holding both cases in your head.**
  Nobody will ever again have this pattern's full context loaded at once.
  Promotion will never be cheaper than it is at that exact moment.

And it already announces itself: **copy-pasting a rule out of another module IS
the signal.** If you are copying, you have already found the pattern — you've
just chosen to record it as duplication rather than as a name. No audit is needed
for the common case; there is a reflex to redirect. The thought *"I'll grab that
from the other dialog"* is the notification firing, and we currently hear it as
convenience.

**Threshold: two, not the traditional three.** Rule-of-three assumes you will be
present for the third. Here you often won't — and the costs are asymmetric: a
class promoted too early is cheap to inline back, while a third copy nobody saw
is drift that survives indefinitely.

### Noticing it afterwards

`muted smaller`, `smaller muted nowrap` and `muted smaller tight` across three
modules isn't a prompt to go and promote something — it's how you tell, looking
back, that the moment was already missed. Each such cluster points at a shared
thing that either didn't exist or couldn't be found when it was needed, which
makes it a work item with a name on it rather than a reason to be more careful.

Two notes on reading them. **They say "look here", not "merge these"** — things
that look alike aren't always the same concept, and this document's first pass
made the mirror error, searching by class *name* and calling something bespoke
that was everywhere under other names. And **this kind of repetition is
machine-noticeable**, unlike "is this the same concept?" — so if it ever wants an
instrument, that instrument should *notice* rather than *forbid*: a report a
human judges, not a failing test. Forbidding fits colour, where the answer is
always "name it".

## On coupling — a correction

The first response in this conversation argued against a fat shared dialog class
on the grounds that shared classes get fought by their consumers, citing the
button mess as evidence. **That was wrong, and the corrected version matters more
than the original claim.**

Nothing about the button mess argued that buttons shouldn't be coupled. It
argued we had coupled **the wrong noun**. Binding *the `<button>` element* to a
look forced every non-button to opt out; binding *real buttons* to a look would
have forced nothing. The pain came from coupling a **syntactic** category to a
**visual** one — not from coupling as such.

So the test isn't "is this shared?" It is:

> **If this changed, should every instance change?**

When the answer is yes, coupling isn't a risk being accepted — it's the thing you
want, and leaving it uncoupled is the bug. For dialogs the answer is obviously
yes. That is what a design system *is*.

Two related things also argued badly and now withdrawn:

- **The removability invariant was misapplied.** It exists so `strands/` can't
  reach into `boggle/`. A fat dialog class in `common/` doesn't touch that —
  deleting a game leaves it untouched, which is the entire point of it being in
  `common/`. (And realistically we will never delete a game; the invariant's
  actual job is preventing cross-game reaching.)
- **"It's already logged in `deferred.md`" doesn't make a divergence
  deliberate.** The one-off `opacity: 0.6` on a dialog's disabled button is drift
  that acquired a ticket. Nobody ever thought "this dialog's disabled state
  should differ." A backlog entry describing an accident is still an accident.

### The one caution that survives

Not "don't couple". It's: **a fat shared class must not have a silent default.**

The button bug wasn't fatness — it was that saying nothing meant something. The
bare element meant *filled*; `.button` alone meant *primary*. Both times the
damage came from an unmarked case that looked like the absence of a decision but
was one.

Applied to the dialogs: "tight" and "loose" should both be **said**, with neither
being what you get by staying quiet. Fat is fine. Fat and implicit is how you end
up with twenty-nine rules whose first three lines are an apology.

## Where this leaves the philosophy

Stated as directly as we've got it so far:

1. **Chrome is shared by default.** Games own board geometry (hexes vs circles vs
   a 15×15 grid) and brand colour (spellingbee yellow, wordwheel rust) — and
   close to nothing else. Everything else is meant to look the same, and
   currently only *happens* to look the same, which is a much weaker property.
2. **Name patterns, not just values.** The unit of sharing is the pattern.
3. **Two shared layers, opposite rules.** Theme: thin, sparing, colour. Standard
   look: fat, generous, everything else.
4. **Shape classes carry no colour**; they compose it from the palette.
5. **Every variant is marked**; no silent defaults.
6. **Modules keep the narrow band** — the genuinely per-game stuff — and stop
   being where chrome lives.

## What the outcome probably looks like

A shape-check done before shelving this, so step 3 doesn't start from scratch:

- **Less CSS overall**, and *much* less in game modules. The acceptance test:
  what should be LEFT in a game's module is board geometry and brand colour. A
  dialog rule or a button rule still sitting in a game module means we missed
  one.
- **Shared files cut by PATTERN, not by container** — fields, help text, lists,
  panel bodies, densities. A file named for a place ("dialogs") invites
  place-flavoured copies of general things: help text in a dialog is the same
  help text as in the info column, and it shouldn't have to live in a file about
  dialogs to be reachable from one.
- **The token file becomes a VOCABULARY, with modes supplying values** — one
  place defining which tokens exist and what each means, and each mode
  overriding the same names in its own block. Not a file per mode: that is two
  parallel lists of identical names required to stay in lockstep, which is a
  drift machine of exactly the kind described above. (The button work already
  does it this way, so this is a continuation rather than a new idea. It also
  argues against naming the file for one mode.)

Two things that will move the wrong way, worth expecting rather than
discovering: **markup gets slightly more verbose**, because call sites now name
the pattern they want — that's the trade. And **line count is the wrong metric**;
the number to watch is *how many places a given decision is expressed*.

## Not settled

- Whether CSS Modules stay for chrome at all, or only for board/brand. Joel's
  read: *"perhaps CSS modules hurt us more than they help us"* — the app is
  mostly meant to be shared, and modules are sized for the opposite assumption.
  Undecided; the gradient argument says the fix is re-pricing rather than
  removal, but that hasn't been tested.
- Whether "tight dialog" / "loose dialog" is the right cut, or whether it's a
  base plus two density variants.
- Where the shared layer lives once it's more than tokens, and what that does to
  the `theme.css` name (a file called *theme* holding standard look is part of
  how the two got conflated in the first place).
- Whether any of this warrants a guard, and what a guard for *shape* drift could
  even look like. Colour was easy to guard; "this is the fourth copy of the same
  box" is not obviously machine-checkable.

## Loose ends this conversation turned up

- **Three dead `:hover` rules** left behind in the button sweep — the dialogs
  whose hand-rolled fill was removed kept their hand-rolled hover, which the
  shared rule now out-ranks. Harmless, invisible, and exactly the "I'll just add
  it locally" reflex under discussion.
- **`AnagramDialog`'s `.hint` is misnamed** — it's help text, not a hint.
- **`docs/playarea-decomposition-plan.md` doesn't exist** but is referenced from
  many files; the plan was deleted when the work shipped and the references were
  never repointed at [playarea.md](playarea.md). Unrelated to CSS, found while
  auditing. The doc-link guard doesn't catch it because it only checks
  markdown-to-markdown links, not paths named in code comments.
