# The CSS system — the executable plan

> **STEPS 0–2 DONE, 2026-08-20.** Decisions settled (§3), baseline measured
> (§2, §9), every token classified (§4.1). What remains unwritten — §4.2–4.4 and
> the pattern list — is step 3–4 *work*, not decisions waiting on anyone.

**What this is.** [css-philosophy.md](css-philosophy.md) is a long, open-ended
conversation about how our CSS should work. It stays, in full, as the reasoning
archive — every "why" below cites a section of it rather than restating one. This
doc is the other half: **what we are actually going to do, in what order, and how
we will know it worked.**

**What it changes.** Three things, in one sprint because they only make sense
together:

1. **One palette, one place.** The only file holding a hex — game brand anchors
   excepted, and even those get a defined home.
2. **A structure that is theme-ready and polarity-ready**, so that "what is a
   theme change" and "what is standard" is enforced by where a line lives rather
   than by discipline.
3. **Named patterns.** The biggest part, and the biggest win: the shapes our
   tokens get assembled into — a dialog body, a form row, help text, a compact
   field — currently have no names, so each is rebuilt locally wherever it is
   needed. This is where the consistency and the line-count drop come from.

**Its relationship to [tile-feedback.md](tile-feedback.md).** That sprint is
**paused behind this one**. Converting a board against today's CSS and again
against the system's is work done to be undone. From here, each game takes its
**CSS pass and its tile-feedback pass back to back**, in that order — see §8.

---

## 1. Status

| | |
|---|---|
| started | 2026-08-20 |
| step | **0, 1, 2 done** — decisions settled (§3), baseline measured (§2, §9), tokens classified (§4.1). Next: **step 3, build the files** |
| blocked on | nothing |

## 2. Acceptance tests

**Baselined 2026-08-20** by `scripts/css-baseline.mjs`, which parses the way
`src/guards/cssTokens.test.ts` does so the numbers are comparable with what the
guard already enforces. Re-run it after each surface; the roster's rows (§9) come
from its output.

| | today | target | why this number |
|---|---|---|---|
| distinct hexes in `src/` | **171** | ≤ 120 | **below ~120 means investigate, not celebrate**: some of the current set may carry distinctions nobody knew were there |
| …**written exactly once** | **156** | — | the sharpest number here. Nearly every hex is its own hand-picked decision, which is what makes "~170 decisions → ~25" a real claim rather than a hopeful one |
| color-token definitions holding a **value** | **260** | ~50 | the palette layer's raw material |
| …holding a **reference** | **182** | grows | already correctly shaped — the discipline is real, the *count* is the problem |
| distinct tokens | **375** | should **fall** | if it holds steady while module CSS shrinks, the "tokens substituted for classes" reading was wrong |
| files holding a hex | **14** | 1 + brand anchors | not 17 — psychicnum's and stackdown's hold none |
| rules / declarations | **1,268 / 4,693** | fall | the real size metric; comment density drowns a line count |
| CSS lines in `src/` | 15,144 | — | kept for shape, never as a goal |
| what's left in a game module | — | board geometry + brand color | a dialog rule or a button rule still sitting in a game module means we missed one. **crosswords and scrabble are exempted by ruling** — see §9 |

**Where it lives**, which is most of the argument for this sprint in one table:

| kind | files | lines | rules | decls |
|---|---:|---:|---:|---:|
| `*.module.css` | 149 | 13,064 | 1,218 | 4,269 |
| `theme.css` | 16 | 2,033 | 50 | 424 |

Module CSS outweighs `common/theme.css` by **9.3 : 1** — the philosophy guessed
"roughly ten to one" from a partial look, and it was right.

**Two findings the baseline turned up that nobody predicted:**

- **`#ffffff` is written 15 separate times**, `#1976d2` 8 times, and only 15 of
  the 171 hexes are written more than once at all. The reuse that exists is
  concentrated in a handful of neutrals and the action blue — i.e. exactly where
  a shared token should already have been doing the work.
- **Nine common surfaces hold zero tokens and zero hexes** — club, panels,
  definitions, home, fields, chat, auth, branding, tooltips. Together they are
  2,570 lines that reference color and never declare it. The color discipline is
  genuinely working; what those surfaces are missing is the *pattern* layer, not
  the token layer. That is a direct prediction that steps 5–7 should show a large
  drop in rules with no change to the hex count.

## 3. Decisions owed

### 3.1 — SETTLED: the role set is FIVE

**`wash` · `fill` · `edge` · `ink` · `dullframe`**, listed page → away, so the
file carries the order the names don't.

This is not a proposal tested against nothing — **four of the five already ship,
rectangular, across five members**, and the fifth ships as a separate value per
member:

```
--outcome-{won,lost,near,warning,neutral}-{wash,fill,edge,ink}-color
--outcome-{…}-terminal-frame-color
```

picked as one family, by one formula, with reserved cells included. The set is a
description of what we converged on, not a guess.

**`wash` and `dullframe` are NOT on probation.** Both are actively used and
needed. A thin count of consumers today reflects that neither had a reachable
name, which is this document's whole diagnosis and not evidence against a role.

The two brakes still govern any *sixth*: **would two unrelated meanings reach for
it?** and **does it derive, or is it one judgment per hue?** So far `edge` derives
outright (*"the fill, 16% toward black"*, identically across all five outcome
members and the tile ramp — one operation, six applications, zero decisions per
hue), and `ink` is the expensive one, being where the gold problem lives.

