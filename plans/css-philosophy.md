# CSS philosophy — what we share, and why we haven't

> 📓 **REASONING ARCHIVE, as of 2026-08-20.** The executable plan is
> [app-audit.md](app-audit.md), which cites sections of this file rather
> than restating them. This one is kept in full and on purpose: it is where the
> arguments live, including the ones that lost. The note below is how it was
> written and still describes its standing — nothing here is blessed by being
> here; a thing is settled when app-audit.md says so.

> 🚧 **A LIVE CONVERSATION, not a decision.** Nothing here is blessed, nothing
> here has been applied, and no code or other doc has been changed on its basis.
> It exists so the reasoning survives the session it happened in — which is
> itself one of the things this conversation is about. When any part of it
> settles, that part moves into [ui.md](../docs/ui.md) or
> [code-conventions.md](../docs/code-conventions.md) and gets deleted from here.
>
> Started 2026-08-18, immediately after the button sweep. **The color layer**
> (palette / semantics / meaning) was added 2026-08-19 as a second, largely
> independent strand — see that section for its own status and sequencing.

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
them is a *value* — a color, a radius, an opacity. Meanwhile the *shapes* those
values get assembled into — a dialog body, a compact panel field, a line of
muted help text, a scrolling list inside a panel — have no names at all. Each is
re-assembled from tokens, locally, wherever it's needed.

Tokens can't see shape. `--radius-md` guarantees every dialog has identical
corners; nothing whatsoever guarantees two conceptually-identical inputs have
identical padding. And the one machine guard we built (`no unnamed colors`) only
looks at color, so the drift it can't see is exactly the drift that accumulated.

### What we actually measured

Enough to establish the pattern is real, not enough to plan from:

- `theme.css` already ships global `.error` and `.muted` utilities. Several
  components re-implement `.error` locally anyway, in about five different
  spellings of the same idea.
- The "compact panel field" (the small input in the ⌥\` finder, the word lookup,
  the number-jump dialog, the crosswords search…) is a real repeated pattern.
  Every copy agrees on its colors and disagrees on its padding, several ways.
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
| **theme** | something that would change if we swapped in a different theme — daytime, midnight, cupcake | so it can be **swapped in one place**; its defining property is that a variant exists, or might |

Those are nearly opposite motivations, and they landed in one file because both
are "shared".

**Which makes `theme.css`'s standing instruction — _"Anything in this file is
GLOBAL — use sparingly"_ — correct for one and exactly inverted for the other.**
For theme, sparing is real economy: every token is a promise to supply a value in
every future variant, so a hundred colors becomes two hundred the day dark mode
ships. For standard look, sparing is an *instruction to duplicate*: the more of
the standard look lives in one place, the more consistent the app actually is and
the fewer copies exist. Told to be sparing there, the only remaining option is to
write it locally — which we did, hundreds of times, while believing we were being
disciplined.

### In this app, theme is almost entirely color

Some apps re-theme structurally: buttons get rounder, boards resize, densities
change. Ours won't — the layouts are dense and specific and deliberately tuned.
A dark theme is light-on-dark; cupcake would be pink-on-purple. **Spacing,
density, shape and layout are not theme at all.**

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

It also **bounds the magic-number rule properly.** Guarding unnamed *color* is
right: color is theme-variable with many readers. Extending that instinct to
spacing would produce `--dialog-gap`, `--tight-dialog-gap`, `--form-gap` —
duplication with extra ceremony. Numbers inside a named pattern are fine as
numbers.

### Theme cuts ACROSS the structure, it doesn't nest inside it

Cupcake's purple titlebar isn't a dialog decision; it's a panel or app decision.
Its pink submit button isn't a dialog decision either. That's the tell that the
two axes are independent: color doesn't live at any level of the structure, it
crosses all of them.

**So the shape classes should hold no color of their own.** They compose it from
the palette.

**Which is, accidentally, exactly what the button sweep just built.** `.button` is
standard look — padding, border width, radius, no color at all. `.primary` and
`.secondary` are the paint, and they read slot tokens rather than hexes so a
theme can move them without touching the shape. That is the standard-look /
theme separation done correctly, for exactly one element, arrived at by fixing a
bug rather than by design. **It is the model for everything else.**

### The test

> **Would a cupcake mode change this?**
> Yes → theme. Be sparing.
> No → standard look. Be generous.

### Color is assumed-theme. Everything else waits to be asked for.

**Themes never change layout.** That is a rule, not an observation, and it is
load-bearing for everything below.

A theme might one day want a non-color knob — a different opacity, a thicker
border in a place where `box-sizing: border-box` means nothing moves (the
declared width already includes the border, so thickening it eats inward instead
of pushing outward). Probably ten such
places will surface the first time a dark mode is actually built. **We add each
one when the need is identified, not proactively.** Color, and only color, is
assumed to be theme until something proves otherwise.

**This looks like it contradicts the tone-family completeness rule** — *write all
five values now, including the ones nothing reads* — and it's worth being clear
why it doesn't. Two conditions held there and neither holds here:

- **We knew the shape of the set.** Four tones × five *treatments* is a closed grid
  you can enumerate. ("Treatment" deliberately, not "role" — the color layer below
  gives *role* a specific meaning, and these are a different axis.) "Which shape properties might a dark mode need?" has no
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
wrong is a color or a weight slightly off until someone adds a knob — visible,
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
machine-checked.** The `no unnamed colors` guard says every color must be a
named token, which is exactly "color is theme, so name it." The philosophy and
the existing guard turn out to be the same statement.

### The one seam that remains

**Density driven by _device_ rather than theme.** The mobile breakpoint changes
real spacing, and that is neither standard look nor theme — it's a third thing,
and the split doesn't currently have a place for it.

## The color layer: palette, semantics, meaning

> Added 2026-08-19, a separate conversation from the one above and further from
> settled — a collection of ideas converging on a plan, not a plan.
> **Explicitly sequenced AFTER the tile-feedback sprint.** Nothing here gets
> touched until those sixteen games are converted; the conversions are meanwhile
> generating exactly the evidence this section needs (see the roster's per-game
> color questions in [tile-feedback.md](tile-feedback.md)).

The section above concludes that theme is almost entirely color and stops there.
This one asks what shape the color half should have.

### The measurement that started it

Across every `.css` file in `src/`: **170 distinct hexes** backing 360 tokens,
spread over 17 `theme.css` files. Clustered by hue family:

| family | distinct | family | distinct |
|---|---|---|---|
| orange / warm | 48 | red | 22 |
| gray | 33 | blue | 21 |
| green | 17 | gold | 14 |
| purple | 8 | pink, teal | 7 |

Seventeen greens where three would do, and thirty-three grays. This is not
visible from inside any one file — it took a script — which is the same
vantage-point problem the diagnosis above describes, in the one dimension we
believed was already disciplined. The `no unnamed colors` guard was working
exactly as designed the entire time: it enforces that colors are *named*, and
says nothing about how many of them there are.

### Three layers, and only the first holds a hex

| layer | example | knows |
|---|---|---|
| **palette** | `--red-ink`, `--red-wash`, `--tile-3-fill` | what job this color does on a surface — and, where the consumers are homogeneous, at which intensity |
| **semantic** | `--outcome-lost-fill-color` | what it means in this app |
| **component / game** | `--codenamesduet-assassin-color` | one place's decision, and why |

(An earlier draft had four, with a numbered palette under a normalization layer.
See *Palette entries are named for their ROLE* below for what removed it.)

> **Semantic tokens hold references, never values.**

Only the palette holds a color; every layer above it holds a `var()`. That is
precisely what makes those layers theme-invariant, and it has a consequence worth
stating before it bites: **if a meaning needs a per-theme value, the palette must
grow something for it to point at.** A meaning cannot simply be handed a value
where it stands, because where it stands is the same in every theme.

**The layers are roles, not files.** A game's stylesheet may hold a palette-layer
entry (a brand anchor of its own) *and* component-layer references to it — see
*Where a bespoke per-theme game color lives* below. "Hexes appear only in the
palette" is a claim about which layer a line belongs to, never about its location
on disk.

**What the palette layer buys is not consistency — we already have that, via
semantics.** It is that **theme authoring compresses from 360 decisions to
roughly 50.** "Build dark mode" currently means supplying a value for every
semantic token; with a palette layer it means supplying a few hue ramps and
letting the rest follow. That is the difference between a weekend and a project
nobody starts.

Rough sizing, done on the back of an envelope and not verified: about **8 hue
families × 5 roles = 40**, plus **~10 neutrals**, ≈ 50. And of those 50, a theme
author **hand-picks only the ~10 bases** — the rest derive. Two further things
stay outside the number entirely:

- **Most brand color is not theme-supplied** — level 1 below is locked outright,
  level 2 varies in shade only.
- **Component and game tokens are references, not values.** They cost a theme
  author nothing.

**Count DECISIONS rather than values when judging any of this.** Fifty entries
derived from eight anchors is eight decisions, not fifty — which is the whole
point, and the reason the count of resulting values barely matters. Against
today's ~170 hand-picked hexes the honest comparison is **~170 decisions → eight
anchors plus whatever fails to derive cleanly**, call it 25.

**A testable prediction, since the current number is known:** if a real attempt
cannot get the *value* count below ~120, some of the current set is carrying
distinctions nobody knew were there — worth investigating rather than forcing.

### The ramp is defined by distance from the PAGE, not by lightness

The one idea everything else rests on. `-wash` moves **toward** the page,
`-edge` and `-ink` move **away** from it. In light mode toward-page is lighter;
in dark mode it is darker. One rule generates the whole ramp in any theme, and
it survives dark mode's inversion because it never claimed a direction in the
first place.

This is also why a Tailwind-style 50→900 scale is the wrong borrowing: those
numbers encode a *lightness* claim, which becomes a lie the moment the page goes
dark.

### POLARITY and THEME are two different things

Which needs saying because half the rules in this section are written per-polarity
and the other half per-theme, and the words are easy to run together.

**Polarity** is structural: is the page light or dark. There are exactly two.
**Theme** is identity: which set of colors this is. There are as many as we want,
and **each theme declares one polarity.**

| theme | polarity |
|---|---|
| daytime | light |
| cupcake | light |
| midnight | dark |
| horror | dark |

Names illustrative, but the shape is the point — and note that even the ordinary
themes get names of their own. **Never name a theme after its polarity.** A theme
called *light* alongside a polarity called *light* means neither word identifies
which one is meant; `daytime` / `midnight` keeps `light` / `dark` as category
words exclusively. (Which also means theme selectors name *themes* —
`[data-theme="midnight"]` — while polarity is expressed by grouping those
selectors, so the polarity rules are stated once and themes opt into them.)

What belongs to each:

| **polarity** decides | **theme** decides |
|---|---|
| which direction is "away from the page" — so which of dim-up / dim-down is `--stronger` | the hue anchors themselves |
| where each role lands on its ramp | the page and tile hues — the level-3 decoration |
| which hue is the awkward one: yellow/gold on a light page, blue/purple on a dark one | the ramp's *magnitude* — cupcake may want softer contrast |
| the ink↔page relationship every relative rule is written against | any per-game brand override |

**Polarity is not "black or white" — it is which side of the ramp the page sits
on.** A dark-polarity theme might be deep plum rather than near-black, and horror
could be very dark red. Everything relative is computed against the *actual* page
color, never against `#000`, which is exactly what lets a theme be dark-polarity
and strongly colored at once.

**One decision this makes implicitly, worth making on purpose: is polarity a
property each theme declares, or is there a theme × polarity GRID?** The table
above is the first — cupcake *is* light — and it is the cheap, sensible default.
But the general case is a grid, and there is a reason a user might expect one:
`prefers-color-scheme` is a *system* setting, so somebody running cupcake with
their OS in dark mode could reasonably expect a dark cupcake — same pink identity,
deep plum page instead of pale pink. That would roughly double the authoring work.

The thing to preserve either way: **polarity is declared, not inferred.** So long
as a theme *states* its polarity rather than having it deduced from its page
color, one can gain a second polarity later without restructuring — cupcake-light
and cupcake-dark become two entries sharing hue anchors and brand decisions.
Choosing one polarity per theme now costs nothing, provided the door is left open.

### Palette entries are named for their ROLE — the numbers mostly lost

*("Mostly": one ramp keeps its numbers, and legitimately. See the section on
homogeneous consumers below.)*

**This reverses two earlier rounds of this conversation**, which argued for
numbered ramp steps (`--red-3`, or sparse `--red-40`) with roles as a thin alias
layer above. The reversal is recorded rather than tidied away, because the
argument that killed it is the most useful thing in this section.

The case for numbers was that they are **self-ordering**: `red-1` versus `red-2`
needs no memory, where *"is `wash` closer to the page than `subtle`?"* does. That
is true, and it is not enough.

#### What killed it: a nominal step carries no shared meaning

Measured across the four outcome families, all at Material's **800** — nominally
one step:

| ink | hex | contrast vs white |
|---|---|---|
| lost (red 800) | `#c62828` | **5.62** |
| won (green 800) | `#2e7d32` | **5.13** |
| warning (orange 800) | `#ef6c00` | **3.08** |
| near (gold, yellow 800) | `#f9a825` | **1.97** |

**A 2.9× spread at one position.** So "800" is a family index and nothing more —
it is neither iso-lightness nor iso-contrast, and it never was.

The obvious repair is to make the number mean something real (distance from the
page, honestly measured). That fails harder. For gold to sit where red's ink
sits it would need to reach 5.62 against white, which is a bronze — and this
document already records wordle rejecting a gold at **3.0** for no longer reading
as its yellow. The honest number would place gold's ink at roughly half the
contrast the position claims.

Which leaves the trap in full:

- **`--gold-80`** — dark enough to read, no longer recognizably gold.
- **`--gold-55`** — recognizably gold, not dark enough to read.
- **Nudging `--gold-55`'s hex darker** — the name now lies, and it lies
  *because we knew it was destined for ink.* A role masquerading as a position,
  chosen for the role, while pretending roles are not involved.

**The right value falls between any two honest positions, and no renumbering
fixes that**, because the spacing that suits red does not suit gold and never
will.

#### The two arguments that make roles positively right

Not merely the surviving option — the better design, for reasons neither obvious
at the outset:

- **The role IS the derivation spec.** *"Ink"* means *readable as text on this
  page while staying recognizably this hue* — a requirement, derivable per hue,
  landing on the correct value automatically. *"Position 55"* is a coordinate
  that then needs a hand-correction table to become useful. **Role-based
  derivation has fewer moving parts, not more** — which is what makes the "pick
  ~10 bases, derive the rest" goal a single rule rather than a rule plus a list
  of exceptions.
- **It deletes a layer.** The normalization layer existed for exactly one
  reason: yellow's ink sits at a different step than red's, and something had to
  absorb the mismatch. With no steps there is no mismatch to absorb. A layer
  whose only job was repairing damage the other design caused is strong evidence
  the other design was wrong.

Which is what reduced the stack to the three layers tabled at the top of this
section.

#### Role is not semantic, and the line between them

| | asks | example |
|---|---|---|
| **role** | what job does this color do on a surface? | ink, fill, edge, wash, frame |
| **semantic** | what does it mean in this app? | the fill for a losing move |

Role is **compositional**; semantic is **about the game**. The test that keeps
roles from becoming semantics in disguise: **can two unrelated meanings
legitimately share it?** Error text and a losing label both take `-ink` — passes. Only a losing move takes
`outcome-lost-fill` — that is semantic, one layer up.

#### Four consequences

- **Ordering moves into the file.** Role names do not self-order, which was the
  one honest argument for numbers. Fix it structurally, as the anchors question
  was fixed: **list the roles in ramp order, page → ink, top to bottom.** The
  file carries what the names do not, at no cost.
- **Every palette name must MEAN something; two names that both mean something
  may share a value.** `--gold-border` and `--gold-ink` might differ for gold and
  coincide for every other hue — two meaningful names that happen to land on one
  value, which is simply the price of rectangular families and worth paying. (In
  the numbered draft the same test read *"duplication between a role and a
  position is not fine"*, a **position** being a coordinate on a ramp: `--gold-55`
  under `--gold-ink` was one meaningful name and one redundant one. With the
  numbers gone nothing can be a position any more, so that half of the rule is
  now history rather than a live constraint.)
- **The drift risk moves — but to a different place than first claimed.** An
  earlier draft said *"fourteen roles across eight hues is 112 values, the
  seventeen-greens problem through the role door."* That is wrong, and the
  correction matters:

  > **What makes a palette unmaintainable is the number of independent
  > DECISIONS, not the number of values.**

  The seventeen greens were bad because they were seventeen *decisions* — picked
  by different hands at different times, with no rule saying which were meant to
  be the same. Eight roles across eight hues, derived from eight anchors, is 64
  values and **eight decisions**: cupcake picks one green and checks the ramp.

  So the real risk is not role *count*:

  > **Watch for roles that do not DERIVE.** A role computable from its anchor
  > costs nothing however many hues exist. A role needing per-hue eyeballing
  > costs one decision per hue every time — it is eight hand-picks wearing one
  > name.

  A new role therefore faces two questions, not one. **Would two unrelated
  meanings reach for it?** (is it a role at all — if exactly one consumer wants
  it, it is a component token). And **does it derive, or is it eight
  judgments?** (what it costs). Failing the second is not disqualifying — gold's
  ink already needs correcting — but it should be entered knowingly, because
  that is where the decision count actually grows.

- **A new role is a conversation, never a quiet addition.** It is the shape of
  change that looks locally trivial — one line, one real need — while being
  globally expensive, since it multiplies by every hue *and* changes what the
  vocabulary means. Same structure as *the decision point is the second write*
  below: cheap to miss, expensive to recover.

  And it is cheaply guardable, so it need not rest on discipline. With the roles
  enumerated in one place, a test asserting the set is exactly
  `{wash, fill, edge, ink, frame}` fails the moment a sixth appears — whoever
  adds it must edit the test, which is a visible line in a diff, which is the
  conversation. Same mechanism as the existing *every tone carries all five
  treatment values* test, pointed at a different question.

#### What survives from the numbered rounds

- **The ramp is still defined by distance from the page**, not by lightness. That
  framing was never about the numbers; it is what makes a role like `-wash`
  meaningful in a dark theme.
- **Families are still rectangular.** Every hue carries every role, whether or
  not anything reads it — the *complete the family* rule, now counted in roles.
- **The roles are still unevenly spaced along the ramp**, and the reason still
  matters: an
  `-edge` hugs its `-fill` because it must read as that fill's own boundary
  rather than as a second color. Under role names the unevenness simply stops
  needing to be encoded, because nothing claims otherwise.
- **`edge` is probably a DELTA rather than a chosen value.** All five outcome
  families carry the identical comment — *"the fill, 16% toward black"* — which
  is one operation applied five times, not five judgments. Under role naming this
  gets *less* interesting rather than more: `-edge` stays a named role regardless
  of whether its value is derived from `-fill` or chosen outright. The derivation
  is how it is computed; the role is what it is for.

### …but a POSITION ramp is right where the consumers are homogeneous

Roles do not answer everything, and the counterexample already ships. The warm
tile family is numbered, and correctly so:

```css
/* ── Warm tile family — 5 shades, lightest → darkest ──────────────
   Semantic roles:
     1  attention  — a placed-but-not-committed / highlighted tile (scrabble)
     2..5          — stackdown depth 0..3 (top → deepest)
     3  NORMAL     — the everyday tile most games use             */
--tile-1-color: #faf7ef;  --tile-1-edge-color: #ead8ae;
--tile-2-color: #f6efdf;  --tile-2-edge-color: #e5d09e;
--tile-3-color: #f2e8ce;  --tile-3-edge-color: #e1c88e;  /* NORMAL */
--tile-4-color: #eadbb8;  --tile-4-edge-color: #dabc77;
--tile-5-color: #e3cfa1;  --tile-5-edge-color: #d2b060;
```

**stackdown reads DEPTH off the ordinal**, and other games pick a shade by taste —
codenamesduet takes `tile-1`, spellingbee and wordwheel `tile-2`, boggle and
scrabble `tile-3`. There is no role hiding in there waiting to be named.

> **Number the ramp when its consumers do the SAME job at different intensities.
> Name the roles when its consumers do DIFFERENT jobs.**

Red's consumers are heterogeneous — text wants one value, a fill another, a
hairline another — which is why no single position could serve them and why the
numbering carried nothing. The tile ramp's consumers are homogeneous: all of them
are tile fills, differing only in lightness, and the family name has already said
everything a role name could.

The sharper form, since "same job" is soft: **can a consumer meaningfully ask for
a position by number?** stackdown can — *depth 3* is a real request. Nobody has
ever wanted "the third-lightest gold"; they want gold ink.

**The two axes are orthogonal, and the shipping code already crosses them.**
`--tile-3-color` + `--tile-3-edge-color` is position × role. So a position ramp
does not contradict role naming — it is **one role sampled at several
intensities, with the other roles still available at each sample.** Written out
honestly those are `--tile-3-fill` and `--tile-3-edge`; today's names just drop
the constant part.

Three things to fix when this lands:

- **That comment's header is mislabeled.** It says "Semantic roles" and then lists
  *consumers* — attention, stackdown depth, normal. Those are who reaches for each
  position, not roles. The word is about to mean something specific.
- **`--tile-disabled-color` cannot be one token.** "Disabled / missing / spent" is
  a meaning rather than a job, and worse, *how* you disable a tile depends on the
  tile: the resting shade varies by game (codenamesduet rests at `tile-1`,
  scrabble at `tile-3`), so one absolute value is a different distance on each
  board. Which yields a diagnostic worth keeping:

  > **Would this value need to be different depending on what it is applied to?
  > Then it is an operation, not a color.** A delta frozen into an absolute is
  > correct for exactly one starting point.

  What replaces it is a scrabble/stackdown question, owed when those games
  convert. Two things to hand them. The token is defined as *"clearly dimmer than
  shade 5"* — a **position** — and stackdown reads positions 2–5 as depth 0–3, so
  on that board it is liable to read as *depth 4*. And the likely shape is one
  entry per position (`tile-1-disabled`, `tile-2-disabled`, …), derived and then
  judged on screen like everything else — with the *mapping* semantic and the
  *values* needing a palette home, per the rule below.

  It is probably the only tile state needing that treatment, which contains the
  obvious worry about N-fold growth. The others replace the tile rather than shift
  it — attention is opaque (*"for the beat it lasts, the tile simply IS yellow"*),
  the in-flight mark is a black overlay, selected is a single dark fill — so one
  value serves each. Disabled is different because it keeps the tile's identity
  and merely recedes:

  > **A state that REPLACES the tile's color needs one value. A state that keeps
  > the tile's identity while shifting it needs one per position.**
- **The tile edges are "~16% darker" — the same 16% as the outcome families.** One
  derivation across two structurally different kinds of family is good evidence
  for the edge-as-delta hypothesis above.

It also **confirms a guess made earlier in this section**: the warm ramp is its
own family rather than low-chroma orange. The comment says so outright — *"one
core warm (slightly-yellow) color, hand-tuned along a lightness ramp (~5%
steps)"* — and its ten tokens plus the two disabled ones account for about a
quarter of the 48-strong warm bucket.

### The ramp holds DESTINATIONS, not deltas

Hover is not a role. Neither is press, focus, or disabled. Those are
**transformations**, and [tile-feedback.md](tile-feedback.md) already has a
vocabulary for them — lighten / darken / dim-up / dim-down as operations over
composites.

If every state that nudges a color earns its own step, you get hover, press and
focus steps per hue, and you are back at seventeen greens by a tidier route. This
matters for sizing the set: counting states suggests five-plus roles, counting
destinations probably suggests four or five.

### Hover flips direction between polarities — and so does an existing RULE

Light mode darkens on hover; dark mode lightens. That is the real convention, not
a quirk: Material formalizes it as a *state layer*, a translucent overlay in the
**on-surface** color, which is dark on a light theme and light on a dark one. The
flip is not something a theme author has to remember, because the overlay tracks
the theme.

Which means **no new theme knob is needed to encode it** — it is the same
distance-from-page axis: **hover moves AWAY from the page.** Light page → away is
darker; dark page → away is lighter. The operations already exist in
[tile-feedback.md](tile-feedback.md) as dim-up (translucent white) and dim-down
(translucent black); hover is "dim away from the page", and the theme decides
which of the two that is.

**The consequence is that a shipped rule will break in dark mode.**
tile-feedback.md currently says:

> **Do not use dim-up on game pieces.** On a light page a white wash is nearly
> indistinguishable from fading toward the background…

The rule is stated **absolutely** and reasoned **relatively** — its justification
is literally *"on a light page."* Under a dark theme, dim-*down* becomes the one
that fades a piece into the background, so the rule inverts. It wants restating
as **never dim a game piece TOWARD the page**, which is theme-independent and
says exactly the same thing today. (Worth doing when tile-feedback folds into
ui.md, not before — but it is the clearest example so far of a rule that reads as
settled and is quietly light-mode-only. Expect others.)

One subtlety that looks like a contradiction and is not: tile-feedback allows
dim-up on spellingbee's and wordwheel's packed hexes for hover. On a board packed
edge to edge a piece sits against its **neighbors**, not the page, so
"away from the page" is the wrong reference there. **The reference surface is
whatever the piece actually sits against.**

### The tokens are relative; dim-up and dim-down are prose

`dim-up` / `dim-down` name an **operation** — overlay white, overlay black —
which is mechanical and theme-agnostic. That precision makes them useful for
*explaining* a mechanism and useless as the thing anyone writes, because
`dim-down` genuinely means overlay-black **in every theme, including the one
where that moves a piece toward the page.** Asking for `dim-down` and expecting
hover's behavior is the conflation this section separates, returning through the
shorthand.

**Leading answer: `--stronger` / `--weaker`**, meaning more or less present
against whatever the piece sits on. Stronger is darker on a light page and
lighter on a dark one, and it reads correctly in both directions of use — *tiles
get stronger on hover; unimportant things get weaker.*

Candidates, and why the losers lost:

| | verdict |
|---|---|
| `--stronger` / `--weaker` | **leading.** Describes the result, needs no reference point, natural in speech |
| `--bolder` / `--fainter` | fine, same shape. Second choice |
| `--dim-away` / `--dim-toward` | workable, but "away from *what*" is a lookup every time |
| `--veil-ink` / `--veil-page` | **rejected** — names the mechanism, see below |
| `--dim-active`, `--dim-highlighted` | **rejected** — names a *meaning*, so the first non-hover user makes it a lie |

**Why `veil-*` failed rules out a whole family of names, which is the useful
part.** The objection was the metaphor, not the words: *"the whole veil idea is a
smart implementation but one I keep forgetting you even do — I would just
subtract 16 from the hex value."* **The mental model in play is arithmetic on a
value, not compositing layers.** A veil is a *mechanism*; subtracting 16 is a
*destination*. Any name evoking the mechanism costs a translation on every read,
permanently.

So the constraint, and it is the same one the role-naming section arrives at from
the other direction: **name the result, never how the result is achieved.**
Whatever wins must also avoid `dim`, since *"dim toward the page"* is
self-contradictory in light mode, where moving toward the page makes a thing
**brighter**.

**And `dim-up` / `dim-down` do not survive as tokens.** If nothing reads them
directly, they are a mechanism-name sitting underneath a result-name — exactly
the two-names-one-value case that killed the numbered palette. They stay as
**words in prose**, where explaining the mechanism is the point. The same
argument landing in two unrelated places is reasonable evidence it is real.

**The evidence that some such name is needed rather than merely tidy:** in the
very message that corrected *"lightened by 10%"* to the theme-relative form, the
replacement came out as *"closer to the page by 10%"* — right vocabulary, wrong
direction, since hover moves away. That slip will keep happening as long as the
only correct phrasing is a full sentence rather than a word.

**Still genuinely open, and the deciding vote is on re-reading**, because
the honest constraint here is that *"Joel thinks in light mode"* — always, on
purpose, and it is not going to change. If the chosen name still costs ten seconds of
translation after a few days, the fallback is real and not a defeat: **the files
use relative names, prose uses whatever is natural, and the translation is
Claude's job.** The relative phrasing appears in only a handful of *rule*
sentences; every *value* gets judged by looking at a screen, and while judging
dark mode one is looking at dark mode, so light-mode thinking never enters into
it. The place it would bite is hand-writing CSS, which is rare.

### One role set for every hue — except the neutrals

The entire value of a role is that it means the same thing in red, green and
blue; that is what lets the semantic layer be written once. If red carries five
roles and purple three, cross-hue reasoning dies. Unused roles cost nothing when
they are derived, and the rule stated earlier in this document applies exactly:
*complete the family when you know its shape and its formula* — here we would
know both.

**This is not a new rule, and it is already machine-guarded for one family.** The
chrome tones do it today — *"FIVE VALUES PER TONE — all four tones, always,
whether or not anything reads them"* — enforced by `cssTokens.test.ts`'s test
*"every tone carries all five treatment values."* So strands gets a complete
purple ramp even while using two or three of it, and the guard that would enforce
that already exists; it only needs pointing at a second kind of family.

**Grays are the documented exception, and for a structural reason: gray is the
only family that has to be both the ground and the figure.** Page, surface,
hairline, muted text, body text, disabled — six jobs at six contrast levels, all
in one hue. A red never has to be a page background. So the neutral ramp is
longer *by function* rather than by drift: realistically eight to ten, not four,
and certainly not thirty-three.

One thing to check when the time comes: several of those thirty-three are not
neutral at all. `#75787a`, `#8a8a94` and `#9e9aa7` carry visible tints. Warm and
cool neutrals are a legitimate choice, but they are a **second family** — and if
nobody chose them, they are the purest drift in the file.

### What a ROLE name may say — and what it may not

A role names a **job on a surface**, and the restriction that keeps roles from
quietly becoming semantics: **a contrast relationship, never a mood.** `-ink` is
a relationship — high contrast against the page, holds up small, and any number
of unrelated meanings can want it. `-inactive` is a mood: once `--red-inactive`
exists it has exactly one meaning, which makes it a semantic name that forgot to
say what it means.

> **The test: can two unrelated meanings legitimately share this token?** Error
> text and a losing-outcome label can both take `-ink` — passes. Nothing shares
> `-inactive` with anything, because inactive *is* the meaning — fails, and it
> belongs one layer up, as `--disabled-color: var(--red-wash)`.

The same test does double duty as the brake on role proliferation (see the role
section above): **a role that only one consumer would ever reach for is a
component token wearing a palette name.**

### Copy versus reference is a THREE-position scale

`theme.css` already makes this distinction — in English. It says things like *"a
**COPY** of the neutral wash rather than an alias"* and *"a **COPY** of the action
blue"*, in several places. **The concept exists; it is expressed in a medium that
can go stale.** Making it a `var()` chain makes it syntax, and syntax cannot lie.

The scale has three positions, not two:

| written as | says |
|---|---|
| the pill reads `--outcome-lost-fill-color` directly | these are one thing |
| `--pill-lost-color: var(--outcome-lost-fill-color)` | own identity, currently bound — **there is a seam here** |
| `--pill-near-color: var(--red-fill)` | own identity, deliberately **not** bound |

The middle position is not redundant indirection; it is information for whoever
themes this later, saying a knob exists that could be turned. (An earlier pass of
this conversation argued for collapsing it into the first, on the "tokens are for
values with many readers" rule. That was wrong — the alias's payload is the
*seam*, not the reuse.)

**The scale only works if the semantic vocabulary is complete and discoverable.**
Bypassing `--outcome-lost-fill-color` reads as a decision precisely because the reader
can see it sitting there unused. Bypassing a token that does not exist yet reads
as nothing at all.

### A deliberate non-binding still gets a NAME

The place to record "this is red, but not because red means lost" is a token, not
a selector:

```css
/* codenamesduet/theme.css */
/* The cardboard assassin is red and players arrive expecting it. This tracks OUR
   red — pinker in dark mode, deeper in cupcake — but it is NOT an outcome: if
   `lost` ever stops being red, the assassin stays red. */
--codenamesduet-assassin-color: var(--red-fill);
```

Three things that buys over `.assassin { background: var(--red-fill) }`: the comment
has somewhere to live that is not a selector, the name is what a theme author
greps for, and it stays consistent with the existing guard that components
*reference* decisions rather than make them.

### The values are JUDGED, not generated

How the variants get picked today, stated plainly: **it is hand arithmetic frozen
as literals.** *"The fill, 16% toward black"* is a comment describing a
calculation done once; the hex is the frozen result. No CSS math runs. It could —
`color-mix()` and relative color syntax (`oklch(from var(--red) calc(l - .1) c h)`)
both ship in current browsers — and a build-time `hues.txt` → `midnight.css`
generator is equally available.

**Both were considered and neither is recommended, for two reasons.**

**The exceptions are the design work, and they cluster where this app lives.**
White-on-warning working when the math said otherwise, and orange's ink needing
to go darker than red's, are not noise around a formula — they are instances of
the chroma ceiling above. Every serious palette hand-corrects its yellows and
oranges; Material's yellow 800 is visibly not "the same recipe as" its blue 800.
And the measurement found **48 colors in the orange/warm bucket, more than any
other family** — the warm tile ramp, the attention yellow, the near-miss gold,
wordle's yellow, spellingbee. The math is worst precisely at this app's most-used
hue.

**And the compression removes the generator's case anyway.** A build step is
clearly worth it for 170 values. For ~50, where perhaps a third need correcting
by eye, it saves around thirty values at the cost of a build step, a second file,
and a generator whose output is half-overridden — which is a generator you can
neither trust nor safely re-run.

So: **derive once, look at it on a screen, correct what is wrong, and paste the
literals in with the formula _and_ the exceptions as comments.** That is today's
process, done deliberately for fifty values rather than accreted over 170. The
aesthetic judgment has to happen against a rendered screen regardless, so the
file may as well hold what was actually judged.

**To be precise about where the disagreement was, since it is narrow.** Who
computes the numbers is not in question — arithmetic, done by Claude, either way.
The only delta is whether the derivation persists as a **runnable artifact**: a
`hues.txt` → `midnight.css` arrow that can be re-run. Once a third of the values
are hand-corrected, re-running it either clobbers the corrections or needs an
overrides file, and then no single file answers "what color is this."

So: **keep the hue anchors, but at the top of the same file rather than in a
separate one.** A file that nothing mechanically consumes is a file that goes
stale in silence — nothing would ever check `hues.txt` against the CSS below it.

### A worked example, explicitly not a proposal

Written out so the shape is visible and the file boundaries are explicit. Every
name here is up for grabs; what matters is which file each line lives in.

```css
/* ══ per THEME: daytime.css / midnight.css / cupcake.css ══════════════════ */

/* ANCHORS, chosen by hand, per theme. ~10 decisions; everything else derives. */
--red-base:   …;   /* always A red — candy in cupcake, blood in horror, but red */
--green-base: …;   --blue-base: …;   --gold-base: …;
--tile-base:  …;   /* NOT a hue name — see below */

/* THE ROLES, derived per hue. Listed page → ink, so the FILE carries the order. */
--red-wash   --red-fill   --red-edge   --red-ink   --red-frame
--gold-wash  --gold-fill  --gold-edge  --gold-ink  --gold-frame
--tile-wash  --tile-fill  --tile-edge  --tile-ink  --tile-frame
--gray-…     /* the neutrals: more roles, see below */

/* ══ palette.css — FIXED anchors, shared by every theme ═══════════════════ */
--wordle-green: …;   --wordle-yellow: …;   /* level 1: no theme may move these */

/* ══ common — semantic. Theme-invariant. ══════════════════════════════════ */
--outcome-lost-fill-color: var(--red-fill);
--outcome-won-fill-color:  var(--green-fill);

/* ══ the game's own file. Theme-invariant — it holds REFERENCES, not colors. ═ */
--codenamesduet-assassin-color: var(--red-fill);  /* red by definition, not by outcome */
--wordle-gray-color:            var(--gray-fill); /* locked on ROLE, free on value */
--letterboxed-accent-color:     var(--purple-fill);
```

Five things that example settles or surfaces:

- **Each role's value is derived PER HUE, and the per-hue difference is genuinely
  surprising.** On a *light* page ink must be dark, and yellow cannot be dark and
  still be gold — so `--gold-ink` lands much lighter than `--red-ink`. Flip the
  page and yellow's problem vanishes, because ink must now be **light**, which is
  what yellow is best at. But blue's problem appears, since blue is intrinsically
  dark at full chroma. **The awkward hue swaps with the page.**

  Which is worth stating carefully, because the two axes divide differently here:
  the role *values* live in the **theme** file, since they derive from that
  theme's anchors — but the *rule* that derives them is fixed by **polarity**.
  Daytime and cupcake compute `--gold-ink` by the same recipe and land on
  different colors; midnight computes it by the mirrored recipe.
- **The ramp's DIRECTION belongs to the page, not the theme.** Every light-page
  theme shares one direction and every dark-page theme the reverse. The
  per-theme knob is the ramp's *magnitude* — cupcake may want softer contrast —
  not which way it runs.
- **An anchor takes a HUE name when its hue is locked and a ROLE name when the
  theme owns it.** `--red-base` is level 1, so "red" is honest. The tile family is
  level 3 — sand here, pink in cupcake — so a hue name would be a lie and `tile`
  is correct. The naming difference *is* the classification, made visible for
  free. **Mechanically the two are identical**: both are anchors, both generate
  their roles the same way; only the name carries the distinction.
- **The anchor keeps a name of its own here, unlike in the numbered draft.** When
  the family was numbered, `--red-base` and `--red-3` were two names for one
  value and the extra one went. With role names there is no `--red-3` for it to
  duplicate — the anchor is not any single role, it is the input the roles derive
  *from* — so `-base` is carrying its own weight. (It is also the accurate word:
  `#ef5350` is a color, not a hue, which is why an even earlier `--red-hue` was
  wrong.)
- **Level-1 brand colors get a FIXED section rather than an exception.** wordle's
  green is genuinely theme-invariant, and writing it as a raw hex in
  `wordle/theme.css` would be the one thing the guard exists to prevent. A fixed
  block inside the palette keeps "hexes only in the palette" mechanically true
  *and* makes the lock visible by location: read that section and you have every
  color no theme may touch, without hunting for comments.
- **A game's arbitrary-hue color lives in the GAME's file as a reference**, not
  in each theme file as a value. It still themes, because `--purple-fill` already
  does. The alternative — a per-game entry in every theme file — means **adding a
  game requires editing every theme**, which is the parallel-lists drift machine
  again, smaller but spread over more files. A theme may still override a
  specific game's color; being the exception, it gets marked.

### Where a BESPOKE per-theme game color lives

The case the rule above does not cover: spellingbee's gold is not a step on any
shared ramp — it is one specific color — **and it should differ per theme**
(honey on a light page, bumblebee on a dark one). So "reference the palette" is
unavailable and a value has to exist per theme. Two obvious homes, and a third
that is better than both:

A theme is a **selector, not a file**, so the game can carry every variant in its
own single file:

```css
/* spellingbee/theme.css */

/* PALETTE layer — a per-theme brand anchor. The one place a hex may appear. */
:root                        { --spellingbee-gold: <honey>; }
:root[data-theme="midnight"] { --spellingbee-gold: <bumblebee>; }

/* COMPONENT layer — a reference, as always. */
--spellingbee-accent-color: var(--spellingbee-gold);
```

One file, co-located with the game, no chasing, and no N-games × M-themes
explosion. It is the same argument this document already makes at the top level:
*not a file per mode.*

**Note what that example forces, because it is easy to read as a violation of
"semantic tokens hold references, never values."** It is not — because **the
layers are roles, not files.** A game's stylesheet may hold a *palette-layer*
entry (its own brand anchor, one per theme) alongside *component-layer* tokens
that reference it. "Hexes appear only in the palette" is a claim about which
**layer** a line belongs to, never about which file it sits in. Collapsing the
two would force every brand anchor into common, which is precisely the
common-knows-about-spellingbee problem this section exists to avoid.

**The reason is not the removability invariant, and it is worth being clear about
that**, because the "we might delete a game" story is admittedly a fiction we
tell to stay honest. The real argument runs the other way and is stronger: a
`--spellingbee-accent-color` line inside common's `midnight.css` is not
spellingbee reaching into common, it is **common knowing about spellingbee** —
the shared layer acquiring a dependency on the game roster, so it cannot be read
without knowing all sixteen. That is a cost paid whether or not anything is ever
deleted.

### The removability rule is TWO rules, and they are not equal

Worth separating, because they fail differently and rank differently:

| | | failure mode |
|---|---|---|
| **r1** | common must not reach into a game | **linear** — the shared layer grows a roster dependency. Annoying, readable, survivable |
| **r2** | a game must not reach into another game | **combinatorial** — couple sixteen games pairwise and the codebase becomes unmanageable |

**r2 is the invariant; r1 is very good practice.** Had the `[data-theme]` trick
not existed, a `--spellingbee-accent-color` in common's theme file would have been
a nit rather than a catastrophe — and if spellingbee were ever deleted, a stale
line in `daytime.css` is a minor tidy, not a disaster.

**But r1 earns more than "good practice" because of how r2 gets violated.** If
common holds `--spellingbee-accent-color`, wordwheel can use spellingbee's color
without ever mentioning spellingbee — **the shared layer launders the coupling.**
That pair is the live risk rather than a hypothetical one: wordwheel *is* a
spellingbee fork, and the two already have genuinely shared modules in `common/`.

Know the limit, though: **CSS custom properties have no module scoping.** Any
stylesheet can read any token wherever it is declared, so co-location cannot make
r2 impossible for colors — it makes the reach **visible and greppable**. Which is
the same claim this document makes everywhere else: the enforcement is
legibility, not the language.

The genuine cost of co-locating: authoring a new theme wants a *checklist* of
every bespoke decision, and those are now spread across games. But that is a
**discovery** problem, not a source-of-truth problem — answer it with a grep or a
generated index, never by relocating the source.

**Before accepting that a color is bespoke, look once.** tile-feedback's roster
already flags this exact case — spellingbee's accent is *byte-identical to a
shared rank fill* — so some of these collapse into the palette and some genuinely
do not. The architecture has to support bespoke; the first instinct should still
be to check.

One note from writing it out (the `--tile-base` line above is the app's one
**position** ramp, and its own family rather than low-chroma orange — evidenced in
*a POSITION ramp is right where the consumers are homogeneous*, above):

- **Hue names are only honest because meaningful colors are hue-locked.** If a
  theme could make `--red-base` orange, the name would be a lie and we would be
  forced into abstract names (`--danger-1`) — semantics smuggled back into the
  palette, the exact thing this layer exists to avoid. The hue-lock rule below
  and the naming scheme here hold each other up.

**The trap the example is most likely to be written into**, since it was written
into the first draft: a per-game hover calculation like *"the accent, lightened
10%"*. That is light-mode-only thinking — in dark mode it moves the piece
**toward** the page — and it is hand-rolling the shared operation from the hover
section above. Hover has to be reachable, or it gets re-derived per game and half
the derivations are backwards.

### Brand splits three ways — and the split is per DIMENSION

The question that forced this: does a cupcake theme turn spellingbee's hexes
pink? The answer is not one answer; it is a ladder, and the rung is decided by
**whether the color carries information the player brought with them.**

| | example | may a theme move it? |
|---|---|---|
| **imported semantics** | wordle's green / yellow | no — the color *is* the rule |
| **recognition** | spellingbee's center yellow | hue locked, shade free |
| **decoration** | letterboxed's green | freely |

> **The test: would a returning player MISREAD the board, have to LOOK TWICE to
> be sure they were in the right game, or merely NOTICE it looked different?**

Four things fall out of it:

- **Level 1 is not brand at all.** wordle's green belongs in the same bucket as
  `--outcome-won-fill-color` — it is the semantic layer speaking a foreign vocabulary.
  Changing it does not break recognition, it breaks *comprehension*. That leaves
  "recognition" as the only genuinely new category.
- **A color can be locked by the game's NAME rather than by memory.** A bee is
  yellow. spellingbee's center would want a gold even for a player who had never
  seen the NYT version — position already says "center", so the hue is doing
  thematic work instead. Expect this to recur wherever a brand names an animal or
  an object.
- **The levels apply per DIMENSION, not per color.** letterboxed is the proof:
  its hue is arbitrary, but its *convention* — filled = last letter, border =
  current — carries the meaning. So it is **decoration on hue and imported
  semantics on ramp-step, simultaneously.** Cupcake may move the hue freely and
  must not touch the step assignments. This is the sharpest form of the model.
- **"Same hue, tweak the shade" is not always enough**, and wordle's gray shows
  why. Its meaning is level 1 — gray *is* "not in the word" — but in dark mode
  the absent tile and the page converge, so absent tiles stop reading as tiles.
  NYT solves it by making absent tiles *darker* than the page plus a border: the
  tile's **relationship to the page inverts**. Which is a clean demonstration of
  why the ramp is defined by distance-from-page rather than by lightness — under
  that definition the rule does not change, only the direction does.
- **Different colors WITHIN one game sit at different rungs.** wordle's green and
  yellow are level 1 on both meaning and hex — they are famous and they encode
  the rule. Its gray encodes a rule too, but nobody has memorized the value, so
  it is level 1 on *meaning* and level 3 on *hex*: it must stay visibly
  not-green, not-yellow, and still a tile, and beyond that it is free. **What is
  locked is the relationship, not the value.** No NYT player will blink at a
  lighter gray; every one of them would blink at a blue.

### The guard cannot see inside an asset

Themes change color, and **some of our color is not in CSS at all.** There are 17
game `logo.svg` files carrying baked color literals — `codenamesduet/logo.svg`
alone has 754, `bananagrams/logo.svg` 124 — plus rasters (sorted below). None of it
is visible to `cssTokens.test.ts`, which parses CSS.

**An asset with baked-in color is a color that escaped the token system**, and
that is a blind spot in the guard rather than a rule anyone broke. Several of
these will look bad on a dark page.

**The literal counts overstate the problem.** `codenamesduet/logo.svg` has 754
color literals and **five distinct colors** — 749 of them are the same purple,
one per `<path>`, across 747 paths with no gradients. It is a traced or exploded
illustration, so retheming it is one fill rule rather than an art project. Count
distinct colors before estimating any of these.

**The technical fact that decides feasibility per icon:** an SVG loaded through
`<img>` or `background-image` **cannot see the page's CSS variables**; only an
inlined SVG can. So "spellingbee's gold follows the theme" is a property of how
the logo is *mounted*, not of the file, and tokenizing any logo means inlining
it.

That sorts the work by brand level rather than by file:

| level | example | fix |
|---|---|---|
| **1, locked** | wordle's tiles | transparent background; no theming needed, `<img>` is fine |
| **2, hue-locked** | spellingbee's gold — bumblebee in dark, honey in light | inline + a token fill |
| **3, free** | the arbitrary-hue brands | inline + a reference to the palette |

The fourth option, worth reaching for where it fits: **a mark that survives both
themes** — avoid near-white and near-black, let shape carry the identity. Cheapest
of all, and it matches the level-2 logic, since a logo is identity and the goal is
the same mark adjusted rather than a different mark. It does not always fit:
wordle's icon is tiles on white, and a mid-gray background that worked on both
would leave the tiles unreadable.

**The rasters sort into three piles, and only one of them matters:**

| where | what |
|---|---|
| 6 in `public/` | the puzpuzpuz "P" at apple-touch / PWA / favicon sizes. **Out of scope** — the OS renders them against a home screen whose background we will never know, so they need to be *robust*, not themed. Converting them to SVG does not help; the platforms want raster at fixed sizes |
| 2 in `crosswords/lib/fixtures/` | test fixtures. Irrelevant |
| **1: `common/components/branding/homeTitle.png`** | **in-app, and the hardest asset in the app** |

That last one is the PuzPuzPuz **wordmark** (840×216, on the login screen and the
clubs list), and its own docstring already states the trap:

> Its ground is **opaque near-white**… keeping the white sticker outline around
> the letters, which **a transparency key-out would eat** along with the
> background.
>
> The artwork has a soft drop shadow and hand-drawn letter outlines that don't
> survive a trace, so **the PNG *is* the master.**

So: a large near-white rectangle, deliberately opaque, sitting on a `.card` that
goes dark — where the obvious fix is documented as destroying the design and
there is no vector source to re-render from.

**Which turns out not to be the problem it looks like, and the reframe is worth
more than the answer.** Treating "artwork per theme" as a maintenance cost to
avoid is what made this look hard. For the wordmark it is the opposite: the
wordmark is plausibly **the most fun place in the app to express a theme** —
cupcake's exclamation marks as unicorn horns, a horror theme's letters dripping.
So it is not one asset with a theming difficulty; it is N assets swapped by
`src`, and the "no vector source to derive from" blocker evaporates, because
nobody is deriving cupcake's wordmark from light's. They are drawing a new one.

> **There is a class of asset where one version per theme is the RIGHT answer
> rather than a failure: decorative, singular, carrying no state.** "Themes change
> color, not structure" governs the *system*; a hero lockup is not part of the
> system, and holding it to the system's rule is what made it look expensive.

Leaning into the sticker — one wordmark for every theme, reading as a sticker on
a dark page — stays available as the cheap answer, and it is a real one. It is
simply no longer the *only* answer.

For the "P" itself — `public/favicon.svg` and `common/puzpuzpuz.svg` are identical
by color content: 13 values, a purple ramp from `#4B41C9` to `#8B88DC` plus two
near-whites. The in-app copy is a menu trigger and does need to work on both
grounds; **the near-whites are what will fail on a dark page, not the purples.**

### A theme recipe is SOURCE, and the SVG is the build output

The durable answer to "how would we even think about a cupcake spellingbee a year
from now" is to write down what the artwork *is*, in terms that outlive any one
theme. That reframes artwork from an opaque blob into something with a readable
source.

**Describe constraints, not the drawing.** A recipe recording geometry goes stale
the first time somebody nudges the bee's wing in Inkscape and does not update the
text — the same staleness trap as the `hues.txt` rejected above. A recipe saying
*"the bee is ink-on-transparent; the field takes the game's accent; the border
must contrast with the page"* survives any amount of redrawing, and is shorter.
It should use the same relative vocabulary as the CSS — "contrasts with the page"
rather than "white."

**Where it lives: a section in `docs/games/<game>.md`**, not a new per-game file
type. Sixteen new files is a new category to maintain; each game already has a doc
that is the natural home for what its brand is.

**Recipes pay off unevenly, and the wordmark shows where the line falls.** They
matter most for **level-2 recognition** assets — the game logos, which have to
stay recognizably themselves across themes, so the constraints are worth writing
down. They matter least for pure decoration, where each theme's version is a fresh
creative act and a recipe would only constrain the fun.

### Much of the token count is substituting for classes we did not write

A large share of the 360 tokens exist as a **central place to say "what color is
a pill"**, because there is no global `.pill`. If that reading is right, naming
the patterns should make `theme.css` *shrink*: `--pill-lost-color` mostly
evaporates into `.pill.lost { color: var(--outcome-lost-fill-color) }`.

**Which is an acceptance test worth writing down now, because it is cheap to
measure:** if the pattern layer does its job, the token count falls. If it holds
steady while module CSS shrinks, the tokens were load-bearing and this reading
was wrong.

One carve-out, since it will bite otherwise: **a value with a non-CSS consumer
stays a token.** The member colors are read by TS for `<Dot>`; the PDF code picks
colors in JS. Those cannot live inside a class, and they are not failures of the
rule.

### The guard becomes a LOCATION rule

`cssTokens.test.ts` already enforces most of this: *every color literal sits in a
`--token:` definition*, *a component module references colors and never holds
one*, and *no `var()` falls back to a color*. What it cannot see is that those
definitions are spread across seventeen files and mix palette with meaning.

Under this structure the rule sharpens to **hexes appear only in a palette
definition, and every other color token is a `var()` of one** — strictly easier
to check than what is already passing, and strictly stronger.

### Vocabulary

Used consistently above, and worth pinning because one word is missing:
**hex** = an exact value; **hue** = the color family (candy red vs orangeish red);
**shade** = lighter or darker. Close enough to color-theory usage — pedantically
"shade" is mixed-with-black and "tint" is mixed-with-white — and nobody will
misread it.

The gap that will actually bite: *shade* collapses **lightness** and **chroma**
into one idea, and the yellow problem above is a chroma problem rather than a
lightness one.

**Chroma, without the color model: how much color there is**, on a scale from
gray to vivid. That is the whole definition, and one fact carries every use of it
in this document:

> **Red can be vivid and dark at the same time. Yellow cannot — its vivid version
> *is* its light version.**

In red, chroma and lightness are close to independent: raise one, leave the other
alone. In yellow they are coupled, because yellow's maximum chroma sits near the
top of the lightness scale — so raising a yellow's chroma pushes it lighter
whether you want that or not, and **holding the lightness down while raising the
chroma is precisely how you get mustard**, then ochre, then olive. (It is worth
being clear about the direction, because the intuition runs the other way: going
darker is what *creates* mustard, not what avoids it.)

The same instruction, written out for each:

> **Red:** same hue, raise the chroma, leave the lightness alone.
>
> **Yellow:** same hue, raise the chroma — **and take the lightness rise that
> comes with it**, because yellow has no vivid form at the old lightness. Hold
> the lightness down and you get mustard.

For yellow the lightness is not a choice you make, it is a **consequence you
accept** — and there is little chroma headroom to spend either, because yellow
reaches the edge of the gamut quickly. Which is why *"make it 10% more vivid"* is
a complete instruction for red and an incomplete one for yellow: there, you have
to say which you are protecting, the vividness or the darkness, because both is
not available.

Blue is yellow's mirror — intrinsically dark at full chroma — which is why the
awkward hue changes when the page does.

That is the entire reason the warning orange needed a darker ink than the red
did, why a uniform ramp cannot be applied across hues without correction, and why
the corrections cluster where this app lives. Nobody needs L\*a\*b\* to use it.

One term to keep straight, since the distinction does real work above:
**lightness**, not *brightness* — brightness is about light sources, and the
property we keep trading against chroma is lightness.

## When a numbered scale is honest, and when it lies

> Added 2026-08-21, from Joel, thinking it out while tea steeped. It explains
> something we'd already been doing by instinct one case at a time, and catches
> one place we got it wrong.

Early in the sprint I proposed a palette of the form:

```css
--red-1:    #aabbcc;   /* the bad-move ink   */
--red-2:    #bbccdd;   /* the bad-move edge  */
--orange-1: #ccddee;   /* the warning ink    */
--amber-1:  #ddeeff;   /* the warning fill   */
```

Joel rejected it immediately, and the model it belonged to failed for other
reasons too. But `--font-size-1 … -3` reads as obviously *right*, and the two
look like the same move. The difference is worth naming, because it decides how
every future vocabulary gets named.

**A numbered scale is honest when the number is the WHOLE meaning, and
dishonest when it displaces a meaning that already exists.**

There is no fact about "2-ness" hiding inside `--font-size-2`: bigger and
smaller genuinely is all there is. `--red-1` has a fact underneath it — *this is
the losing-move ink* — and the number pushes it out of view, so every reader
translates. Translation is where drift gets in.

Three consequences fall out.

**1 · The swap test.** Can two members trade places and still be the same kind of
thing, just more or less of it? Font sizes, yes. `red-1` and `red-2` — an ink
and an edge — no: those are not two amounts of one thing, they are two jobs that
happen to share a hue.

**2 · A scale whose members drift into different names was measuring the wrong
axis.** Joel's sharpest observation: the warning INK was dark enough to be called
orange and the warning FILL light enough to be called amber, so one meaning
landed in two families. That isn't a naming inconvenience — it is proof the
"family" was never a scale.

**3 · Colors are semantic here and sizes are not.** This app does not pick red
because red is pretty; it has a specific hue for a losing move. Hiding that
behind `red-N` obscures the very fact the color system exists to state. A font
size carries no such fact: `--font-size-2` does not claim to be what help text
is, it restricts an otherwise free choice to three. **A vocabulary of degrees
narrows a choice; a vocabulary of meanings makes one.**

### It predicts the eight vocabularies — and catches one

We numbered `--spacer`, `--font-size` and `--line-height`, and **named**
`--transition-duration-paint / -nudge / -travel`,
`--letter-spacing-label / -wide`, `--border-width-line / -frame`. Every numbered
one is pure degree; every named one is different KINDS. We did that case by case
without stating why, which is decent evidence the principle is real rather than
constructed after the fact. The text grays are the same story from the other
end: they were already `--page-text-color` / `--page-text-muted-color` rather
than `--gray-1/-2`, which is also why they are the only THEMED vocabulary.

**`--opacity-1 … -2` is the one it catches.** Opacity spans at least two kinds
today — a disabled control, and `OpponentStrip`'s separator glyph — so numbering
them repeats `red-1`/`red-2`: two jobs sharing a mechanism, dressed as degrees.

**Ruling (Joel, 2026-08-21): keep the numbers for now, and name them once the
spectrum is visible.** We do not yet know why the separator differs, and naming
before seeing the range is how you get names that fit the first case and nothing
else. The numbers are a holding position, recorded as one.

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
> quieter than its neighbor"* — no, that's an adjustment, and utilities are
> honest.

The count passes. That its look currently coincides with help text is a fact
about styling, not about what it is. A thing with a **why** earns a name even
when its why doesn't yet earn a distinct look. (This is the distinction between
a **decided look** — `help-text`, which knows it is help and should look the same
in the info column, the setup dialog and a tight dialog alike — and a **utility**
— `muted`, which just means gray and knows nothing about why.)

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
3. **Utilities mix the two axes we just separated.** `muted` is color (theme);
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
human judges, not a failing test. Forbidding fits color, where the answer is
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
  actual job is preventing cross-game reaching — later split into its two halves
  under *The removability rule is TWO rules*, which is the fuller account.)
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
   a 15×15 grid) and brand color (spellingbee yellow, wordwheel rust) — and
   close to nothing else. Everything else is meant to look the same, and
   currently only *happens* to look the same, which is a much weaker property.