#### The token grammar

Each token is **parts separated by hyphens**, and the hyphen means that and
nothing else:

```
--<family>-<member>-<role>-color      --outcome-lost-dullframe-color
--<hue>-<role>                        --red-ink                    (palette layer)
--<game>-<part>-<role>-color          --spellingbee-hex-fill-color (brand)
```

##### Only the ENDS are parsed, and only they must be one word

A guard checking the game prefix matches the **front**. A guard checking the role
set matches the **back**. A person reads the same way — anchor on `mark` at one
end and `dim-color` at the other, and take the middle as a label. Nothing parses
the middle, because the middle *is* one label.

> **A part that gets parsed is one word. The part that doesn't, needn't be.**

That is the real reason behind the role rule: `--outcome-lost-terminal-frame-color`
would hand a suffix matcher `frame`, not `terminal-frame`, which is a live bug.
The middle carries no such constraint.

##### A multi-word middle is camelCased

```
--mark-gameOver-dim-color
--spellingbee-boardRightEdge-edge-color
```

**Not a new convention — the one holdout being brought into line.** `src/` holds
**345 camelCase class names and zero kebab-case ones**; custom properties were the
only CSS identifiers not already doing this.

Two things make it work:

- **Custom properties are case-SENSITIVE**, unlike almost everything else in CSS
  (properties, keywords, hex, at-rules and pseudo-classes are all
  case-insensitive). That is what makes `gameOver` a stable name rather than a
  rendering of `gameover`.
- **Casing is not a separator character**, which is the whole argument for it over
  an underscore. Two separator characters means remembering which outranks which;
  a case shift is orthogonal, so **the hyphen keeps exactly one meaning — part
  boundary — without exception.**

Not a rule to be authoritarian about: `gameover` reads fine. It earns its keep on
the long ones, where the alternative is counting hyphens to work out which of
seven segments is the part and which is the role.

**The ends never camel.** A codename is one token
([naming.md](../docs/naming.md)) and a role is one word by the rule above:

```
--codenamesduet-keycardTile-fill-color     ✓
--codenamesDuet-keycardTile-fill-color     ✗   the codename is one token
```

##### `--_name` is private to one file

`--_cardGap`, `--_side`. The CSS answer to a local variable — an intermediate
value in one file's arithmetic, carrying no design decision and read by nobody
else. Valid CSS, and the established community convention for exactly this.

It leaves `_` with **exactly one job** in the codebase. Under the rejected
underscore-as-word-joiner scheme it would have had two, told apart only by
position.

##### The ladder: a name qualifies as far as its value travels

| the name is read… | written | example |
|---|---|---|
| only in the file that sets it | `--_name` | `--_cardGap` |
| across files **inside one game** | `--<game>-name` | `--setgame-cardWidth` |
| by **common** | no prefix — **and common declares it** | `--board-cols` |

The middle rung is load-bearing, and a two-way split misses it: setgame's
`--card-w` is assigned in `Board.module.css`, `GameTurnLog.module.css` *and*
`LastSet.module.css`, so it is a game-internal contract and `--_` would be a lie
about it.

**Each rung is checkable, which is the point:**

- `--_x` read outside the file that declares it → error
- `--<game>-x` read outside `src/<game>/` → error (§4.5)
- unprefixed, declared in a game, not declared in common → error (the fifteen in §4.1)

And the top rung answers the *"is this local or global?"* question that a bare
`--cols` cannot: **no prefix means shared, look in common.**

##### A shared slot is named for the component that reads it

The fifteen undeclared slots in §4.1 need sharper names as well as a home, and a
rule beats taste fifteen times over. `--cols` is read in exactly one place:

```css
.hugRectWidth { width: min(var(--avail-w),
  calc(var(--cols) * var(--max-tile-width) + (var(--cols) - 1) * var(--grid-gap))); }
```

It is the tile grid's column count, not boardCol-vs-infoCol — which is precisely
the ambiguity the name should have settled. So `--board-cols`, `--board-gap`,
`--board-tileMaxWidth`, and the rest sort themselves: `--stats-*` and `--rank-*`
are already right, while `--local-feedback-min-height` and `--swap-box-min-height`
want checking against whichever component actually reads them.

Declaring all fifteen in one block also makes the contract **visible as a
family** — a game filling in `--board-*` can see the whole set it is expected to
supply, which is the thing that would have stopped them going undeclared.

##### The guards were widened for both — DONE 2026-08-20

Every token-name regex in the repo read `--[a-z0-9-]+`, so a camelCased or
underscored token would have been **invisible** to all of them: not counted as
defined, not counted as referenced, not checked for a fallback. A typo'd
`--_crdGap` would never have failed.

Widened to `--[a-zA-Z0-9_-]+` in all seven sites — `cssTokens.test.ts` (×4, now
one shared `TOKEN` constant with a comment saying why it must not be narrowed
back), `palette.test.ts`, `color-census.py`, `css-baseline.mjs`.

**Verified by planting**, not by reading: a `var(--mark-gameOver-planted-color)`
and a `var(--_plantedGap)` were each added to a real stylesheet and each failed
the phantom-token guard by name, then reverted.

It also settles a rename that was pending anyway:
`--outcome-neutral-terminal-frame-color` → `--outcome-neutral-dullframe-color`.

#### Why the fifth is `dullframe` and not `frame`