2. **Name patterns, not just values.** The unit of sharing is the pattern.
3. **Two shared layers, opposite rules.** Theme: thin, sparing, color. Standard
   look: fat, generous, everything else.
4. **Shape classes carry no color**; they compose it from the palette.
5. **Semantic tokens hold references, never values.** Only the palette holds a
   color. That is what keeps every layer above it theme-invariant — and it means
   a meaning needing a per-theme value forces the palette to grow something for
   it to point at, rather than being given a value where it stands.
6. **Every variant is marked**; no silent defaults.
7. **Modules keep the narrow band** — the genuinely per-game stuff — and stop
   being where chrome lives.

## What the outcome probably looks like

A shape-check done before shelving this, so picking it up later doesn't start
from scratch:

- **Less CSS overall**, and *much* less in game modules. The acceptance test:
  what should be LEFT in a game's module is board geometry and brand color. A
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
  even look like. Color was easy to guard; "this is the fourth copy of the same
  box" is not obviously machine-checkable.

On the color layer specifically — the concept is agreed, these are not:

- **Which roles the set contains.** Four or five looks right — wash / fill / edge
  / ink, plus something for the terminal frame — once hover and press are excluded
  as transformations; eight is the outside estimate. None of it tested against a
  real screen, and neither brake on adding one (*two unrelated meanings must want
  it*; *does it derive, or is it one judgment per hue?*) has been applied in
  anger.
- **Whether `-edge` is a role or a derivation of `-fill`.** All five families
  currently compute it as *"the fill, 16% toward black."* It stays a named role
  either way; what is open is whether the 16% has to vary per hue for the same
  chroma-ceiling reasons everything else does.
- **How many hues — and the 48-strong warm bucket is where to start.** The ~50
  estimate assumes about eight hue families plus a longer neutral ramp, and nobody
  has checked whether today's 170 actually collapse that far. The warm bucket is
  the biggest and the least understood: the likeliest reading is **two families**
  (a real orange, plus the cream/sand tile ramp) rather than one, which would
  explain most of the count without inventing anything. It is also where a genuine
  sixth *role* would be hiding if one exists.
- **What happens to the logo artwork.** 17 SVGs carry baked color that no guard
  can see. Which of the four fixes each one gets is per-logo and undecided, and
  the ones needing tokens have to be inlined to get them. The **wordmark** is a
  free choice rather than a problem — one sticker for every theme, or a drawn
  variant per theme — and does not need deciding now.
- **What the away-from-page overlay is called.** `--stronger` / `--weaker` is the
  leading answer and reads well so far; it has not been lived with. The fallback,
  if no name ever sits comfortably, is acceptable and not a failure: relative
  names in the files, natural language in prose, Claude translating.