**A frame is not the role; a DULL frame is.** Bare `frame` names a box around a
thing, and we draw plenty of those — a card, a panel, a preview — none of which
would want this color. It is specifically the dulled one: **half the chroma of
the fills**, which is what keeps a board-sized bar of it from shouting an outcome
the pill has already stated quietly.

Its derivation spec is unusually precise, and it comes from where the line sits
rather than from what it means: the terminal frame is drawn hard against the
board with no whitespace, so it has to carry against the tiles on one side *and*
the near-white page on the other. Dark and dull is what satisfies both.

So the pairing to learn, corrected — the axis is dullness, not geometry:

> **`edge` is the boundary of a fill, at that fill's own saturation.
> `dullframe` is a heavy line around a whole thing, deliberately desaturated so
> it reads as chrome rather than as state.**

**It passes the role test even though its only consumer today is semantic.** The
game-over frame means *dead, over, done* — but the name says *dull* and *frame*,
not *terminal*, so a second unrelated meaning can reach for it: an archived club
card, an abandoned game, any "this is a record, not a position" surround. Had it
been called `terminalframe`, the second consumer would have made the name a lie.

Three candidates ruled out on the way, recorded so they are not re-proposed:

- **`terminalframe`** — "terminal" is a *meaning*, and a role must survive its
  second consumer.
- **`strongframe`** — collides with `--stronger` / `--weaker` (§3.3), which are
  an *operation*. A destination and an operation sharing a stem is the exact
  conflation §3.3 exists to prevent.
- **`deep`** — looks right, and is a lie. Won's frame (`#4b864b`) is **lighter**
  than its ink (`#2e7d32`), deliberately, because at the family's lightness the
  green reads as black. The role is not "furthest along the ramp"; dark is only
  usually how dull gets achieved.

One bonus worth noting: **`dull` puts CHROMA into a name for the first time.**
The philosophy's vocabulary section flags exactly that gap — *shade* collapses
lightness and chroma, and the corrections that matter in this app are chroma
corrections. The role that most needed the distinction is now the one carrying
the word.

### 3.2 — SETTLED: modules stay; five homes

CSS Modules are kept. What changes is what goes in them.

| kind | where | the test |
|---|---|---|
| **utility** — an adjustment with no "what" | **global** | *"this bit should be quieter than its neighbor."* Naming it would manufacture a fake concept |
| **pattern with structure or behavior** | a **React component**, CSS in its own module | a form, a dialog |
| **pattern that is only a look** | a **shared module**, imported where wanted | help text, a compact field |
| **one component's internals** | that component's module | `GuessKeyboard`'s `.key` |
| **game-specific** | that game's module | spellingbee's center hex |

#### Why shared MODULES for patterns, and not global classes

An earlier round of this argued global classes on **re-pricing** grounds: the
shared thing has to be cheaper than typing local, or nobody reaches for it. The
codebase refutes it.

`common/components/fields/setupForm.module.css` is imported by **17 files** —
every game's SetupForm plus two shared field components. `modalActions.module.css`
by four dialogs. **A shared module already achieved app-wide adoption**, so the
import cost is demonstrably not a deterrent.