- **Whether theme recipes get written at all**, and whether `docs/games/*.md` is
  where they go. The idea is only as good as the discipline of updating them.
- **What replaces `--tile-disabled-color`.** A scrabble/stackdown UX call, owed
  when those games convert.
- **Each brand color's rung on the three-level ladder.** Being collected
  incidentally by the tile-feedback conversions rather than as its own exercise.
- **What the file is called and how many there are.** "One vocabulary file, one
  block per mode" is the shape argued for above under *What the outcome probably
  looks like*, and it applies here unchanged, but the palette layer makes the
  per-mode block small enough that the question is worth re-asking.

## Loose ends this conversation turned up

- **Three dead `:hover` rules** left behind in the button sweep — the dialogs
  whose hand-rolled fill was removed kept their hand-rolled hover, which the
  shared rule now out-ranks. Harmless, invisible, and exactly the "I'll just add
  it locally" reflex under discussion.
- **`AnagramDialog`'s `.hint` is misnamed** — it's help text, not a hint.
- ~~Dangling `docs/playarea-decomposition-plan.md` references in code comments~~ —
  repointed at [playarea.md](../docs/playarea.md) in the 2026-08-19 docs/plans
  reorganization. The durable lesson stands: the doc-link guard only checks
  markdown-to-markdown links, so a doc path named in a *code comment* can dangle
  silently when its plan is deleted.