The other argument for global — that collisions restore the feedback signal
modules deleted — buys less than it appeared to. A collision only fires when two
people choose the **same name**, and this document's founding example is drift
under **different** names (AnagramDialog's `.hint`, which is help text). Global
would not have caught it.

What global keeps is the genuinely small set: words used ad hoc in prose-y markup
where a per-file import is disproportionate. `muted`, `card`, `error`,
`definable` — roughly what is global today, and it should not grow much.

#### Two boundary rules, because both edges leak

- **A common component's module holds its own internals, never a
  re-implementation of a pattern.** Without this, "it's a component, so it's a
  module" lets every existing duplication move house under a new banner —
  everything is inside *some* component. `GuessKeyboard`'s `.key` is its own;
  `GuessKeyboard`'s help text is not.
- **A shared stylesheet with many consumers and no component is a component
  waiting to be written.** `setupForm.module.css` is the case in point: sixteen
  games import one stylesheet and each re-types the structure around it. That is
  the same *local names hide shared patterns* failure one level up — a shared
  stylesheet hiding a shared component.

#### The guard

Neither a bare global string nor `styles.helpTxt` fails loudly — a typo yields
`className="undefined"` in both. So both need the same instrument, in both
directions: **a class referenced but not defined, and a class defined but not
referenced.** Same shape as the existing `no dead tokens` guard, and per the
planting rule it gets broken both ways before it is believed.

### 3.3 — SETTLED: `--stronger` / `--weaker`

The away-from-page overlay. More or less present against whatever the piece sits
on; darker on a light page, lighter on a dark one. `dim-up` / `dim-down` survive
as **prose only** — they name the mechanism, which is what you want when
explaining and not what you want when reading. Philosophy → *the tokens are
relative; dim-up and dim-down are prose*.

### 3.4 — SETTLED: what is shared is eager and global

See §6.1.

### 3.5 — SETTLED: assets are punted to the end

See §10.

## 4. The layers

*(4.2–4.4 still TBD — they are the derivation work, done at step 3.)*

- 4.2 polarity vs theme — what each decides
- 4.3 the anchors, and what derives from them
- 4.4 the position ramp (tiles) alongside the role ramps

### 4.1 — SETTLED: the layers, and what each holds

**Step 2's output, 2026-08-20.** Every one of the 561 token definitions was
sorted. Re-runnable via `scripts/css-baseline.mjs`.

The mechanical split — what the *value* is — was already in §2: 260 hold a color,
182 hold a `var()`, 119 hold something else. The classification is the other axis:
what each token is **for**. It needed **six buckets, not the four this plan
originally named**, and the two additions are the finding.

| bucket | holds | example | where it ends up |
|---|---|---|---|
| **palette** | a color VALUE | `--red-fill` | `palette.css`, plus per-game `brand.css` |
| **semantic** | a reference expressing meaning | `--outcome-lost-fill-color` | `semantics.css` |
| **component / brand** | a reference scoped to one place | `--codenamesduet-assassin-color` | its own file |
| **standard-look** | a non-color design value | a radius, an opacity | mostly **dissolves into named classes** (§5.5) |
| **contract slot** ⚠️ | nothing — a space a game fills in | `--info-col-width`, `--grid-gap` | stays a token; needs a guard |
| **local math** | a step in one file's sizing arithmetic | `--cols`, `--rows`, `--side` | stays where it is; **not really a token** |

#### The two extra buckets, and why four wasn't enough

**A contract slot is a blank, not a decision.** `--tile-bg-color` doesn't say what
color a tile is. It's an empty space the shared tile CSS leaves for each game to
fill in, and so are `--info-col-width` and `--grid-gap`. That is backwards from a
normal token: one that nobody **reads** is just clutter you can delete, while a
slot that nobody **fills in** breaks the page. Filing them next to real
decisions would hide that.

**Local math is not really a token.** `--cols`, `--rows`, `--side`,
`--card-w`, `--max-tile-size`. A board works out its own tile size with some
arithmetic and these hold the middle steps. Fifteen of them, each used in one
file. They aren't part of the design — no theme would ever change one.

Both matter to §4.5, because that rule says a game's own token starts with the
game's name. Applied to everything it would demand `--psychicnum-cols`, which
helps nobody:

> **§4.5's naming rule covers COLORS.** A contract slot is named for the space it
> fills and local math for the arithmetic. Neither is a color, so neither takes a
> game's name.

#### ⚠️ Fifteen contract slots that nobody declares

The real find. Common reads these; a game fills them; **no file declares them**:

```
--board-units-cap  --board-units-h  --board-units-w  --cols  --grid-gap
--local-feedback-min-height  --max-board-size  --max-tile-width  --rank-text
--stats-col-gap  --stats-max-width  --swap-box-min-height
--tile-font-factor  --tile-font-max  --tile-font-min
```

A game that mounts one of those common components and forgets to set the slot
gets an undefined custom property, which invalidates **the whole declaration**,
silently. That is the `--info-col-width` failure mode exactly — except
`--info-col-width` is at least owned by common; these fifteen are owned by nobody.

**The existing guard cannot see it.** *"Every `var(--token)` reference is
defined"* passes, because each name IS defined — in some game's file. What no
guard checks is that **every game mounting that component defines it.** Added to
§6.2 as its own check.

Eleven other slots are properly owned by common and filled in by games 92 times over
(`--tile-bg-color` ×20, `--tile-border-color` ×20, `--tile-ink-color` ×17,
`--avail-h` ×13, `--info-col-width` ×12). Those are the mechanism working as
designed — the shared `.tile` reads only tokens, so a game restyles by re-setting
one rather than out-cascading a stylesheet.

#### The §4.5 audit comes back clean

Every color value in the tree, by where it lives:

| | |
|---|---|
| game-prefixed, in its own game — **correct** | **112** |
| game-prefixed, but sitting in COMMON | **10** |
| shared name, in common — the palette proper | **138** |
| shared name, in a GAME file — would break the rule | **0** |

**All ten misplaced values are wordle's**, and they are the exact case §4.5 already
ruled on before any of this was measured — the `--wordlelike-*` rename. **Zero**
game files define a shared-named color.

So the naming rule is not a new discipline being imposed; **it is a description of
what this codebase already does, with one exception we found by reasoning and then
confirmed by counting.** That is the strongest evidence so far that the rule is
cut along a real joint — and it means step 3 inherits far less mess than the
171-hexes headline suggests.

### 4.5 — SETTLED: where a game's brand color lives

A **brand color** is a color specific to one game and not in the general palette.
The rule, which is deliberately simple because a loose "what counts as brand" is
too loose to act on:

> **A brand color is defined in that game's own CSS, and its token name starts
> with the game's codename followed by a hyphen.** `--spellingbee-gold`, in
> `spellingbee/theme.css`, and nowhere else.

The hyphen is load-bearing, not pedantry — see the family escape hatch below.

Three things this buys:

- **It is a forcing function on the game.** You cannot write
  `--spellingbee-gold` without having decided that gold is spellingbee's, which
  is the question ("what IS this game's brand?") that otherwise never gets asked
  out loud.
- **It makes r2 machine-checkable, which the philosophy said the language could
  not do.** Custom properties have no module scoping, so co-location alone only
  makes a cross-game reach *greppable*. The naming convention turns greppable
  into checkable: **a `--<game>-` token referenced from outside `src/<game>/` is
  an error.** One guard over one convention, catching r1 and r2 at once.
- **The lazy chunk agrees.** A game's `theme.css` ships in that game's chunk
  (§6.1), so one game reading another's token resolves to nothing — silently,
  since an undefined custom property invalidates the whole declaration. A color
  co-located in a game is *structurally* unreachable from another game, which is
  the coupling rule and the bundler saying the same thing.

**A guard precondition worth stating, because the rule rests on it:** no game's
codename is another's followed by a hyphen. `wordle` / `wordwheel` / `wordiply`
are the closest the roster comes, and all three are distinct under `--<game>-`.
Re-check it if a game is ever added.

#### The escape hatch: a shared FAMILY takes a family name

Some color vocabulary is genuinely shared by several games because they all
imported it from the same place. wordle's green and yellow are the case: **wordle
and waffle both wear them, and so does the shared `GuessKeyboard`**. That is not
wordle's brand being borrowed; it is a *wordle-like* color language that three
consumers speak.

So it stays in common, and it is **renamed to say what it is**:

```
--wordle-green-fill-color   →   --wordlelike-green-fill-color
```

which keeps "starts with `--<game>-`" meaning exactly one thing. `--wordlelike-`
is not `--wordle-`, so the guard reads it correctly and so does a person.

The bar for minting one, since this is the way out of the forcing function and
should not be an easy one:

- **Two or more games**, and
- **they share the vocabulary because it was IMPORTED, not because it was
  convenient** — level 1 on the brand ladder, a color that carries meaning the
  player brought with them.

A family that fails the second test is two games that merely look alike, and
those keep their own tokens.

**It lives in the palette's fixed-anchor block**, alongside anything else no
theme may move. That needs no exception to the location rule: it is a
palette-layer line in the palette's own file, which is the plainest possible
case. (An earlier draft of this section had wordle's hex living in
`wordle/theme.css` and leaned on *the layers are roles, not files* to permit it.
That argument is sound and still covers spellingbee's per-theme gold — it is just
not needed here.)

#### What is left in wordle's own file, and why it is the demonstration

Exactly two tokens, and both are genuinely wordle's:

```css
--wordle-tile-border:        var(--wordlelike-blank-fill-color);
--wordle-tile-border-filled: #878a8c;
```

After the rename, `--wordle-*` means *wordle's own* and nothing else — which is
the rule doing its job on the game that most tempted us to break it.

#### It also resolves the two-greens problem, for free

wordle's green means **"right letter, right spot"** — a verdict on one guess.
waffle's means **"this letter is in its final position"** — a persistent state on
a board. Cousins, not the same claim; they share a hex only because both
inherited the NYT vocabulary.

A single shared token was erasing that. The three-layer model says exactly what
to do, and it needs no duplication:

```css
/* palette, fixed: the imported vocabulary, under a HUE name */
--wordlelike-green-fill-color: #66a45f;

/* each game, its own file: what that color MEANS here */
--waffle-placed-fill-color: var(--wordlelike-green-fill-color);
```

**The shared entry takes the hue name** — honest, because the hue is genuinely
locked, and it is the vocabulary players read. **Each game's own token takes the
meaning name and references it.** Both games get to say what their green means,
one value backs them, and nothing is copied.

#### What the split costs

A rename, and nothing else. `GuessKeyboard` keeps reading the family directly
and needs no slot indirection; waffle needs no resurrected `theme.css`; both
games keep working through their lazy chunks because the family is eager in
common.

`palette.ts` and `wordle/lib/colors.ts` follow the rename. The latter is a
non-CSS consumer, which is the standing carve-out: **a value read by TS stays a
token.**

### 4.6 — the file layout

The shape; exact names settle at step 3. Everything here is **eager and global**
(§3.4) except a game's `brand.css`, which rides its own chunk.

```
common/
  palette.css       hexes. The ONLY file holding one, plus the fixed families
                    no theme may move (--wordlelike-*)
  themes.css        the anchors, one block per theme; polarity stated, not
                    inferred. One file, not one per theme — two parallel lists
                    of identical names is a drift machine
  semantics.css     meaning → var(). Theme-invariant, holds no value
  base.css          element resets, body, box-sizing — the true globals
  utilities.css     the small global set: muted, card, error, definable
  patterns/         shared modules, cut by PATTERN and never by container
    text.module.css
    forms.module.css
    surfaces.module.css
<game>/
  brand.css         --<game>-* tokens. Nothing else
```

**`theme.css` disappears as a name at both levels**, and that is the point: a
file called *theme* holding standard look is how the two got conflated. "Theme"
now means daylight / cupcake and nothing else.

**Why `<game>/brand.css` rather than `game.css`:** 13 of the 16 per-game files
are already nothing but `:root { …tokens }`, and `brand` is the same forcing
function §4.5's naming rule is — a line that is not brand gets asked about on the
way in. Three files carry one extra rule today; setgame's colorblind selector is
a token re-declaration and stays, while bananagrams' `body.mg-dragging` and
scrabble's `body.scrabble-dragging` are **the same rule in two games under
different names** and belong in `patterns/` as drag feedback. That is drift to
fix, not a reason to widen the file's remit.

**Against `<game>/<game>.css`:** the repo's per-game convention is already role
names — `manifest.ts`, `logo.svg`, `theme.css`. `brand.css` continues it; the
stutter breaks it.

## 5. The patterns

The pattern **list** gets written at step 4, from the shallow whole-app pass.
These are the rules it is written under.

### 5.1 Names for things, utilities for adjustments

> **Can you say what the thing is, in a sentence that doesn't mention how it
> looks?** *"The explanatory line under a field"* — yes, name it. *"This bit
> should be quieter than its neighbor"* — no, that is an adjustment, and a
> utility is honest.

Naming an adjustment manufactures a fake concept, and a fake concept is worse
than none: future readers hunt for a meaning that was never there.

### 5.2 Promote on the SECOND write

Not the first — there the evidence genuinely does not exist and local is correct.
Two, not the traditional three, because rule-of-three assumes you will be present
for the third and here you often will not.

**Copy-pasting a rule out of another module IS the signal.** If you are copying,
you have already found the pattern; you have just chosen to record it as
duplication instead of as a name.

### 5.3 A shared class or component may have no silent default

The button bug was not fatness — it was that **saying nothing meant something**.
Both variants get said; neither is what you get by staying quiet.

### 5.4 Compose on *is-a*, never on *looks-like*

`.dangerButton composes button` — a danger button **is a** button. `.helpText`
does **not** compose `.muted`: help text is not a kind of muted, it is a thing
that happens to be quiet, and they agree today by coincidence rather than by
definition.

Two classes pointing at one token is not duplication — it is two consumers of one
named decision, which is what a token is for. Composing instead would define the
thing as *whatever the adjustment currently is*, and make an unrelated change to
`.muted` silently redefine help text.

**Patterns and utilities are siblings that both read the palette, never a
hierarchy.**

### 5.5 Size and spacing: consistency is a SOFT goal

Neither is themed, so neither carries color's stakes, and the enforcement drops
accordingly.

**The consistency people actually want is a CLASS guarantee, not a token one.**
"Every dialog's input labels are the same size" is delivered by there being one
`Field` pattern — not by a ramp. Two different things landing a hair apart
(help text at 0.9rem, a label at 0.91rem) is not a defect.

- **A text-size ramp exists, and its job is legibility rather than
  enforcement.** Five steps, smallest → largest, body marked, so the file carries
  the order. It absorbs 134 of the app's 197 `font-size` declarations, which today
  spread over twelve values in a 0.35rem band — 0.8 / 0.82 / 0.85 are not three
  decisions. What the ramp buys is that a class can say *"one step below body"*
  instead of *"0.9rem"*, and that new code stops accreting neighbors. Two patterns
  landing on one step is fine; it claims no identity.
- **Board geometry is excluded outright.** A crossword letter sized off its cell
  (`clamp()`, `cqmin`, `calc(var(--cw-cell) …)`) is not step 3 of anything, and
  board spacing is bespoke by nature and out of this sprint.
- **Spacing lives in the CLASS, not in tokens.** Chrome probably has a
  discoverable common ramp, but forcing every value into `margin-1…5` would be
  ceremony: much chrome spacing is a **tuple tuned to a box**
  (`padding: 0.6rem 0.75rem`), and no consumer can meaningfully ask for "step 3"
  there. The class is the right place to say *running text has this much between
  paragraphs* or *help text sits this far below the status bar*.
- **The instrument is the notice-report (§6.2), not a guard.** *"These fourteen
  classes use spacing within 0.05rem of each other"* is a human judgment call.
  Forbidding fits color, where the answer is always "name it."

One rule reconciles the ramp with *numbers inside a named pattern stay numbers*,
and it is neither about color nor about size:

> **Tokens are for values with MANY READERS where position is meaningful. A value
> with one reader belongs inside its class as a number.**

`.helpText`'s font-size has 134 readers and an ordering; its `margin-bottom` has
one. Same class, opposite treatment, one rule.

### 5.6 The pattern list

*(filled in at step 4)*

## 6. Structural constraints

Things that are true about this codebase and will break the work if forgotten.

### 6.1 Eager vs lazy — the silent-failure landmine

`common/theme.css` is imported once, eagerly, from `main.tsx`. Every **game's**
`theme.css` is imported by that game's `PlayArea.tsx` only, so it ships in that
game's lazy chunk — which is why `crosswords/SetupForm.tsx` needs its own import
of the same file. An undefined custom property invalidates the whole declaration
**silently**.

**The rule: palette, polarity, theme and all standard-look are eager and global.
Only a game's own brand anchors stay lazy.**

### 6.2 The guards

Four changes, plus one hazard.

| | |
|---|---|
| `no unnamed colors` | sharpens into a **location** rule: a hex appears only inside a palette definition, and every other color token is a `var()` of one |
| the role set | a test asserting the set is exactly §3.1's, so a sixth role is a visible line in a diff — i.e. a conversation |
| shape drift | an instrument that **notices** rather than forbids: a report a human judges. Forbidding fits color, where the answer is always "name it" |
| **contract slots** | new, and §4.1 is why: **15 names common reads that no file declares.** The existing phantom-token guard passes them, because each IS defined — in *some* game. What nothing checks is that every game mounting that component defines it. A missing one kills the whole declaration silently |
| `no dead tokens` | **the hazard.** Rectangular families mean every hue carries every role whether or not anything reads it — which this guard calls dead. The escape already exists: `palette.ts` / `PalettePage.tsx` is written to *be* the reader that keeps a reserved cell alive. **Verify that mechanism before relying on it** |

**A repo-wide guard cannot be switched on until the last game converts.** If
letterboxed goes last, letterboxed holds non-brand colors in its own CSS until
its turn, and that is not a bug to fix early — it is the sprint not being
finished. So:

- the location rule is enforced **per surface, at that surface's pass** — a
  surface is not done while it violates it;
- mechanically, a **shrinking allowlist** of not-yet-converted files, so the
  guard still fails on a *new* violation anywhere;
- the allowlist empties at step 11, and the guard becomes unconditional.

*(the allowlist mechanism is a proposal, not settled)*

### 6.3 `/palette` is the instrument

"Derive once, look at it on a screen, correct what is wrong" needs a screen.
`PalettePage` exists and already renders families × variants. It grows with this:
roles × hues, and ideally both polarities side by side.

### 6.4 Device density

The breakpoint changes real spacing, and that is neither theme nor standard
look — philosophy calls it *the one seam that remains*. `common/breakpoints.css`
exists. **A position is owed before step 5**, or mobile density gets re-scattered
into the modules we are emptying.

*(unresolved)*

### 6.5 Rulings owed to tile-feedback

Cross-doc edits this sprint owns rather than leaving behind:

- **the dim-up rule inverts.** It is stated absolutely and reasoned relatively
  ("on a light page…"), so under a dark polarity it is backwards. It wants
  restating as **never dim a game piece TOWARD the page**.
- **`--tile-disabled-color` cannot be one token.** A delta frozen into an
  absolute is correct for exactly one starting point; the tile ramp has five.
  Owed to scrabble and stackdown when they convert.

## 7. The steps

Each step's exit criterion is the thing that makes it done. A step with no
criterion is a step we cannot finish.

| # | step | exit criterion |
|---|---|---|
| **0** | baseline + census ✅ **2026-08-20** | §2 and §9 filled from `scripts/css-baseline.mjs` |
| **1** | this doc + the decisions ✅ **2026-08-20** | §3 settled: the role set, the one-word rule, modules-vs-global, brand-color location, `--stronger`/`--weaker`. Done *before* step 0 in wall-clock; the two are independent |
| **2** | classify ✅ **2026-08-20** | all 561 definitions sorted — §4.1. Needed **six** buckets, not four; turned up 15 contract slots nobody declares; the §4.5 audit came back clean but for wordle. No files moved |
| **3** | build the files | palette + polarity + `daylight` exist; everything resolves; nothing looks different |
| **3b** | the **midnight spike** | a throwaway dark theme renders the homepage and one game. **This is step 3's acceptance test** — the distance-from-page claim only fails in a dark polarity. If it takes a week, the split is wrong, and we learn that here rather than at game sixteen. Kept behind a flag or deleted |
| **4** | shallow whole-app pattern pass | the top ~10 patterns **named**, app-wide, before any surface is deep-converted. Done by reading rendered surfaces, **never by grepping class names** — local names hide shared patterns, so searching by local name reproduces the bug |
| **5** | homepage | the rehearsal: lowest blast radius, proves the mechanics |
| **6** | dialogs + forms | the first real win — many near-identical instances, and where this conversation started |
| **7** | clubpage + remaining non-game chrome | |
| **8** | shared game chrome | `PlayArea` (895 lines) and friends. **Before any game**, because every game is measured against it |
| **9** | per game — CSS pass, then tf pass | see §8. psychicnum first, as the control |
| **10** | assets | see §10 |
| **11** | fold + delete | durable rules into `docs/ui.md` and `docs/code-conventions.md`; the guard allowlist empties; this doc goes |

## 8. How a game is done

Two passes, back to back, while the game is loaded in your head:

1. **CSS pass** — the game's module CSS reduces to board geometry and brand
   color; its colors reference the palette; its brand anchor gets its rung on the
   three-level ladder (imported semantics / recognition / decoration).
2. **tile-feedback pass** — straight to **tf2**, per
   [tile-feedback.md](tile-feedback.md), which is authoritative for that half.
   Its per-game "what it will force" and inherited color question are the input.

**psychicnum goes first as the CONTROL.** It is a known-correct board under the
tile-feedback rules; putting it through the restructure tells us whether the
machinery preserves meaning. The first genuinely new conversion is the second
game.

**The tf level lives in tile-feedback.md and nowhere else** — this roster
deliberately does not mirror it. Two copies of one fact is a drift machine.

## 9. Roster

Baselines from `scripts/css-baseline.mjs`, 2026-08-20. **Rules and declarations
are the columns that matter**; lines are shown because they are what everyone
looks at first, and comment density in this repo makes them the weakest signal.
Fill the *after* halves as each surface lands.

### Non-game surfaces

| # | surface | files | rules | decls | hexes | after (rules / decls) | done |
|---|---|---:|---:|---:|---:|---|---|
| 5 | homepage — `common/components/home/` | 1 | 19 | 86 | 0 | | — |
| 6 | forms + fields — `fields/`, `setup/` | 7 | 41 | 127 | 0 | | — |
| 6 | dialogs — `definitions/`, `ConfirmDialog`, `SetupGameDialog`, `CelebrationDialog`, … | 5+ | 47+ | 164+ | 0 | | — |
| 7 | clubpage — `common/components/club/` | 6 | 80 | 275 | 0 | | — |
| 7 | panels + menus — `common/components/panels/` | 6 | 47 | 225 | 0 | | — |
| 7 | chat — `common/components/chat/` | 3 | 14 | 73 | 0 | | — |
| 7 | toasts · account · auth · branding · tooltips · text | 11 | 37 | 138 | 0 | | — |
| 8 | **shared game chrome** — `common/components/game/` | **29** | **258** | **895** | 0 | | — |
| 8 | buttons — `common/components/buttons/` | 3 | 14 | 57 | 0 | | — |
| 3 | the palette page — `common/components/palette/` | 1 | 13 | 36 | 0 | | — |
| 2–3 | `common/theme.css` + `breakpoints.css` | 2 | 33 | 283 | **99** | | — |

`common/components/game/` is the single biggest body of CSS in the app and every
one of the sixteen games sits on it — which is why §7 puts it at step 8, before
any game and after every other shared surface.

### Games

Order settled at step 9, not now — chosen the way tile-feedback chose its own, by
which decisions a game forces. psychicnum is fixed at first for the reason in §8.

| # | game | css | files | rules | decls | tokens | hexes | notes |
|---|---|---|---:|---:|---:|---:|---:|---|
| 1 | psychicnum | — | 5 | 12 | 36 | 17 | 0 | **the control** — smallest board, already correct under tile-feedback |
| | waffle | — | 5 | 25 | 88 | 24 | 0 | no `theme.css` at all (deleted at tf1) |
| | wordle | — | 6 | 33 | 91 | 22 | 1 | the `--wordlelike-*` rename lands here (§4.5) |
| | connections | — | 4 | 28 | 94 | 26 | 4 | |
| | boggle | — | 3 | 21 | 77 | 13 | 1 | |
| | stackdown | — | 7 | 23 | 75 | 6 | 0 | holds tokens but **no hex** — already all references |
| | spellingbee | — | 4 | 22 | 64 | 9 | 3 | one decision covering both, at whichever converts first |
| | wordwheel | — | 4 | 26 | 73 | 11 | 5 | ↑ |
| | wordiply | — | 8 | 46 | 163 | 5 | 1 | |
| | letterboxed | — | 4 | 40 | 138 | 13 | 1 | the sole `-wash` consumer in the app |
| | bananagrams | — | 4 | 44 | 194 | 16 | 6 | `body.mg-dragging` → `patterns/` (§4.6) |
| | codenamesduet | — | 8 | 50 | 153 | 34 | 9 | |
| | strands | — | 5 | 48 | 138 | 15 | 9 | |
| | scrabble | — | 8 | 65 | 266 | 29 | 12 | `body.scrabble-dragging` → `patterns/` (§4.6) |
| | setgame | — | 6 | 50 | 174 | 35 | 14 | |
| | crosswords | — | 9 | **114** | **454** | 25 | **20** | largest on every axis, and **legitimately so** — see the ruling below. Goes late |

**psychicnum and stackdown already hold no hex at all**, so a game carrying zero
color values of its own is demonstrably achievable rather than aspirational.

#### The crosswords exemption — RULED 2026-08-20

crosswords is the outlier on every axis: most rules, most declarations, most
hexes. **That is not a backlog item, and after its pass it may still carry far
more CSS than any other game. Expect that; it is not a failure to converge.**

Two causes, and only one of them is fixable:

- **History.** It was adapted from an earlier implementation written outside this
  repo and imported, so it never grew up under these conventions. Some of what it
  violates is simply age, and that part will come out.
- **Requirement.** It genuinely needs a UI unlike any other game's — printed
  notation on the cell, a cursor that drags a whole-word highlight with it, the
  keyboard-required layout. **scrabble is the next closest** for the same reason:
  a premium-square board is a different object from a grid of tiles.

So the ruling is: **don't optimize for crosswords, and don't measure the sprint
by it.** It converts **toward the end of the game list**, when the vocabulary has
been proven on fifteen boards that fit it, and it is allowed to keep whatever it
still needs. The general acceptance test — *board geometry and brand color, and
nothing else* — is a target for the games the vocabulary fits, not a verdict on
the two it doesn't.

## 10. Assets — punted to step 10, deliberately

17 game `logo.svg` files carry baked color; the `homeTitle.png` wordmark is
opaque near-white with no vector source; the favicon and the in-app "P" carry two
near-whites that will fail on a dark page. None of it is visible to any guard.

**Not done game by game.** Doing one logo at each game's pass means arguing about
a tree sixteen times while the forest is the point. It is also the lowest-risk
part of the sprint — nothing here breaks a layout — and the midnight spike (3b)
will have shown which ones actually fail. So: all of it, once, at the end.

## 11. The safety net

- **The screenshot gallery** (`gmake gallery`, 411 tiles, complete) is built
  before and after each surface, and the images diffed. That turns "eyeball
  sixteen games carefully" from a thing to remember into a thing that fails
  loudly.
- **What it does not cover**: hover, press, focus, in-flight, drag. Those still
  need a person, and they are exactly where tile-feedback's marks live — which is
  another reason the two passes are back to back.
- **One commit per surface**, so a bad surface reverts alone.

## 12. Open questions

- **§6.4** device density — owed before step 5
- **§6.2** whether the shrinking allowlist is the right guard mechanism
- **How many hues**, and whether the 48-strong warm bucket is two families (a
  real orange plus the cream/sand tile ramp) rather than one
- **Whether `-edge` is a role or a derivation of `-fill`** — it stays a named role
  either way; open is whether the 16% varies per hue
- **What `css-philosophy.md` becomes** when this ships. It is reasoning about
  decided design, which fits neither `plans/` (work in flight) nor `docs/`
  (what is). Joel wants it kept. Decide at step 11