## Appendix: what actually derives — measured 2026-08-20

Moved here from the app-audit plan on 2026-09-05, when the color system's
rules went to [docs/ui.md](../docs/ui.md); this is the evidence behind
them. Established by resolving each candidate in a real browser and comparing
painted pixels, not by reimplementing oklab. Verified identical under both an
sRGB and a display-p3 profile.

**Derives exactly:**

- **`edge` is the fill × 0.84 on the gamma-encoded sRGB bytes** —
  `color-mix(in srgb, <fill> 84%, black)`. All eight of that day's consumers
  matched. The old `theme.css` called this "16% toward black", which was right
  about the amount and **wrong about the space**: done in oklab the same 16%
  gives won `#4f9452` against the real `#569d59`. The two spaces differ in
  step size, not character (sRGB −13% chroma, oklab −16%).
- **The four button tones reproduce all sixteen of their values from four
  anchors**: hover is the anchor at oklab lightness −0.05, the outline's ink at
  −0.115, the outline's hover at 8% over the card. This is the model working —
  a family picked at one sitting by one formula — and it is what everything
  else gets measured against.
- **`terminalFrame`** (renamed from `dullframe`, since a semantic name beats a
  descriptive one) was first claimed as `oklch(0.45, 0.105, <family hue>)` and
  that was **wrong on two counts**, corrected the same day by resolving it in a
  browser. The hue was the **ink's**, not base's — obvious in warning, whose
  ink sits 21.5° off its own base because Material's ramps rotate — and it did
  not reproduce exactly anyway: Chrome's oklch lands 1–4 bytes off each
  recorded value, because the originals came from a different oklab
  implementation. It now derives from BASE (Joel's call, small shift
  accepted), which moved four values: won, lost and near by 1–3 bytes, warning
  by 10. **Won is lifted to 0.564** at the same chroma, because at the family's
  lightness a green reads as black at normal zoom; neutral is achromatic.

**Does not derive, and needs a value per member:**

- **`ink`.** The step down from the fill runs **0.037** (near) to **0.305**
  (neutral) — 0.115 in red, 0.117 in orange, 0.195 in green. Two families
  happen to match the button step; three don't. This is the tier where the
  gold problem lives: gold can't go dark without ceasing to be gold, so near's
  ink stopped short.
- **`wash`.** Three of five reproduce as a mix with the card — won at 37%
  oklab, warning at 35% sRGB, neutral at 15% oklab, already three recipes.
  Lost and near reproduce as nothing: they're Material 100s, and Material's
  ramps rotate, so they sit **14° and 18° off their own family's hue**.
- **Member borders.** The comment claimed they were seeded by formula (oklch
  lightness clamped to `min(0.85 × fillL, 0.55)`); that reproduces **one of
  the eight**. The rest were hand-tuned afterward, so there is no formula to
  invert and a dark set is eight fresh judgments.
- **The tile ramp.** Across all twelve values hue holds at 87–90° while
  lightness falls 0.976 → 0.662 and chroma **rises** 0.011 → 0.107 — one
  material getting thicker, not a tint plus a darkening. A single-anchor mix
  with white misses the deep end by 0.027 of lightness.
