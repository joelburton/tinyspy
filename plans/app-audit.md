# App audit — the area-by-area sweep

**The single spec for the live sprint**, and named for what it turned out to be:
a walk through the app area by area, auditing each one's React, SQL and CSS
together. It began as the CSS half alone and was called `css-system-2` until
2026-09-02; §0 is the record of that widening. It draws on the wisdom in
[css-philosophy.md](css-philosophy.md) and the decisions in `css-system.md`, but
it exists because much of `css-system.md` FAILED: we built part of a system too
complex to understand and too fragile to maintain. On any conflict, this
document wins. `css-system.md` is being folded in and deleted.

**Editorial rule:** decisions, plans and measurements — not rationale. The
"why" lives in `css-philosophy.md`.

**This file has PRECEDENCE while the sprint runs.** Where it and `ui.md`,
`naming.md` or `code-conventions.md` disagree, this wins — the sprint is one
organic unit, and scattering its decisions across four files invites
"which do we believe, line 100 of code-conventions or line 200 of this?".
Those docs get updated at step 12, when the sprint's durable half moves out
and this file is deleted.

**It has to stay readable in one sitting**, and that is a maintained property,
not a hope: its predecessor rotted from being clogged with "we decided then to
do it this way" and never being tidied, not from length as such. **So it gets
READ AND TIDIED, not only appended to.** A finished step keeps its ruling and
loses its story; how something was discovered is `css-philosophy.md`'s.

---

## PAUSED 2026-08-26 — behind the error/fault redesign

Joel: *"there's no point continuing this sprint before we fix the error/fault
system. how could we really audit the site with a rotting fish head at the
center."*

**Nothing here is withdrawn; the sequence changed.** The next two areas are the
error-heavy ones — `simple-page` is `ErrorPage`, `Loading` and
`ClaimHandleScreen` (the last file holding SQLSTATE branches), and `club-page`
owns the two page-load failures and the setup dialog's error line. Auditing
those means auditing surfaces whose content model is about to change, while
`ERROR_COPY` has been frozen the whole time and every area has worked around it.
The homepage area alone produced four error findings and two fixes on the day
this was called.

It is also good timing rather than merely necessary: this sprint has already
built the surfaces the error system renders into — `FailureLine`, `Field`,
`StandardForm`, the floating-panel families, `ErrorPage` wearing the fault look
— so the redesign targets real components instead of inventing them.

**This resumed 2026-09-02**, and where it went is §21 → "The 2026-09-02 restart".
The live area is `deep` ([plans/areas/deep.md](areas/deep.md)); §7 → "The areas,
in order" holds what follows it.

**The work that paused this one is DONE** (the error/envelope sprint, finished
2026-09-01 — see [docs/envelopes.md](../docs/envelopes.md)). Nothing blocks this
plan now; whether it resumes is a scheduling question, not a dependency.

---

## 0. What this sprint turned out to be

It began as CSS. It is a **sweep, area by area — homepage, clubpage, then each
game — locking down shared ideas to reduce difference and code.** CSS is the
biggest part and not the only one: the same duplication lives in the React
(three pages hand-rolling one header; a component's parts renamed by every
consumer), and the sweep reads each file once, so anything the area needs gets
done while it is open.

**Growing is expected, not scope creep** — as long as the growth is organized by
area. Things that joined after the plan was written: the three consistency levels
(§6.5), the heading levels, the `:global` rule and its guard, the class-naming
conventions, `<PageHeader>` as a component, and the spacing vocabulary (§18).

The corollary, which is why the doc keeps growing too: **anything we decide
mid-sweep gets written down here or in `docs/`, because the sweep outlives any
one session.**

## 1. Goals

Sixteen games share a great deal. They should have little customized CSS. Instead
we exploded, and the shape of the explosion is measured:

| | files | lines | rules | decls |
|---|---:|---:|---:|---:|
| `*.module.css` | 149 | 13,064 | 1,218 | 4,269 |
| `theme.css` (common + 15 games) | 16 | 2,033 | 50 | 424 |

**9.3 : 1.** Two consequences follow, and they set the priorities:

- **Color is the smaller half.** Nine common surfaces — club, panels, chat, home,
  fields, definitions, auth, branding, tooltips — are 2,570 lines holding *zero*
  color tokens and zero hexes. They reference color and never declare it. The
  color discipline already works there.
- **Patterns are the bigger win.** The duplication is shapes that have no name:
  every dialog has the same fields / save / cancel / spacing and no class says
  so, so each is rebuilt locally. §7.

Root cause (css-philosophy.md): **unchecked CSS Modules**. Containing CSS per
game or per component was almost always wrong — this is an app where the games
*should* look alike and the conventions *should* be shared.

Symptoms: the same choice made in many places; things with the same meaning
styled differently for no reason (help text differs across the app; 20+ grays
where ~7 carry distinct meanings).

## 2. Baseline — measured 2026-08-20

`scripts/css-baseline.mjs` regenerates all of this; re-run after each surface.

| | today | target |
|---|---|---|
| distinct hexes in `src/` | 171 | ≤ 120 |
| …written exactly once | 156 | — |
| color-token definitions holding a VALUE | 260 | ~50 |
| …holding a REFERENCE | 182 | grows |
| distinct tokens | 375 | should fall |
| files holding a hex | 14 | 1 per theme + brand |
| rules / declarations | 1,268 / 4,693 | fall |

Below ~120 hexes means investigate, not celebrate: some current distinctions may
be real and unknown.

## 3. Themes

Four names, of which two are thought experiments. Framing a question as *"what
would cupcake do?"* is how we tell a theme decision from a standard one.

| | |
|---|---|
| `daylight` | the classic light theme — what ships today |
| `midnight` | classic dark |
| `cupcake` | imaginary: pink, cheery, light |
| `horror` | imaginary: dark, broody |

**A theme is one polarity.** No theme × polarity grid.

**Themes are almost entirely color.** Switching one shows the same pixels in the
same places, differing only in color — no spacing, border, margin or font-size
changes. The layout is precise and difficult to change; themes will not touch it.

**A theme declares its chain and loads it. `cupcake` explicitly includes
daylight.**

```
daylight  →  light-mode.css + daylight.css
cupcake   →  light-mode.css + daylight.css + cupcake.css   (~20 overrides)
midnight  →  dark-mode.css  + midnight.css
```

**The base must load because a theme asked for it, never as an unconditional
default.** Put daylight on a bare `:root` and any role midnight forgets resolves
silently to a light hex on a dark page — worse than an undefined token, because
it resolves to something plausible.

### Files

```
common/
  themes/
    light-mode.css   ONLY things true of light mode. May end up nearly empty —
    dark-mode.css    kept as a named home so we don't invent a filename
                     mid-work
    daylight.css     the role → hex grid, complete
    cupcake.css      overrides only
    midnight.css     complete
  fixed.css          colors exempt from theming: member + wordle
  base.css           element resets, body, box-sizing
  utilities.css      the adjustments that name nothing: muted, error
  patterns/          ONE NAMED PATTERN PER FILE — badge, button, heading, list
<game>/
  brand.css          --<game>-* tokens. Nothing else
```

## 4. Light mode is the default language

We only have light mode. Joel will probably always play light mode, and light
mode is how he pictures the app.

**Polarity-neutral language failed.** *"A hover moves away from the page"* is
confusing to read and write. In code, comments and conversation we speak from
light mode: a button's hover is **dim-down** (darker), even though dark mode does
the opposite. That makes writing dark mode harder — the author translates in
their head — and everywhere else easier.

## 5. Naming

```
a-b-c-d       --outcomes-lost-fill-color
```

| | | |
|---|---|---|
| a | the **bucket** | `outcomes`, `page`, `button`, `tile` |
| b | the **concept** | `lost`, `destructive` |
| c | the **thing changed** | `fill`, `edge`, `ink` |
| d | the **kind of value** | `color`, `width` |

**A name without a bucket is a smell.** Names prefer the same word the code uses.

- **Hyphens separate DIFFERENT QUESTIONS; camelCaps joins words that answer
  one.** `--button-quiet-primary-hover-color` is hyphenated because `primary`
  and `hover` are two questions — what am I doing (hovering) and on what (a
  primary button, toned quiet). `inFlight`, `gameOver`, `terminalFrame` and
  `centerTile` each join up because the two words are one quality. **Part-count
  is not a thing to optimize**: five parts is fine, and compressing to reach
  four is how the rule gets misapplied.
- **Numbers or names?** Numbers when the scale has a visual intuition, names
  when it doesn't. `h1/h2/h3` taught everyone that a low number is a big
  heading, so `--space-1` = "the biggest space" costs nothing; `--radius-sm/md/lg`
  beats `--radius-1/2/3` because nothing about a radius says which end 1 is. The
  test: can a reader guess the direction unprompted? Either way **the name says
  the whole thing** — `--font-size-2`, never `--font-2`. (docs/naming.md →
  Numbers or names?)
- **Only the ENDS are parsed.** A guard matches the bucket at the front and the
  variant + kind at the back; the middle is a label and needs no constraint.
- **`_localName`** for a value built up over calculations inside one file:
  `--_colWidth`. Narrow scope, no bucket needed.
- **A game's own tokens take the game's name as the bucket.** A `--<game>-`
  token referenced from outside `src/<game>/` is an error — one guard, one
  convention, and it makes co-location checkable. (No codename is another's
  followed by a hyphen; re-check if a game is added.)
- **A value belonging to ONE component carries that component's WHOLE name — and
  usually shouldn't be a token at all** (Joel, 2026-08-22). The example is
  `--shadow-notice`, and it is wrong twice over.

  First, ask whether it wants a name: §7's rule is that a value with one reader
  belongs inside its class as a number. Only something a class cannot hold — a
  themed color, a slot a game fills — earns a global token.

  If it does earn one, **a shortened component name invents a category**.
  "Notice" reads as a family of notices with this as one member; there is no
  such family, only `DeviceBlockNotice`, about a device being too small. A
  reader cannot recover the component from the token, which is the whole
  failure: *what's a "notice"?* And the name inverts the grammar above —
  `shadow-notice` is `<kind>-<thing>` where the order is bucket-first. Written
  correctly it is `--deviceBlockNotice-shadow`.

  The general form: **shortening a name to make it look general is how a
  one-off acquires the appearance of a system.** If there is genuinely a family,
  name the family and say what its members are; if there is one consumer, say
  its name in full.

## 6. Families, variants, and how a value gets picked

**A family has a purpose and a meaning.** `lost` is an outcome family; `destructive`
is a button family. Names are SEMANTIC, not colors: `lost`, not `red`. Naming by
color produced a layer of not-helpful names and brain-translation, and forced
invented families (`direred`, `rust`) to hold two meanings that share a hue.

**Variants are per-BUCKET.** Different categories have different variant lists —
outcomes need a `bar`, buttons need a `hover`. Within a bucket the grid is
**rectangular, always**: if outcomes have seven variants, every outcome has
exactly seven. Unused cells are computed together, reserved, and **never removed
by a sweep**.

Buttons and outcomes do not share variants. A button never needs `piecefill`; an
outcome never needs a button's fill. A status bar shows an outcome, so it is
`--outcomes-lost-bar-color`.

### `base` is a variant

Each family has one chosen anchor — the color the family was designed from.
Nothing paints it; everything derives from it.

**Why not derive from `fill`:** if fill is base-plus-a-tweak and ink is
fill-minus-10%, ink silently carries fill's tweak too. Siblings off a common base
keep each formula independent, and make the formulas comparable — *"ink is base
−10%"* reads the same everywhere, so orange's −20% is visibly the exception.

Base should be a **mid-tone**; deriving outward from the middle is steadier than
running a formula from one extreme to the other.

### Three ways a value gets picked

- **Joel-chosen** — the base.
- **claude-derived** — a formula run at authoring time, its output recorded as a
  hex so it can be eyeballed and tweaked.
- **CSS-derived** — handed to the browser, computed at runtime.

**The formula is recorded beside the value, always.** That is the rule the whole
system rests on: a cached hex without its formula is a stranded value, and
"change the base and let the rest follow" stops being true.

**Chosen and derived are listed TOGETHER, in the theme.** A theme saying "ink is
10% darker" is a theme making a decision; hiding it in a shared file to save
lines makes the theme lie about what it decided.

```css
/* cupcake.css */
--outcomes-lost-base-color: #aabbcc;
--outcomes-lost-ink-color:  oklch(from var(--outcomes-lost-base-color) calc(l - 0.10) c h);
```

> **Numbers in an example are illustrative.** "10% darker" above is a shape, not
> a spec. **Never change color methodology because an example used a number** —
> the methods below are measured, and an offhand figure in prose does not
> override one.

Most variants come out of formulas. Orange is not an exception to that — it is
the same formula with a different number, because at that hue 10% doesn't reach.

### What actually derives — measured 2026-08-20

Established by resolving each candidate in a real browser and comparing painted
pixels, not by reimplementing oklab. Verified identical under both an sRGB and a
display-p3 profile.

**Derives exactly:**

- **`edge` is the fill × 0.84 on the gamma-encoded sRGB bytes** —
  `color-mix(in srgb, <fill> 84%, black)`. All eight of today's consumers match.
  `theme.css` calls this "16% toward black", which is right about the amount and
  **wrong about the space**: done in oklab the same 16% gives won `#4f9452`
  against the real `#569d59`. The two spaces differ in step size, not character
  (sRGB −13% chroma, oklab −16%).
- **The four button tones reproduce all sixteen of their values from four
  anchors**: hover is the anchor at oklab lightness −0.05, the outline's ink at
  −0.115, the outline's hover at 8% over the card. This is the model working —
  a family picked at one sitting by one formula — and it is what everything else
  gets measured against.
- ~~**`dullframe` is `oklch(0.45, 0.105, <family hue>)`**~~ — **WRONG on two
  counts, corrected 2026-08-20 by resolving it in a browser.** Renamed
  `terminalFrame`, since a semantic name beats a descriptive one. The hue was
  the **ink's**, not base's — obvious in warning, whose ink sits 21.5° off its
  own base because Material's ramps rotate — and it does not reproduce exactly
  anyway: Chrome's oklch lands 1–4 bytes off each recorded value, because the
  originals came from a different oklab implementation. It now derives from
  BASE (Joel's call, small shift accepted), which moved four values: won, lost
  and near by 1–3 bytes, warning by 10. **Won is lifted to 0.564** at the same
  chroma, because at the family's lightness a green reads as black at normal
  zoom; neutral is achromatic.

**Does not derive, and needs a value per member:**

- **`ink`.** The step down from the fill runs **0.037** (near) to **0.305**
  (neutral) — 0.115 in red, 0.117 in orange, 0.195 in green. Two families happen
  to match the button step; three don't. This is the tier where the gold problem
  lives: gold can't go dark without ceasing to be gold, so near's ink stopped
  short.
- **`wash`.** Three of five reproduce as a mix with the card — won at 37% oklab,
  warning at 35% sRGB, neutral at 15% oklab, already three recipes. Lost and near
  reproduce as nothing: they're Material 100s, and Material's ramps rotate, so
  they sit **14° and 18° off their own family's hue**.
- **Member borders.** The comment claims they were seeded by formula (oklch
  lightness clamped to `min(0.85 × fillL, 0.55)`); that reproduces **one of the
  eight**. The rest were hand-tuned afterward, so there is no formula to invert
  and a dark set is eight fresh judgments.
- **The tile ramp.** Across all twelve values hue holds at 87–90° while lightness
  falls 0.976 → 0.662 and chroma **rises** 0.011 → 0.107 — one material getting
  thicker, not a tint plus a darkening. A single-anchor mix with white misses the
  deep end by 0.027 of lightness.

## 6.5 tuned / justified / locked

Every surface sits in one of three, named for the **license** each carries —
which is what you need in a sentence: *"the turn log is justified, and we're
making it pink for this game because …"*.

| | the surface | a difference there is |
|---|---|---|
| **tuned** | a game's board and its pieces | **expected.** Fitted to the game, wildly different between games, and standardizing it is not a goal |
| **justified** | game chrome — the info column, and the furniture AROUND the board | **allowed, and it owes a reason** in the file. Standard in general (the turn-log frame, the setup disclosures), with named exceptions where a game genuinely differs (psychicnum's status line can't read like spellingbee's) |
| **locked** | everything non-game — menus, dialogs, buttons, the homepage, the club page | **a bug**, until someone says otherwise. Not fatal, but it wastes lines and attention for nothing |

**Named, not numbered.** These were `consistency-1/2/3` for about an hour, and
Joel misread his own numbering in that time — nothing says whether `1` is "most
consistent, the winner" or "lowest, therefore least" (§5 → Numbers or names?).
`chrome` was considered for the middle and rejected: this codebase already uses
that word for the NON-game UI (§8), so it would have named the opposite thing.

**LOCKED IS ABOUT WHO DECIDES, NOT ABOUT THE RESULTING NUMBER.** A locked
component makes no per-instance re-decisions — but a *surface* may declare one
density and everything inside it follows. That is one decision applying to
everything in a scope, not a hundred small ones, and the component never knows.
So `<FilterSelect>` being locked is compatible with it rendering smaller in a
game's info column, because "things are tighter here" is said once by the info
column, not per instance by each caller.

The contrast is exactly today's `FilterSelect`: the club page overrides six of
the component's seven decisions for one instance (a caller disagreeing with a
component), where the scoped form is `.infoCol { --space-2: …; --font-size-2: … }`
(a surface stating its own density, once). Which also settles what to do at the
**`shared-game-chrome`** area — the component should state the ROOMY default and
the info column should tighten it, rather than the reverse, which is what leaves
the club page undoing six values.

Two things the split needs to be usable:

- **The boundary is the SURFACE, not the folder.** `components/game/` holds
  LOCKED things — `<ModePill>` lives there and all six render sites are club
  surfaces; `FilterSelect` lives there and its contested consumer is the club
  page — while `<PageHeader>` is locked and GamePage carries it. §14's roster
  files work by folder, which is how `<ModePill>` got filed under
  **`shared-game-chrome`** when it belongs to **`club-page`**.
- **The line runs INSIDE boardCol.** A board's contents are tuned; the furniture
  around them is justified — the board frame, the history ring, the game-over
  frame, `dimNotYourTurn`, the below-board feedback slot, the your-turn flash.
  "boardCol is per-game" would otherwise invite a game to restyle the frame.

**The shared vocabulary cuts across all three and is none of them.** The outcome
colors, the tile ramp, member colors, the feedback pill, the focus ring: 100%
standard everywhere *including* inside the most-tuned board. The three levels
answer "how much may this vary"; the vocabulary answers "what may never vary".

The area order already obeys this, which is some evidence the model is real
rather than invented: `homepage`, `floating-panels` and `club-page` are locked
surfaces, `shared-game-chrome` is justified's shared half, and the per-game areas
are tuned plus justified's per-game half.

## 6.6 The vocabularies

**Chosen 2026-08-21. The NAMES are agreed; the VALUES are provisional** — a
token's whole point is that re-tuning it later is editing one number, not
revisiting every site. Applied area by area, never swept (§13 → "How a value
gets converted").

**ALL EIGHT LANDED 2026-08-22**, in the homepage area (its F5). The seven
constants are in `base.css`, the text grays are in both themes, and every
declaration carries `/* @@ */` except `--page-text-strong-color`, which Joel
decided outright. Two mechanisms came with them and are the part to know:

- **`DECLARED_AHEAD` in `guards/cssTokens.test.ts`** lets a ramp be live before
  it is read. It fails from both sides — a name on it must still exist, and a
  name on it must still be unread — so the debt is countable and the dead-token
  guard stays live for everything else.
- **`guards/vocabularies.test.ts` now runs an entry per vocabulary**, and an
  entry takes a LIST of properties plus an optional `extract` regex for the
  ones the app writes as a shorthand (`border: 1px solid …`, `transition:
  opacity 120ms ease`). Its `pending` covers ~200 files: that is the sprint's
  own to-do list, and an area deletes from it as it converts.
- **`pending` is keyed BY VALUE**, `path → the literals still allowed there`.
  See §18's answered question below — the short version is that a partially
  converted file is the normal case, and a file-level list gives it no
  protection at all.

| # | vocabulary | steps | lives in |
|---|---|---|---|
| 1 | `--spacer-1 … -5` | `1.5 · 1 · 0.75 · 0.5 · 0.25rem` | `base.css` |
| 2 | `--font-size-1 … -3` | `1 · 0.85 · 0.75rem` | `base.css` |
| 3 | `--line-height-1 … -3` | `1.5 · 1.25 · 1` | `base.css` |
| 4 | the text grays, ×4 | `--page-text-color` · `-muted-color` · **`-label-color`** · **`-strong-color`** | **the theme** |
| 5 | `--opacity-1 … -2` | provisional; grows when the `0.4`s surface. **Numbers are a HOLDING POSITION** — opacity spans at least two KINDS (a disabled control, `OpponentStrip`'s separator), so it wants role names once the spectrum is visible. `css-philosophy.md` → "When a numbered scale is honest" |
| 6 | `--transition-duration-paint / -nudge / -travel` | `100 · 80 · 180ms` | `base.css` |
| 7 | `--letter-spacing-label / -wide` | `0.03em · 0.2em` | `base.css` |
| 8 | `--border-width-line / -line-thick / -frame` | `1 · 2 · 4px` | `base.css` |

Only #4 is themed. Everything else is a constant: a theme is color (§3), and a
distance is the same distance in daylight and midnight.

**`font-weight` is deliberately not a ninth** (Joel, 2026-08-22). Or, said the
other way, it is one and CSS already ships it: `100 … 900`. Those are the numbers
the property takes, so a token would only rename them. What the sprint gets from
it is a **rule — a font-weight must be a multiple of 100** — and one that isn't
is a bug fixed by the audit of the area that owns it, never swept. The repo
writes six values today (`600` ×54, `700` ×40, `500` ×14, `800` ×9, `400` ×3,
`650` ×2), so the rule costs exactly two fixes, both letterboxed's, both on §7's
carried-forward list. It is enforceable by the same guard the other vocabularies
use and needs no tokens at all.

### Notes on the ones that took an argument

**4 · the two text grays that did not exist.** `label` is the small uppercase
word that says what a GROUP of controls is. Every label in the app currently
borrows `muted`, and the two are not the same claim: muted means "this content
is de-emphasized", where a label is not content at all — it is structure, and it
has to stay readable at 0.8rem in caps. Which is why it is a hair DARKER than
muted rather than lighter (`#5a5a5a`), and why it is `@@` until Joel says
otherwise. `strong` is the other end: more ink than body text, `#000000`, Joel's
call and not marked undecided. Midnight answers both by translation — `strong`
is pure white there, because the role is "the most ink available against this
page", and that sentence survives the flip while "true black" does not.

**1 · spacer, not space.** "Space" is a key on the keyboard, and casually it also
means the room *inside* a button between its border and its label. "Spacer" says
what these are: the space BETWEEN things. `gap` and `margin` were rejected as
implementation-tied — the vocabulary feeds both.

`--spacer-1` is the BIGGEST, `h1`-style. It reads naturally that way even though
it is numerically backwards (§5 → Numbers or names?).

**The scale governs `gap` and `margin`. Padding is PARKED, not excluded** (Joel,
2026-08-22). The question is whether the room inside a box belongs on the same
ramp as the space between boxes, and there isn't enough evidence yet to answer
it: padding tends to run smaller (text inside a button), and today's tuples are
often fitted to their box — `.item-row`'s `padding: 0.5rem 0.9rem` is annotated
in `list.css` as exactly that. So paddings stay ad-hoc for now and the guard does
not look at them. Revisit later in the sprint; finding every padding in the repo
is one grep away, so nothing is lost by deciding late — and deciding early, with
two data points, is how a ramp gets a level nobody wanted.

**`0.4rem` is deliberately absent.** It and `0.5rem` are the two most-used
values in locked surfaces (14 and 18), which is exactly what
difference-without-distinction looks like. Every `0.4` becomes `--spacer-4`
(`0.5rem`) at its area's pass; if converting one loses something real, that is
when we learn it and add a member — see the a/b/c rule below.

**6 · three transition buckets, kept separate to be collapsed later.** They fell
out of reading all 52 uses:

| | job | today |
|---|---|---|
| `-paint` | a color settling instead of jumping — hover tints, a button's background | 80–120ms, pure drift |
| `-nudge` | a piece answering the pointer by MOVING — the tile lift, the shuffle glyph | 80–120ms |
| `-travel` | something arriving, leaving or growing — the mobile info sheet, a progress bar | 160–240ms, and these have a reason: a sheet that snaps in at 80ms reads as a glitch |

`nudge` rather than `move`, so it doesn't read as a near-synonym of `travel`:
the distinction is a small response versus a real journey. Joel's call to keep
`-paint` and `-nudge` apart until we know whether they are one thing.

**ANIMATIONS ARE NOT IN THIS.** `--mark-attention-flash-duration` and
`--mark-yourTurn-flash-duration` already exist; `verdict-shake 0.4s`,
`tileFlash 260ms`, `hexFlash 260ms`, `tile-flip 0.55s` and `cardIn 0.35s` are
game-surface and TUNED. Recorded so a sweep doesn't take them by accident; we
name them when they start recurring.

**8 · border width, and it has room to grow.** `line` is the 1px of a divider or
a field edge (48 uses); `line-thick` is 2px, the "this box is a thing" border
(the active-game callout, the info-panel box, the feedback pill); `frame` is
4px, "something is happening to what's inside" (the history ring, the game-over
frame, the toast stripe).

**NOT `hairline`** — in print that means a genuinely hair-thin rule, 0.25pt or
so, and on screen it would imply 1px *plus* a gray to fake the thinness. We
don't do that; ours is an ordinary 1px line, so it is `line`.

Two scales, one pattern: `line` → `line-thick`, `frame` → `frame-thick`. Three
of the four are in use today; only **`frame-thick` is hypothetical**, and it
self-explains the day it is needed — a heavier frame if your-move should read
lighter than you-lost — with nothing to rename.

Two `3px` survive (the rank bar, the verdict outline). Not pre-decided: they get
surfaced at their pass under the rule below.

### Backgrounds — the default and the page (Joel, 2026-08-22)

Two names, and everything else is an exception that gets addressed when we reach
it.

- **`--page-bg-color` is the PAGE's background** — very light gray, `#fafafa`
  today, unchanged. It is `<body>` and nothing else.
- **`--default-bg-color` is white**, `#ffffff` today, unchanged, and it is what a
  background is unless something says otherwise. Cards, list frames, panels,
  every dialog, popovers, toasts, segments, the info sheet, the pause overlay,
  the feedback pill, inputs.

Stated theme-neutrally so the rule survives midnight: **the default background is
a step lighter than the page.** Daylight `#fafafa` → `#ffffff`; midnight
`#262e3f` → `#2f394c`. Which is why neither name can carry a color.

The exceptions are known and are NOT being named now — the hover gray, the
open/active gray, a dialog titlebar, scrims, board dims, the two inverted
near-blacks (the tooltip and the chat unread chip). Joel: *"I suspect we're
likely to improve the names and hexes for the exceptions when we hit them, but
that's not now."*

### The a/b/c rule — what happens when a value doesn't fit

**A value outside the vocabulary is surfaced and explicitly decided.** One of:

- **(a) add it to the vocabulary** — it is a level nobody had named;
- **(b) fit it to an existing level** — the usual answer;
- **(c) keep it bespoke** — rare, and it owes a reason written in the file.

**Never silently kept because it is already there.** The test is Joel's: *"there
is no such thing as 6 bespoke values."* Recurrence means a level nobody named,
not six exceptions. This governs every vocabulary here, and it is the half §13's
silent-vs-ask rule was missing — that one says when to ask, this one says what
the answer may be.

## 7. Patterns — the bigger win

The pattern list gets written by reading rendered surfaces, **never by grepping
class names**: local names hide shared patterns, so searching by local name
reproduces the bug.

- **Names for things, utilities for adjustments.** *Can you say what the thing is
  without mentioning how it looks?* "The explanatory line under a field" — name
  it. "This should be quieter than its neighbor" — that's an adjustment, and a
  utility is honest. Naming an adjustment manufactures a fake concept.
- **Promote on the SECOND write.** Not the first (no evidence yet), not the third
  (you won't be there). **Copy-pasting a rule out of another module IS the
  signal** — you've found the pattern and chosen to record it as duplication.
- **No silent default.** Both variants get said; neither is what you get by
  staying quiet. `.button` used to mean "primary" by silence, which is one name
  doing two jobs.
- **Compose on *is-a*, never on *looks-like*.** `.dangerButton composes button` —
  a danger button IS a button. `.helpText` does NOT compose `.muted`: help text
  isn't a kind of muted, it's a thing that happens to be quiet today. Two classes
  reading one token is two consumers of one decision, not duplication.
- **Size and spacing are a SOFT goal.** Neither is themed. The consistency people
  want is a CLASS guarantee ("every dialog's labels match") delivered by there
  being one `Field` pattern, not by a ramp. A text-size ramp exists for
  legibility, not enforcement — five steps, body marked; it absorbs 134 of the
  app's 197 `font-size` declarations, which today spread over twelve values in a
  0.35rem band. Board geometry is excluded outright. **Spacing lives in the
  class, not in tokens** — much of it is a tuple tuned to a box.

> **Tokens are for values with MANY READERS where position is meaningful. A value
> with one reader belongs inside its class as a number.**

### Where a pattern lives

| kind | where | test |
|---|---|---|
| utility — an adjustment with no "what" | global | naming it would manufacture a concept |
| pattern with structure or behavior | a React component + its module | a form, a dialog |
| pattern that is only a look | a shared module, imported | help text, a compact field |
| one component's internals | that component's module | `GuessKeyboard`'s `.key` |
| game-specific | that game's module | spellingbee's center hex |

Two boundary rules, because both edges leak:

- **A common component's module holds its own internals, never a
  re-implementation of a pattern.** Otherwise every duplication moves house under
  a new banner — everything is inside *some* component.
- **A shared stylesheet with many consumers and no component is a component
  waiting to be written.** `setupForm.module.css` is imported by 17 files, each
  re-typing the structure around it.

### Classes or tokens?

1. **Does shared CSS need the value injected by someone who doesn't know the
   meaning? → it must stay a token slot.** The shared `.tile` reads only
   `--tile-bg-color` so a game restyles by re-setting a token instead of
   out-cascading. Member colors are the same case: `<Dot>` builds
   `var(--member-${name}-color)` at runtime, so the token name IS the mapping.
2. **Does the meaning paint several properties together? → a class.** A button
   tone paints five values; a bundle is a class. This is why the four tone
   classes read families directly instead of via twenty pass-through tokens.
3. **Otherwise, whichever is fewer names.**

### The named patterns — step 5, read 2026-08-21

Read off rendered surfaces (homepage · dialogs · forms + fields · clubpage ·
menus · toasts · chat · shared game chrome), then counted. Counts are
declarations across all 172 CSS files under `src/`.

The top ten, in the order they should be built:

| # | pattern | what it is | read in | lives |
|---|---|---|---|---|
| 1 | **Field** | a label with its control, and the explanatory line under it | `SelectField.field/.label` · `WordEditDialog.field` · `EditProfileModal.field/.label` · `setupForm` | component + module |
| 2 | **Choice row** / **choice group** | a radio or checkbox with its label, inline; and a wrapping row of them | `setupForm.radio/.radioRow/.checkRow` · `SetupTimerSection.radio/.timerRow` (verbatim copy) · `EditClubModal.gameRow` · `WordEditDialog.check` | component + module |
| 3 | **Text input** | the typed-in field: fill, edge, radius, padding, the 16px touch floor that stops iOS zooming | `WordLookupDialog.input` · `AnagramDialog.input` (byte-identical) · `WordEditDialog.field input` · `SetupTimerSection.timerInput` | element rule + one class |
| 4 | **List** / **list row** | a stack of rows, divided, one hover, last divider suppressed | `HomePage.clubsList/.clubItem` · `ClubGameCard.row` · `AnagramDialog.list/.row` · `WordList` · crosswords' setup chooser — **not the menu**, see below | shared module |
| 5 | **Section** | a bordered group under a heading | `setupForm.fieldset` · `SetupSection.section/.summary` · `EditClubModal.games/.gamesLegend` · `infoPanel.box/.heading` | component + module |
| 6 | **Section header** | a heading with its action opposite | `HomePage.sectionHeader` · `infoPanel.headerRow` · `Menu.header/.headerTitle/.headerLine` | shared module |
| 7 | **Overlay surface** | a surface floating above the page — surface, edge, radius, shadow | `Menu.popover` + `.flyout` · `Toast.toast` · `FloatingPanel.shell` · `DefinitionPopover` | shared module |
| 8 | **Scroll region** | the box that scrolls inside a fixed parent: `flex: 1 1 auto` + `min-height: 0` + `overflow-y: auto` | 48 × `min-height: 0`, 22 × `overflow-y: auto` | utility |
| 9 | **Focus ring** | 13 sites, all `2px solid var(--chrome-cursor-color)`, at three offsets (−1px, −2px, +2px) | `Menu` ×2 · `SelectField` · 3 dialogs · `HomePage.kbCursor` · `ClubGameCard.kbCursor` | utility |
| 10 | **Disabled control** | 11 × `cursor: not-allowed`, opacity spread over 0.45 / 0.5 / 0.55 / 0.6 | `Menu.itemDisabled` · `SelectField` · `SetupTimerSection` · `AnagramDialog` · `WordEditDialog` | utility |

Below the line, real but smaller: the **action row** (`.modalActions`, plus a
second pinned-to-bottom variant in `WordEditDialog.actions`), the **badge**
(`HomePage.soloBadge` · `ModePill.pill`), the **corner close button**
(`Toast.close` · `FloatingPanel.closeButton` · `ClubGameCard.deleteButton`), the
**empty state** (`WordList.empty` · `TurnLog.turnLogEmpty`), and **transition
timing** (30 declarations at 80 / 100 / 120 / 160ms).

### What shipped, and the rule each leaves behind

Step 6's surfaces (homepage, clubpage) produced these. The **rule** column is
what still governs; how each was discovered is not kept.

| | where | the rule |
|---|---|---|
| `.badge` | `patterns/badge.css` | the SHAPE only — the border is `currentColor`, so a caller sets `color` alone. "Solo" on a club row and "Co-op" on a game row are one thing |
| `.button` (made element-agnostic) + `.button-small` | `patterns/button.css` | `.button` declares its own `display`, radius and `text-decoration`, so it works on a `<a>`. `-small` is a SIZE and composes with any tone |
| `--chrome-cursor-ring` + `.kb-cursor` | `patterns/focus-ring.css` | one ring; the OFFSET is not taste — `-2px` abutting, `-1px` with its own border, `+2px` with clear space. `.kb-cursor` is the class form for the case no pseudo-class can express (the LIST holds focus) |
| `.heading-with-controls` | `patterns/heading.css` | a heading plus the control that acts on what is BELOW it. Owns the row, never the type. The `gap` is a MINIMUM (only bites when full); `min-width: 0` decides who gives, without saying how |
| `.item-list` · `.item-row` · `.item-list-empty` | `patterns/list.css` | the hairline is the LIST's, not the row's — on the row it needs a `:last-child` rule that breaks the moment the row is wrapped. The ELEMENT FOLLOWS THE BEHAVIOR: `<a>` when the row navigates (middle-click is real), `<button>` otherwise |
| `.segmented` | `patterns/segmented.css` | joined, not a row of buttons — the shape says the options are exclusive. Segments are NOT `.button`s: a button's own border and radius dismantle a segmented control. The chosen one reads `aria-pressed`, which the markup already carries |
| `<PageHeader>` | `components/page-header/` | a COMPONENT — two slots are structure. Both slots always render. The height is a CONTRACT (`--page-header-height`), read by the component and by `--game-header-bottom` |
| `h1`–`h4` | `base.css` | four levels, and the LEVEL is the decision — a heading takes no class to be the right size. The sizes are for non-game pages; the info column steps down deliberately |
| the `:global()` guard | `guards/cssTokens.test.ts` | a module styles its own elements: a `:global()` subject needs a local ancestor, or it restyles every surface |
| the allowlist guard | `guards/vocabularies.test.ts` | the shrinking-list mechanism every vocabulary plugs into |

Three rulings that outlive the pattern they came from:

- **A pattern gets a FILE, named for the pattern** — the default, not a
  threshold. Too many files merge easily; one long file has to be read through.
  `utilities.css` keeps only the adjustments that name nothing.
- **The MENU is not a list.** It looks identical and is a different thing: a
  menu is a set of ACTIONS you pick from and it closes, a list is a set of
  PLACES that stay put. Compose on IS-A, never on LOOKS-LIKE — the step-5
  reading broke that rule on its first outing, and **the same question is owed
  to every other row-shaped thing** before it converts.
- **A game's corner flag is not an outcome bar.** Deliberately more prominent, a
  different thing; the two never merge.

### Not patterns, though they look like it

- **`.card` and `.actions` each name two different things.** Global `.card` is
  the page card; `ClubGameCard.card` is a row in a list. Global `.actions` is a
  COLUMN of buttons; `.modalActions` is an end-aligned ROW.
- **`.muted` and `.error` ship globally and are re-typed anyway** — 65
  declarations of the muted color, local `.error` rules in two dialogs. Shipping
  a pattern is not the same as adopting it.
- **Three token vocabularies paint a 1px line** and the theme means them
  differently — `--page-surface-border-color` `#e2e2e2` (37),
  `--field-edge-color` `#cfcfcf` (13), `--page-divider-color` `#8a8a8a` (10) —
  but usage crosses all three. Settle per surface.

### Carried forward — the checklist

Everything step 6 found and did not do. Each line is a task with an OWNING
AREA. (It used to say "step", with the numbers 8/9/10 that were retired when
those steps folded into 7 — the mapping is the one §6.5 uses: the old 8 was
locked surfaces, the old 9 was justified's shared half, the old 10 was tuned
plus justified's per-game half.)

| area | |
|---|---|
| `simple-page` | **The page shell.** *A page is an optional header above a centered, width-bounded body, and the body is either a card or a layout.* Verified on all six non-game pages: five are a 480px `.card`, ClubPage is a 1000px centered region that is NOT a card. A COMPONENT, like the header. GamePage is out of scope. **Moved off `club-page` 2026-08-24**: the evidence is the card-only pages, and ClubPage is the exception the shell has to accommodate rather than the case it is designed from |
| `club-page` | **The viewport-fit chain**, which the shell owns. `min-height: 0` appears 48× in 24 files doing TWO jobs: 17 sites are the chain (the **bound** — `max-height` on a centered card, `height` on a full-bleed page, only two sites; the **relay** — a flex column carrying it down; the **scroller**), and 31 are a flex/grid item allowed to shrink below its content, which is board geometry and stays. Eleven of the relays are steps 9–10 anyway. The relay still has no good name |
| `club-page` | **`.frame` → `.page`.** It is the page's outer stack, not anything header-specific; all three pages declare nearly the same rule and only the bound differs. The word is taken: `frame` means "a rectangle around a board" in four places. Rename when the bound is settled, so the element is touched once |
| `club-page` | **`<ModePill>` is a BADGE and should be renamed** — 27 references across `src/` and `e2e/`, plus `ui.md`'s "Mode pills" heading. Its module already reads the shared `.badge` and holds nothing but the two colors, so this is a name, not a conversion. **The rule it carries is general (Joel, 2026-08-22): "pill" means the FEEDBACK pill and nothing else** — the fully-round-ended lozenge is a badge, and the app has other loose uses (`ui.md`'s "chat unread pill", `base.css`'s "hint pills" in the `--radius-sm` comment). Fix each where its area comes up |
| `club-page` | **The `=` solo-handle convention is still tested in the FE** — `ClubPage.tsx:115` (`soloClub`) and `SetupGameModal.tsx:208` (`modeSuffix`). `common.clubs.is_solo` now carries it (a generated column, settled by the first `homepage` audit), and the homepage reads that instead. Joel, 2026-08-22: *"fine for now, but we should get '=' stuff out of FE when we get to them."* The two SQL sites (`common.sql`, the setgame migration) write `like '=%'` and can take the column too |
| `club-page` | **The two-line row** — `.content` / a name line / a muted meta line, now in THREE files: `StartGameRow`, `ClubGameRow` and the standalone `ClubGameCard`. The pattern should name the SLOTS; each component keeps its own name for what goes in one (`.gameTitle`, `.gametypeName`). The third copy is new and known: F38 split `ClubGameCard` and deliberately left the standalone callout's inner shape alone rather than pre-empt this area |
| `club-page` | ~~`ClubGameCard`'s `.wrapper` / `.card` names~~ — **done 2026-08-24 by F38.** `.wrapper` is gone (the SelectionList row is the row), `ClubGameRow` carries no `.card`, and the standalone callout's box is `.standalone`. Kept as a line only so the row's disappearance isn't read as an oversight |
| `club-page` | The club page's filters render TWICE, desktop and mobile, each hidden in the other mode. A markup decision before a CSS one |
| `club-page` | The two-column fold: `.columns` stacks at `--mobile` and `data-tab` hides one side. GamePage answers the same question with the InfoSheet |
| ~~`floating-panels`~~ | ~~**`FloatingPanel`'s titlebar wears the HOVER gray at rest.**~~ **DONE 2026-08-25** — `--floatingPanel-titlebar-color`, its own token in both themes, starting at the value it inherited so nothing repaints. The two can now diverge, which was the whole ask |
| ~~here~~ → `crosswords` | ~~**A dialog riding the popover tier.**~~ **MOVED 2026-08-24** to the `crosswords` row below, where the tier change can be seen by the area that owns the game. Kept as a line so its disappearance is not read as an oversight |
| `shared-game-chrome` | **The two drag ghosts disagree** — bananagrams 1000, scrabble 100, and `dragGhost.module.css` says the split is unintended. Both are `position: fixed`, so they are two tiers apart against everything else: scrabble's paints BELOW an open dialog, bananagrams's above. Nobody drags mid-dialog, which is why it has never shown. Neither takes a token until they agree |
| `the first game area` | `CelebrationBlockingModal`'s `.title` is an `<h2>` at `1.5rem` — h1's size, where h2 is `1.25rem`. May be earned; should be a decision |
| `the first game area` | `CelebrationBlockingModal`'s `.button:focus-visible` re-declares the shared ring. Nothing about that dialog should change a button's ring |
| ~~`floating-panels` + `shared-game-chrome`~~ | ~~**Nine `.body` classes want real names.**~~ **DONE 2026-08-25** (the first `floating-panels` audit). They were not one thing: a shell content region, two layout stacks, four paragraphs of PROSE, and one disclosure section that has nothing to do with panels. Split rather than renamed — `FloatingPanel` keeps `.body`, the rest took names for what they hold. Two strays folded in: `SetupGameModal.bodyReserve` and `.cluePanel` |
| `shared-game-chrome` | `FilterSelect`'s club-page override INVERTS: the component states the roomy default, the info column tightens it. Today the club page undoes six of its seven decisions one at a time |
| `shared-game-chrome` | **Click-to-define repeats a four-part activation bundle at 14 surfaces, and two of them have already reinvented the same helper** — `WordList.wordActivation` and wordle's `defineProps`, both returning `{ className, title: 'Click to define', data-word, onClick }`. Promote the PROPS, not the element: `definableProps(word, define)`. **NOT a component** — the definable thing is not always a word (wordle's is a five-square tile row, wordiply's a `<DimmedBaseWord>` with styled parts), and `useDefinePopover` holds its state per SURFACE, so a per-word component would need `define` passed to each one or a context. A helper constrains no markup and leaves wordle's documented departure standing (colored blocks can't take an underline, so its hover cue is a ring). **Two real drifts it would settle:** `data-word` is the e2e handle convention and wordle's and letterboxed's spreads omit it, so those words can't be selected the standard way; and all fourteen pass a native `title` where the app uses `data-tooltip` + `TooltipHost` — the same opt-out, fourteen times. Raised 2026-08-26 auditing `AnagramDialog`, which was the one surface missing `.definable` entirely and so had no hover cue at all |
| `shared-game-chrome` | `<TurnLog>`'s `headerAction` is optional in name only — all eleven call sites pass it, so the bare-`<h3>` arm is dead. Make it required |
| `codenamesduet` | **`CluePanel` needs a name that says what it is** (the first `floating-panels` audit, `cluepanel-clue-for-what`). Joel: *"'CluePanel' is a terrible name: CLUE FOR WHAT?"* — and the first answer was wrong, which is the part worth carrying: it is NOT the AI suggester. It is the below-board clue strip — the giver's form, the guesser's clue display, the Pass button — and it is **not a floating panel at all**, so neither `Panel` nor `Modal` belongs in whatever it becomes. The AI panel that shared its file is already split out as `CodenamesduetAISuggestCompanion`. Joel, 2026-08-25: *"change it back to CluePanel; we'll consider a better name when we work on it"* |
| **each surface, as its area comes up** | **A floating panel's MINIMUM SIZE is still eyeballed** (the first `floating-panels` audit, `viewport-margins-unchosen`, part C). Seven pairs remain, all on COMPANIONS — which is the one family where a floor is real, since they are the only floating panels you can drag shut. Five distinct widths (240 / 260 / 280 / 300 / 320) and five heights (140 / 180 / 200 / 220 / 240), none derived: `Chat` 260×240 · `ClubHelpCompanion` 280×180 · `GameHelpCompanion` per-game · `GameScratchpadCompanion` 240×200 · `CrosswordsNoteCompanion` 300×200 · `CrosswordsExplainCompanion` 320×220 · `CodenamesduetAISuggestCompanion` 240×140. **The rule to apply is written down** (§20 → the resize table): the number should come from what the BODY needs — "the titlebar, the composer and four messages" — not from what looked about right. Two strays also survive on floating panels nobody can resize, `BlockingModal` and `SetupGameModal`, each `minWidth: 320`; those are not floors at all and below ~336px they force the panel wider than the screen. Joel, 2026-08-25: *"ignore for now; as we get to these individually in areas, we can figure out"* |
| `crosswords` | **`CrosswordsNumberJumpBlockingModal` is a blocking modal that isn't built as one** (the first `floating-panels` audit, `numberjump-tier`). A hand-rolled `position: fixed` box with its own scrim, riding `--z-index-popover`, so a menu can open over it. `<BlockingModal>` now exists and is what it wants — the shell brings the backdrop, the focus trap, immovability and content-fit height. Punted here rather than converted in `floating-panels` (Joel, 2026-08-24) because the conversion MOVES ITS TIER, and a behavior change to a game's modal should be seen by the area that owns the game |
| `crosswords` | **The header's marks are not evenly separated, and the CSS says they are** (the first `homepage` audit, `unequal-mark-separation`). One `gap: 0.375rem` for the whole slot, then each mark adds its own padding INSIDE its box — the menu trigger `0.25rem`, the chat bubble `PageHeaderButton`'s `0.3rem` plus `.bubble`'s own, the status slot none — so every visible separation differs and none of them is the declared number. Owned here because this is the page where EVERY mark can be on the strip at once; home has one and the club page three. `--spacer` cannot claim `0.375rem` until this settles what the separation should be |
| `scrabble` | **The AI suggest-a-move box is the fifth SelectionList site and did not fit.** It is five frameless text lines pinned to `5 × 1.35rem`, whose own comment says a growable height would shift the setup disclosure and the Moves log below it — so the frame, the surface and the row padding would all arrive as a visible redesign, roughly doubling the box. Three options, written up in `docs/games/scrabble.md` → Deferred: leave it bespoke (as crosswords' clue lists are), give `<SelectionList>` a frameless compact form, or redesign the box and redo the height arithmetic. Closed out of the `homepage` area 2026-08-24 |
| `scrabble` | **`ScrabbleBlankPickerBlockingModal`'s overlay at `z-index: 50`** — a full-screen `position: fixed` modal parked BELOW the panel tier, so an open chat or menu paints over it. Long-recorded as the ladder's known anomaly; it wants a look, not a reflex bump |
| **an audit of its own** | **Four files export MORE THAN ONE component**, so "the filename is the component" — the rule that files and components share a name — is false in four places: `common/components/game/lists/TurnLog.tsx` (`TurnLog`, `TurnLogBar`, `TurnLogNumber`), `common/components/game/lists/ActorMention.tsx` (`ActorTag`, `ActorDot`), `common/components/game/PlayAreaMountLog.tsx` (`PlayAreaSlotLog`, `PlayAreaReadyLog`), and `setgame/components/Card.tsx` (`Card`, `CardDefs`). **This is not cosmetic — it is how a rename went wrong.** `CluePanel.tsx` held the below-board clue strip AND the AI suggestion panel; a table built by scanning files for `<FloatingPanel>` and labeling rows by basename attached the wrong name, F27 inherited it, and the rename sweep acted on it — putting `CodenamesduetAISuggestModal` on a component that is not AI, not a suggester and not a modal. Found 2026-08-25 while answering "aren't the filenames the same as the component names?"; that file is split, the other four are not. Three of them are `shared-game-chrome`'s, and `TurnLog`'s three look like a real family rather than an accident, which is why this wants an audit rather than a sweep |
| **each surface** | **Ten consumer modules style `<Dot>` as a bare `.dot`.** The qualified form already exists in half the app (`greetingDot`, `playerDot`, `rosterDot`, `actorDot`, `itemDot`, `bonusDot`) |
| **shuffle games** | `<ShuffleButton>` should never take focus at all — game stuff doesn't. Its `:focus { outline: none }` says a click leaves no ring, then `:focus-visible` puts one back for a keyboard that has ⌥Z. The fix is removing the tab stop, not restyling the ring |
| **the area that takes `base.css`** | **Six chrome shadow levels nobody chose.** They were preserved from what the component modules already held and given names, which is what made them look like a system. Measured 2026-08-22: five of the six have exactly ONE reader (`popover` alone has four: Menu ×2, FilterSelect, DefinitionPopover), so §7's own rule — a value with one reader belongs in its class as a number — disqualifies most of them; three share a geometry (`0 8px 24px`) and differ only in opacity (18 / 12 / 8%); and they are not a ladder — `toast` is the TOPMOST z-layer and blurs 16 where `dialog` blurs 48. The names also lead with the KIND where §5's grammar is bucket-first, and `notice` invents a category for a single component called `DeviceBlockNotice` (global, it would be `--deviceBlockNotice-shadow`). Decide the count and the names there |
| **strands** | **`HintBar.tsx` reads `styles.hint`** and the module defines `.hintReady` and no `.hint` — the Hint button's base class resolves to `undefined` and `cls()` drops it. Found by `cssClasses.test.ts`, whose `MEMBER_PENDING` holds it until then |
| **codenamesduet** | **`CodenamesduetAISuggestModal.module.css` `.clueLabel` is read by nothing.** Same guard, `DEAD_CLASS_PENDING` |
| **setgame** | **`PlayArea.module.css` `.breakdown` + `breakdownLabel` / `-List` / `-Count` are read by nothing** — the per-player breakdown they styled was replaced. Same guard |
| **stackdown** | **`WordEntry.module.css` `.good` / `.bad` are read by nothing** — the slots take their colors elsewhere now. Same guard |
| **club-page** | **`e2e/club-filters.e2e.ts` is RED too** — two specs, both looking for `[class*="_startList_"] [class*="_button_"]` and finding nothing. `.startList` is fine; **`_button_` is gone because the button sprint moved buttons onto the GLOBAL `.button`**, which carries no module hash for a spec to match. Rewrite it in the same sitting as `club-keyboard.e2e.ts` — three specs, two renames, one page. Found 2026-08-22 by the first full e2e run after the font switch, which is also how we know the font broke nothing: 214 passed, and none of the 7 failures was about type. **`cssClasses.test.ts` cannot catch this one** and says so in its own docstring: it substring-matches each needle separately, so `startList` resolves and *some* class somewhere contains "button". Seeing it would mean understanding that the two are NESTED and that `.button` is global — real work, not obviously worth it |
| **club-page** | **`e2e/club-keyboard.e2e.ts` is RED.** `[class*="_kbCursor_"] a` returns null now that the cursor row takes the global `.kb-cursor`, so the href assertion under it fails. The same rename that broke the homepage's spec (the first `homepage` audit); both were found four weeks late |
| **wordle** | **`e2e/wordle-keyboard.e2e.ts` is RED, and it is not the flake it was filed as.** Line 162 reads `--ink-on-dark-color`; the token is `--ink-onDark-color` (camel). The undefined `var()` leaves the probe at the inherited body color, so the spec's `white` is `rgb(26,26,26)` and every ink assertion compares a key's white ink against the page's text color. Verified pre-existing: it fails at HEAD in isolation. One character-case fix, but wordle is not the homepage's area — described, not fixed (2026-08-23). **Worth more than the fix: a phantom token inside an `e2e/` spec passes every guard we own**, because `cssTokens.test.ts` scans `src/`. That hole is the same shape as the one `cssClasses.test.ts` closed for module classes in e2e selectors |
| **letterboxed** | **Two `font-weight: 650`** — `components/Board.module.css:55` and `components/PlayArea.module.css:136`. A weight must be a multiple of 100 (§6.6), so both are bugs to fix at that area's audit, not values to keep. Found by the first `homepage` audit; they are the `pending` list of the font-weight guard until then |
| **crosswords** | its setup chooser is drifted on three values (`6px` not `--radius-md`, its own hover and rule colors) — unintended, per Joel |
| **account** | `ColorChoiceList.swatchActive` draws the cursor ring to mean "the color you CHOSE" — deliberately not converted, since tying a selected state to a keyboard decision marries them forever. Whether "selected" should look like "the cursor is here" is its own question |
| **when it has a consumer** | the two-line density variant of `.item-row` |
| `forms` | **Figure out small buttons.** `.button-small` has exactly TWO callers — the homepage's "+ New club" `<Link>` and `ClubGameDeleteButton` — while ten other controls make themselves small by hand. **Three of them write the class's own number**, `0.8rem`, and differ only in padding: `FilterSelect.closedSelect`, `DefinitionView.editLink`, `GameScratchpadCompanion.takeOver`. **Four more sizes exist that nothing names**: `0.9rem` three times (`clubFilters.modeOption`, crosswords' `Controls.btn`, scrabble's `suggestRow`), `0.95rem` (`Menu.item`), `1.05rem` (wordiply's `.revealWord` — BIGGER, not smaller), and `1.1rem` / `1.2rem` on the two hand-rolled dismiss ✕s (`GenericFeedbackPill`, `Toast`). None is on the font-size ramp, and the ramp's middle step (`--font-size-2`, 0.85rem) has NO callers among them while an unnamed 0.9rem has three. Also here: **the plus in "+ New club" is a typed `+` character, not a glyph** — the same failure mode as the titlebar `×` before it became `IconClose`, and the last glyph-shaped affordance in the app that isn't in the icon registry. Audited 2026-08-25 (buttons excluding boards and forms). Four of the ten are games' — crosswords, scrabble, wordiply, waffle — so this decides a rule, and each game applies it |
| `forms` | **Five setup forms set `font-family: monospace`** — spellingbee, wordwheel, boggle, letterboxed, wordiply — all on the field that previews letters or a board. One decision written five times by five hands, and none of them wrote down why. Do NOT change them piecemeal (Joel, 2026-08-22): decide once, here, whether a letters preview wants a mono face at all now that the app has a real one |
| `floating-panels` | **`GameScratchpadCompanion` is monospace** (`ui-monospace, 'SF Mono', …`). Plausibly right — it is a notepad — but it is the same unexamined choice as the setup forms, so it gets asked at the same time |
| `waffle` | **`SolutionReveal` sets monospace twice**, so the revealed grid's letters line up in a column. The alignment need is real; whether monospace is how to meet it is not obvious now that the app font's digits are tabular and its width dial can hold a column |
| `codenamesduet` | **`Board.module.css` sets `ui-monospace, Menlo, monospace`** on the board. The most consequential of the mono uses, because it is a play surface rather than a form |
| `the area that takes `/palette`` | `PalettePage` sets monospace for token values and formulas. The one mono use with an obvious reason — a hex is a code-shaped thing — recorded so the sweep does not treat it as an oversight |

## 8. The buckets

- **chrome** — the non-game UI. **boardCol** — the board and what sits above and
  below it. **infoCol** — meta information about the game.
- **pills** — the feedback mechanism, in the header (global feedback: what other
  players are doing) and below the board (local feedback: about *you*). Same look,
  same purpose.
- **outcomes** — `won` · `lost` · `near` · `warning` · `neutral` · `noted` ·
  `error`. A won game or a good move; a lost game or a bad move; close-to-right
  or a tie; a move that cannot be made ("not a word"); a non-result so boring it
  doesn't matter; a turn that COUNTS without being a verdict; a FAULT on this
  move — the request never arrived, which is broken rather than refused.
  `noted` and `error` were promoted out of the pill vocabulary on 2026-08-20,
  which made the pill vocabulary EXACTLY this vocabulary with nothing left over.
  Both are anchored at ink weight rather than at a 400, because each arrived
  with one shipping value and that value is ink-weight — visible on the palette
  page as a family whose base and fill are the same color. Shown as pill colors,
  turn-log bars, tile colors. Needs many variants: text, outlines, fills, bars.
  Outcome colors should be used **only** for outcomes. Outcomes can be
  button-like (you press a tile), so the bucket carries interactive variants too.
- **button** — things you can do, graded by consequence: `success` ·
  `destructive` · `caution` · `normal` · `quiet`. A confirming YES; a dangerous
  action (delete, reveal); an action to be warned about (hint, one move left); the
  expected action (new game, restart); an uncommon one (cancel, back to club).
  Any kind can be **primary** (filled, the probable/default action) or
  **secondary** (unfilled). `success` has no consumer today and is reserved.
  These colors are used less often for text as well — a destructive button may
  have destructive text under it — and that's fine.
- **text** — rarely colored in general; gray for hints and lesser text. Colored
  text is mostly an outcome shown outside a pill or button.
- **history** — going back to see an earlier board puts a thick frame around it.
  **your move** — a similar frame in a different color. **preview** — scrabble
  letting a player show a possible move; history that hasn't happened yet.
- **cursors** — two independent names. The chrome one (focus rings in lists and
  menus) is defined once in the theme and consistent. The board one is a shared
  default a game can override, which we already do. Probably both blue in
  daylight.
- **member colors** — 8 identities, each a color and a border color. Already
  chosen, will not change, and have **no relationship to any other color**: a
  green player is not the winning green. Borders are dark in light mode and light
  in dark mode.
- **teal & purple** — used for co-op and compete labels, but only loosely
  associated. Treat them as **fully built out and flexible for one-off cases**, so
  a rare need doesn't mint a new color.
- **tiles** — `tile-1` … `tile-5` plus edges and the other tile colors, supplied
  per theme. **No semantic meaning**, and fine to reuse for game-ish things (the
  scrabble rack uses a very dark tile). The numbers ARE the meaning: stackdown
  reads stack depth off them.
- **brand colors** — spellingbee's honey and the like. **NOT the same as any
  family.** Use a different yellow than outcomes-`near`; don't use `near` in
  spellingbee, don't use spellingbee's honey elsewhere.

## 9. Structural constraints

- **Eager vs lazy — the silent-failure landmine.** `common/theme.css` is imported
  once from `main.tsx`. Every *game's* theme ships in that game's lazy chunk,
  which is why `crosswords/SetupForm.tsx` needs its own import. An undefined
  custom property invalidates the whole declaration, silently. **Palette,
  polarity and theme are eager and global; only a game's brand anchors are lazy.**
- **⚠️ Fifteen contract slots nobody declares.** Common reads them, a game fills
  them, no file declares them: `--board-units-cap` `--board-units-h`
  `--board-units-w` `--cols` `--grid-gap` `--local-feedback-min-height`
  `--max-board-size` `--max-tile-width` `--rank-text` `--stats-col-gap`
  `--stats-max-width` `--swap-box-min-height` `--tile-font-factor`
  `--tile-font-max` `--tile-font-min`. A game that mounts the component and
  forgets one gets an undefined property and a dead declaration. The existing
  phantom-token guard passes them because each IS defined — in *some* game.

  **Measured 2026-08-21: nothing is broken today.** Nine are read with a
  fallback, so a missing value is harmless. Six are read bare, and every game
  mounting the reader sets all of them:

  | slot | read by | mounted by |
  |---|---|---|
  | `--cols` `--max-tile-width` `--grid-gap` | `.hugRectWidth`, `common/components/game/PlayArea.module.css:189` | codenamesduet · wordle · connections · psychicnum |
  | `--board-units-w/h/cap` `--max-board-size` | `foundWordsPlayArea.module.css:88-92` | spellingbee · wordwheel |
  | `--rank-text` | `RankBar.module.css:51,132` · `Stats.module.css:64` | spellingbee · wordwheel |

  psychicnum sets `--cols` inline on the parent (`Board.tsx:131`) rather than in
  a CSS file; it inherits, so it counts. **The guard lands at the
  `shared-game-chrome` area**, when this CSS is open anyway.
- **Not every token is a design decision.** Six kinds, and two aren't tokens in
  spirit: a **contract slot** is a blank a game fills in (`--tile-bg-color`,
  `--grid-gap`), and **local math** is arithmetic (`--cols`, `--side`). Neither
  is a color, so the game-prefix rule doesn't apply to them.
- **Device density — SETTLED 2026-08-21.** The mobile breakpoint changes real
  spacing, which is neither theme nor standard look. **A device override lives in
  the same file as the rule it overrides, directly under it.** When a pattern
  moves to a shared module its phone tweak moves with it; a pattern is never
  split across two files. No density stylesheet, no density tokens.
  `common/breakpoints.css` stays what it is — the `@custom-media` names, injected
  everywhere by PostCSS, so any file can write `@media (--phone)`.

  The existing case already obeys this: `--page-padding-x/y` are declared in
  `base.css` and overridden a few lines below in the same file. Measured
  2026-08-21: 52 `@media` blocks across 39 CSS files (20 `--mobile`, 9 `--phone`,
  6 `--touch`), and most are layout — the two-column collapse — not density.
- **Owed to tile-feedback:** the dim-up rule wants restating in light-mode
  language, and `--tile-disabled-color` cannot be one token — a delta frozen into
  an absolute is right for exactly one starting point, and the tile ramp has five.

## 10. Guards

| | |
|---|---|
| `no unnamed colors` | sharpens into a LOCATION rule: a hex appears only in a theme file or a game's `brand.css` |
| rectangular families | a test per bucket that every member carries every variant |
| contract slots | new, **at the `shared-game-chrome` area**: every game mounting a component defines the slots it reads. Must check per MOUNT POINT — repo-wide "is it defined anywhere" is what the phantom-token guard already does, and it passes all fifteen (§9) |
| `no dead tokens` | **the hazard.** Reserved cells look dead. `palette.ts` / `PalettePage.tsx` is written to BE the reader that keeps them alive — verify that mechanism before relying on it |
| `:global()` | **SHIPPED 2026-08-21.** A `:global()` subject with no local ancestor styles every surface; the module it sits in gives it no scope. Verified by planting all three cases |
| class defined ≠ referenced | both directions; neither a bare global string nor `styles.typo` fails loudly |

A repo-wide guard can't switch on until the last game converts, so the location
rule is enforced **per surface at that surface's pass**, mechanically via a
shrinking allowlist so a *new* violation anywhere still fails.

## 11. The swatch page is the instrument

`/palette` exists and needs rebuilding. It is the only place a family is visible
*as a family*, and the only protection against a value nobody looks at.

1. **Render each variant DOING ITS JOB**, not as a square. `ink` as text at real
   size, `bar` as a 7px bar in a list row, `fill` as a filled tile with a label,
   `wash` as a pill background with words. The orange lesson — ink at −10%
   doesn't *read* — is invisible on a color chip.

   **⚠️ BY RENDERING THE REAL COMPONENT, NEVER A HAND-DRAWN COPY.** Tried the
   other way on 2026-08-20 and reverted it the same day. The hand-drawn pill
   painted its text in the tone color (a real pill inherits black), drew one
   state (a real pill has two — `.outline` transient, bare tone permanent), and
   between those two errors made the family look like it needed a third color it
   has never had in any commit. **An invented example is worse than no example**:
   it doesn't merely fail to check the stylesheet, it manufactures evidence about
   it. So this waits until `<GenericFeedbackPill>`, `<ActionButton>`, `<Dot>`,
   `<TurnLogBar>` and the shared `.tile` can be mounted on the page — which may
   mean waiting until the components themselves have been through their passes.
2. **Print the formula under every cell.** Four inks at `base −10%` and orange at
   `−20%` makes the exception legible, and an unexplained fifth number stand out.
3. **Show `base`**, marked as never-shipped.
4. **A theme toggle**, once a second theme exists.

**It stays a hand-written list**, not generated from the theme. Hand-written is
what makes it a check — the page and the stylesheet disagreeing is the signal.
Generated would always agree and catch nothing.

Keep the existing mechanism: every token spelled out in full inside a `var()`, so
the scanner counts it as a reference and reserved cells stay alive.

## 12. The safety net

- **`scripts/css-token-snapshot.mjs`** resolves every shared token in a real
  browser and diffs before against after. It normalizes through a canvas, because
  `getComputedStyle` reports an `oklch()` operation as `oklch(…)` and a hex as
  `rgb(…)` — comparing serializations says "changed" when the pixel is identical.
  Verified by planting a moved hex, a renamed token and a new one.
- **⚠️ The screenshot gallery CANNOT be diffed.** Two consecutive
  `gmake gallery GAME=psychicnum` runs with zero code change produced **0 of 20**
  byte-identical tiles, differing by 1.2–6.4% of pixels: it plays real games with
  random personas and boards. It is the HUMAN pass — *"do these sixteen games
  look like one app?"* — and cannot be the machine check. (Making it deterministic
  is worth doing and must not block this.)
- **One commit per surface**, so a bad surface reverts alone.

## 13. The steps

| # | step | exit criterion |
|---|---|---|
| 1 | this doc | decisions settled; `css-system.md` folded in and deleted |
| 2 | ~~build the theme~~ **DONE 2026-08-20** | Five files, not three: `themes/light-mode.css`, `themes/daylight.css`, `fixed.css`, `base.css` (element resets + every non-color value, including depth), `utilities.css` (the global classes). `theme.css` is deleted. 98 renames across 386 sites in 72 files. Verified at 1280 and 390: 200 of 204 baseline tokens pixel-identical, the four movers being `terminalFrame` (§6) |
| 3 | rebuild `/palette` | **swatch half DONE 2026-08-20** — every family is a rectangle of squares with its formula printed under each cell. The in-situ half is DEFERRED, not skipped: it was built by hand, was wrong about the pill in three ways at once, and got reverted. It returns when the demos can render the REAL components (§11) |
| 4 | ~~the **midnight spike**~~ **DONE 2026-08-21** | The split holds; all 161 roles answered, one chain, nothing undefined. Kept behind `?theme=midnight`. Dark mode is NOT part of this sprint — everything learned is [dark-mode.md](dark-mode.md), and §19 keeps the one-line summary |
| 5 | ~~shallow whole-app pattern pass~~ **DONE 2026-08-21** | Ten patterns named, plus five below the line, in §7 → "The named patterns". Read off the rendered surfaces, then counted. Also settled: device density (§9), and three findings that are name collisions rather than patterns |
| 6 | ~~homepage~~ · ~~clubpage~~ **PARTLY DONE 2026-08-21, and deliberately stopped** | Both were converted with the pattern half of the toolkit — see "Why 6 stopped" below. Shipped off them: `.badge`, `.button-small` + an element-agnostic `.button`, `--chrome-cursor-ring` + `.kb-cursor`, `.heading-with-controls`, `.item-list`/`.item-row`/`.item-list-empty`, `.segmented`, `<PageHeader>`. `HomePage.module.css` 254 → 76 lines; `ClubPage.module.css` 270 → 216 |
| 6a | **the CONVERSION PROCESS + the allowlist guard** | Not a sweep. Write down the silent-vs-ask rule (below), and build the shrinking-allowlist guard mechanism ONCE so every vocabulary can use it. Radius needs no new values — `--radius-sm/md/lg` already exist |
| 6b | ~~**VOCABULARY — invention**~~ **NAMED 2026-08-21** | The eight vocabularies and their provisional values are §6.6, with the a/b/c rule that governs a value outside them. Names agreed, values provisional. **Not rolled out** — they land area by area (§13 → "How a value gets converted") |
| 6c | ~~**z-index, on its own**~~ **DONE 2026-08-21** | Eight tokens in `base.css`, low to high: `infoSheet` 40 · `panel` 500 · `popover` 1500 · `chatPanel` / `scratchpad` 10000 · `celebration` 10001 · `toast` / `tooltip` 12000, with four derivations (`calc(… ± 1)`) replacing the four off-by-one literals. **No painted pixel moved.** `<FloatingPanel zIndex>` is now a `string` taking `var(…)`, so the order has one home. The guard walks ALL of `src/` for this vocabulary — 0–10 is local layering, above is a tier — plus a second half that fails on a numeric `zIndex` in TypeScript. Three literals held back as decisions, filed in §7. `code-conventions.md` + `ui.md` updated in the same commit, per the rule below |
| 7 | **the areas** | All the remaining reading, run **area by area** — the process is §21. The plan keeps the ORDER (below); each area's audit and notes live in `plans/areas/<area>.md`. **Areas are named, never numbered** |
| 11 | assets | 17 game logos carry baked color; the wordmark and favicon carry near-whites that fail on a dark page. All of it at once, at the end — doing one per game argues about a tree sixteen times |
| 12 | fold + delete | durable rules into `docs/ui.md` and `docs/code-conventions.md`; the allowlist empties; **every `cs-` stamp comes out** (`cs-stamp.mjs unstamp`, then the script and its guard go); this doc goes |

**Steps 8, 9 and 10 were folded into 7** on 2026-08-22, and their numbers are
**retired rather than reused** — so a reference to "step 9" written before that
date reads as stale instead of silently pointing at something else.

### The areas, in order

Named, because "7e is the menu area" is not a thing anyone should have to hold
in their head. **The list grows**: every dependency that surfaces as `cs-found`
is a candidate area, and one gets scheduled when the audit it would produce is
too big to carry inside the area that found it (§21).

**Resequenced 2026-08-24** — `simple-page` is new, and `club-page` moves behind
it. Both changes come from the same discovery: the homepage cannot finish
without the areas below it, and **the page shell was filed under the wrong
area**.

**Resequenced again 2026-09-02** — **`deep` goes in at the top**, ahead of
`homepage`. Everything below it moves down one. Its own paragraph is under the
table.

| # | area | what it is |
|---|---|---|
| 1 | `deep` | **NEW 2026-09-02, and it runs FIRST.** The boot path and the data path — the files every page and every game sits on and none of them owns: `main.tsx`, `App.tsx`'s boot half, the router, the Supabase client and the envelope wrappers, the realtime plumbing, the fault sink. **The membership rule is "it names no game and no page"** (below). Read before `homepage` so the theoretically-simple page is not read on top of a layer nobody has understood. **Opened 2026-09-02 at 31 files** (`plans/areas/deep.md`) |
| 2 | `homepage` | **RE-AUDITED FROM SCRATCH** (§21 → the 2026-09-02 restart). It was audited once, 2026-08-22 → 08-26, and that file was deleted — the machinery underneath it moved too far. Everything that audit found and did not do survives in "Carried forward" above. The landing page after login: your clubs, and the button that opens `<CreateClubModal>` over them (`plans/areas/homepage.md`) |
| 3 | `floating-panels` | **RE-AUDITED FROM SCRATCH** (§21 → the 2026-09-02 restart); audited once 2026-08-24 → 08-26 and that file deleted. The machinery and shared look of every window-like thing that floats over the page — the shell, the blocking modal, the confirmation and the acknowledgment, the drag hook, the focus trap. **Not the instances**, and since 2026-08-24 **not the forms either**. Two red e2e specs are known to be waiting for it, `page-no-scroll` and `anagram-finder` (`plans/areas/floating-panels.md`) |
| 4 | `forms` | **RE-AUDITED FROM SCRATCH** (§21 → the 2026-09-02 restart); audited once 2026-08-25 → 08-26 and that file deleted. Split out of the area above 2026-08-24. The design language of forms: the shared field components, the setup scaffolding, and **the question the homepage could not answer — are a form's buttons really different from action buttons?** Seven hand-written Cancels say the taxonomy has a hole (F44). Split because a floating panel and a form share a container and nothing else; keeping them together meant one area holding two vocabularies |
| 5 | `simple-page` | **NEW.** The pages that are not home, club or game: `LoginScreen`, `ClaimHandleScreen`, `ErrorPage`, `Loading`. (`CreateClubPage` was on this roster; F36 took it on 2026-08-26 and it is a modal now.) **The roster's test is "does `App` render it directly?"**, which is better than "is it routable": it catches `ErrorPage` and `Loading`, both of which stand in for a page AND appear inside one (`ClubPage:719`, `:726`, `PlayAreaErrorBoundary:47`) — which is exactly what the shell decision has to cover |
| 6 | `club-page` | Absorbs the punted viewport-fit chain, the `.frame` rename, `<ModePill>` reading the shared `.badge`, and the leftovers listed in "Why 6 stopped" |
| 7 | `shared-game-chrome` | `common/components/game/` — 258 rules, and every game sits on it. Also: the **contract-slot guard**, checked per mount point (§9, §10) |
| 8 | per game, one area each | **Sixteen areas, and each has its file already** (`plans/areas/<game>.md`, keyed by CODENAME). Two passes back to back: the audit — React, SQL and CSS together — then the **tile-feedback** pass against [tile-feedback.md](tile-feedback.md), which is read per area rather than run as a sprint. `psychicnum` first, as the control: the deliberately minimal toy, so what it settles is about the shape of a game area rather than about the game |

#### `deep` — the rule, and what it is not (Joel, 2026-09-02)

Joel: *"there's a new area to add at the very top of the list: the deep stuff
that is used in most places (the router, App.tsx, the rpc/edge-fn/query
wrappers). I want to go through those files first to tidy and understand them
before we hit even the homepage."*

**The membership rule: it names no game and no page.** "Deep" on its own
describes all 83 files of `src/common/lib/`, `trie.ts` and `rankLadder.ts`
included; the rule is what keeps game logic that merely lives in `lib/` out. It
admits the boot path, the data path, the realtime plumbing and the fault sink,
and it excludes `games.ts` and the manifest, all of `lib/game/`, and every
per-page module.

**`App.tsx` splits, and the split is the rule applied to one file.** Its **boot
half is in** — mounting, the session gate, the shell it renders into. Its
**per-page and per-game routing rows are not**: they name pages and games, so
they belong to the areas that own them.

**The hooks are NOT here** (Joel, when the question was put): the common
non-game hooks get an area, but not this one. `useProfile`, `useTabRing`,
`useAppShortcuts` and `useRealtimeRefetch` are the same kind of thing as these
files, and taking them would double the area and mix two vocabularies.

**Why it goes first, and it is not mainly the dependency count.** Of the
homepage's 33 listed dependencies this area absorbs six, and the page will still
list around twenty-two after it — the bulk being shared components and
stylesheets that belong to `simple-page` and `shared-game-chrome`. The real
reason is that those twenty-two are components: you can look at one and see what
it does. **The deep layer is the part you cannot understand by looking**, which
makes "listed and left" cost the most there, and makes reading it once pay into
every area after.

**Its exit criterion is different, and that is deliberate.** Every other area
ends with Joel looking at a surface; this one renders nothing. It closes on
*read, understood, tidied* — `cs-blessed` here means he has read the file, not
seen it. Naming that up front is what stops it being the area that never ends.

**The page shell moves to `simple-page`.** It was filed under `club-page`, but
its own evidence is five card-only pages with ClubPage as the lone exception —
so it is a simple-page question that merely happened to be noticed on the club
page. Deciding it where its instances are leaves `club-page` only having to
explain why it is the exception, which is a far smaller question than deciding
the shell and the exception together.

`simple-page` also has its type already named and waiting: F37
(`card-only-page`) settled that a **CardOnlyPage** is "a page that renders no
header and whose pageMain happens to be a card", produced by an area with
nothing to apply it to.

**Out of the sprint entirely, and not on any roster:** `/palette` and `/font`.
They are instruments — one renders the color families (and keeps reserved
tokens alive for the guard), the other compares typefaces — and their audience
is Joel. There is no user to make them consistent for.

### How a value gets converted (Joel, 2026-08-21)

**Vocabularies are not swept in; they are applied area by area.** When an area
is being converted, for each raw value in it:

- **it equals a vocabulary value → change it silently.** No discussion; nobody
  chose `4px` over `--radius-sm`, they're the same number.
- **it doesn't → surface it, look at it together, then change it.** Almost every
  near-miss (`3px` against `--radius-sm`'s 4, `0.45` against a disabled 0.5) was
  picked at a different time by a different hand, not decided. Asking once, in
  context, is how we find the few that were.

This is why there is no up-front adoption pass: you cannot fit the near-misses
to a scale without looking at them, and looking at all of them at once is the
forest-for-trees failure §15 exists to prevent.

**TUNED surfaces are exempt** — a board's radii and dims are fitted to the game,
and that is the whole meaning of tuned.

**The guard is a SHRINKING ALLOWLIST**, the mechanism §10 already specifies, and
it is what makes this work without a warning nobody reads:

- a file **not yet converted** is on the list, and is silent;
- a converted file that regresses **fails**;
- a **new** file fails immediately, because it isn't on the list.

Build the mechanism once in 6a; each vocabulary then plugs into it as its values
are settled.

### 6c is the exception on docs, and it moves no values (Joel, 2026-08-21)

**The ladder doc gets updated as the ladder is built** — not held to step 12.
`docs/code-conventions.md` → "The z-index ladder" already documents this
thinking as eight tiers, so it is a specific place that is trying to record the
answer; leaving it stale while the tokens land is how the two disagree. This is
a named exception to "decisions go in the sprint doc"; it is not a license to
distribute the other seven vocabularies early. `docs/ui.md` restates two of the
numbers inline (toasts at 12000, `Menu` at ~1500) and is part of the same edit.

**No value moves in 6c.** The conversion rule above still governs, and for a
stacking order the bespoke arm is the common case:

- **two places share a value that is in the vocabulary → convert both.** Same
  number, now named.
- **a value is bespoke → leave the number exactly as it is** and record it as
  *talk about it when we reach that area*, against the step that owns the
  surface.

So 6c ships names and a guard, and changes what paints where **not at all**.
The three already known, all going on the carried-forward list rather than into
this step:

| record against | what |
|---|---|
| `shared-game-chrome` | The two drag ghosts disagree — bananagrams 1000, scrabble 100 — and `dragGhost.module.css` says the split is unintended. Two tiers apart, so naming them cannot paper over it |
| `scrabble` | `ScrabbleBlankPickerBlockingModal`'s full-screen overlay at `z-index: 50`, below the 500 panel tier. Already the known anomaly in the ladder doc; it wants a look, not a reflex bump |
| `club-page` | The ladder doc files the account `Menu` under in-board controls (10–100) and again under popovers (1500). It ships at 1500; the doc's first row is the stale one |

### Why 6 stopped, and what the reorder buys

The homepage and club page were being converted with an **incomplete toolkit**:
the patterns existed, the vocabularies didn't. So every conversion picked a
spacing value and justified it in a comment — `0.5rem` on the heading row,
`0.4rem 0.9rem` on the packed rows, `0.375rem` in the page header — and each
surface would have needed revisiting once `--space-N` existed.

Building the vocabulary first means **each area gets ONE pass with everything**,
instead of a pass per tool. That is the whole reason 6 stops half-done rather
than finishing; a future session asking "why was clubpage abandoned mid-way"
should read this paragraph.

Left for the `club-page` area: the two-line row (§7's named-patterns list),
`ClubGameCard`'s `.wrapper` / `.card` names — after the conversion the wrapper
IS the row and the card is its inner box, so both names describe the previous
arrangement — `FilterSelect`'s club-page override (which inverts at
`shared-game-chrome`: the component states the roomy default, the info column
tightens it), the filters rendered twice for desktop and mobile, and the
two-column fold.

**Step 2 and the per-game areas are structural passes, not color passes** — but a few values
shifting is fine and expected. What is not fine is a value shifting without
anyone noticing: every move is recorded (§16), decided, or marked (§15). Broad
color tinkering stays a separate later pass; the structure is what makes it
cheap.

## 14. Roster — measured 2026-08-20

**Rules and declarations are the columns that matter**; lines are shown because
they're what everyone looks at first, and comment density makes them the weakest
signal.

| step | surface | files | rules | decls | hexes |
|---|---|---:|---:|---:|---:|
| 6 | homepage | 1 | 19 | 86 | 0 |
| 7 | forms + fields | 7 | 41 | 127 | 0 |
| 7 | dialogs | 5+ | 47+ | 164+ | 0 |
| 8 | clubpage | 6 | 80 | 275 | 0 |
| 8 | panels + menus | 6 | 47 | 225 | 0 |
| 8 | chat | 3 | 14 | 73 | 0 |
| 8 | toasts · account · auth · branding · tooltips · text | 11 | 37 | 138 | 0 |
| 9 | **shared game chrome** | **29** | **258** | **895** | 0 |
| 9 | buttons | 3 | 14 | 57 | 0 |
| 3 | the palette page | 1 | 13 | 36 | 0 |
| 2 | `common/theme.css` + `breakpoints.css` | 2 | 33 | 283 | **99** |

| game | files | rules | decls | tokens | hexes | note |
|---|---:|---:|---:|---:|---:|---|
| psychicnum | 5 | 12 | 36 | 17 | 0 | **the control** — smallest board, already correct under tile-feedback |
| waffle | 5 | 25 | 88 | 24 | 0 | no theme file at all |
| wordle | 6 | 33 | 91 | 22 | 1 | the wordle-vocabulary rename lands here |
| connections | 4 | 28 | 94 | 26 | 4 | |
| boggle | 3 | 21 | 77 | 13 | 1 | |
| stackdown | 7 | 23 | 75 | 6 | 0 | tokens but **no hex** |
| spellingbee | 4 | 22 | 64 | 9 | 3 | owns the rank ladder's brand color |
| wordwheel | 4 | 26 | 73 | 11 | 5 | points at spellingbee's, as it once did |
| wordiply | 8 | 46 | 163 | 5 | 1 | |
| letterboxed | 4 | 40 | 138 | 13 | 1 | |
| bananagrams | 4 | 44 | 194 | 16 | 6 | `body.mg-dragging` → `patterns/` |
| codenamesduet | 8 | 50 | 153 | 34 | 9 | |
| strands | 5 | 48 | 138 | 15 | 9 | |
| scrabble | 8 | 65 | 266 | 29 | 12 | `body.scrabble-dragging` → `patterns/` |
| setgame | 6 | 50 | 174 | 35 | 14 | |
| crosswords | 9 | **114** | **454** | 25 | **20** | see below; goes late |

**psychicnum and stackdown already hold no hex**, so a game carrying zero color
values of its own is achievable rather than aspirational.

**The crosswords exemption.** It is the outlier on every axis and after its pass
it may still carry far more CSS than any other game. Two causes and only one is
fixable: it was imported from an implementation written outside this repo and
never grew up under these conventions (that part comes out), and it genuinely
needs a UI unlike any other game's — printed notation, a cursor dragging a
whole-word highlight, a keyboard-required layout. **scrabble is next closest**, a
premium-square board being a different object from a grid of tiles. Don't
optimize for crosswords and don't measure the sprint by it.

## 15. When a decision won't come — paint it hot pink

**Do not pause mid-step to noodle on one color.** If a value can't be snapped to
an obvious existing one — most likely when collapsing the grays — point it at the
marker and move on:

```css
--UNDECIDED-color: #ff00ff;
```

Better to see a screaming page and fix a dozen of them together, thoughtfully,
than to stall a structural pass on a single hue. The swatch page (§11) makes
them impossible to miss, and a guard fails the build if any token resolves to the
marker, so none can ship.

### There is no hot pink for a LENGTH

The marker works for color because a wrong hue is loud and harmless. There is no
equivalent for a border-width or a font-size: an absurd value breaks the layout,
and a plausible one is invisible. So the non-color vocabularies (§18) get the
other half of the same discipline — **snap to the nearest step, keep moving, and
write the objection down here.** Same rule as the colors: don't stall a
structural pass arguing one value.

**The quibble list.** Anything a surface's conversion made you want to argue
about, recorded when it comes up and settled together at the end, when there is
a whole app to look at rather than one screen.

| raised at | the quibble |
|---|---|
| *(empty — add as the sweep surfaces them)* | |

The failure this prevents: "don't quibble" quietly meaning "your objection
evaporated". An objection with nowhere to go is either argued about immediately
or lost, and both are worse than a line in a table.

## 16. Parked

Places where two meanings collide on one value today. Recorded, not fixed —
this is the color pass's agenda.

| parked | against | apart |
|---|---|---|
| a bare `.secondary`'s border + label `#535353` | neutral's ink `#616161` | 0.043 |
| …and its hover `#f3f3f3` | neutral's wash `#f5f5f5` | 0.008 |
| a suspended game's stripe `#fdd835` | the near bar `#ffb74d` | 0.059 |
| the attention flash `#ffd21a` | near's fill `#ffb74d` | same cell, different value |
| `--chrome-link-color` `#1976d2` | an outline button's `#0053ac` | two weights of blue-as-text |
| the destructive red `#b71c1c` | lost's ink `#c62828` | 0.037 — it should read differently |
| `--member-blue-*` `#1976d2` | the action blue | byte-identical; member colors must relate to nothing |
| near's fill `#ffb74d` | warning's fill `#ffa726` | 3.9° of hue — a split by name only |
| `noted`'s base `#1976d2` | `error`'s base `#b71c1c` | both anchored at INK weight, so each family's fill is as dark as its ink. Re-anchor at a 400 once the palette shows them beside their siblings |
| a pill's tint at 18% | `noted` + `error` at 8% | five families mix one way and two the other; it ships today and was preserved rather than normalized |
| an outcome's `wash` | a pill's `tint` | two answers to one question at two strengths — deciding which survives moves pixels |

Also: `--chrome-disabled-opacity` ships as an EFFECT rather than a per-family
color. **A game piece has no `disabled`** — measured across all sixteen games,
every unclickable piece shows a state instead, and setgame overrides the global
dim because dimming a card *"reads as a different card"*. Drop it from the
vocabulary; invent it if we ever need it.

## 17. Measuring success

- Far less CSS.
- Lots of colors, most predictably computed from a base — so most of theming is
  changing the base and letting the rest follow. **A color should have a meaning.**
- What's left in a game's module: **board geometry and brand color.** A dialog
  rule or a button rule still sitting in a game module means we missed one.
  (crosswords and scrabble are exempted by ruling.)

## 18. Open

- **The verdict mark's STATE is built per component, and it should not be**
  (2026-08-29, found while converting wordle's `submit_guess`). Two games wear
  the shake-and-ring mark, and each solved the same problem its own way:

  - **connections** holds one state, `verdict: { tiles, tone, nonce } | null`,
    written through a single `markVerdict()`, with the nonce in a `useRef`
    because it is read while setting and never rendered on its own.
  - **wordle** holds `rejectNonce` and `rejectTone` as two separate `useState`s,
    always written together and only read together. Narrowing the envelope's
    seven-value `outcome` down to the two colors `Board` renders happens at the
    call site, where it is total (`warning` → amber, everything else red) —
    correct, but it is narrowing done in the wrong place. The real fix is for
    `Board` to take an `Outcome` and map it, which is part of this item.

  **What is genuinely shared is the nonce discipline**, and it is the thing a
  third game would get wrong: a CSS animation replays only on a NEW element, so
  a counter has to ride in the row's `key`, and a boolean cannot distinguish
  "rejected again" from "still rejected". Both games worked that out
  independently.

  **What is not shared is the mark's LIFETIME**, which is why this isn't a hook
  yet: wordle clears on a 900ms timer, while connections has no timer at all —
  its comment calls the turn log "the verdict's clock", clearing when the log
  shrinks (a restart) or grows with someone else's row. One is wall-clock, the
  other is derived from game state, and a shared hook would have to force one or
  take it as a callback and own almost nothing.

  With a population of two and both working, the extraction point is the third
  game that wants a shake — by then we would know which lifetime is the common
  case. Until then this belongs in `docs/ui.md` beside the verdict-mark rules as
  a written paragraph rather than as code.

- **Better name for the `button` bucket?** Accepted for now: buttons are easy to
  visualize, and "control" is vague. It is used for text occasionally too.
- **What actually goes in `light-mode.css`** — possibly nothing. Kept as a named
  home so nobody invents a filename mid-work.
- **Device density** (§9) — SETTLED 2026-08-21, see §9.
- **The VOCABULARIES** — decided 2026-08-21, moved to §6.6. Values are
  provisional by declaration; the names are the part that was agreed.

- ~~**Should we LOAD a font?**~~ **ANSWERED 2026-08-22: yes, `Roboto Flex` —
  see §22**, which holds the comparison, the measurements and the subset rule.
  One thing from the original note is worth keeping, because §22 changes it:
  the argument that a `650` weight "only renders as 650 on a variable font and
  rounds to 700 everywhere else" **stops being true the day we load one**. The
  multiple-of-100 rule stands on its own — a closed vocabulary is the point —
  but that half of its justification is now false and should not be repeated.
- **Which cursor colors**, given the board cursor is amber today for a recorded
  reason: scrabble's premium squares are already red and blue.
- ~~**Whether the shrinking allowlist is the right guard mechanism.**~~
  **ANSWERED 2026-08-22, with evidence rather than opinion: keep it, and key it
  by VALUE instead of by file.**

  The mechanism is right — a warning nobody reads is worthless, and the
  property that earns its keep is that a NEW file fails immediately.

  The granularity was wrong, and the homepage proved it the day it landed.
  `HomePage.module.css` converted `.frame`'s gap to `--spacer-2` and stayed on
  the pending list, because F7's `0.45em` on the greeting disc was still open —
  so the conversion we had just made was **unprotected**: writing `1rem` back
  would have been silent. A partially converted file is the NORMAL case, not
  the exception, and "what survives is what a test asserts" is this document's
  own recorded failure mode.

  So a row is `path → the literals still allowed there`, holding the offending
  PARTS (`border: 1px solid var(--x)` lists `1px`) rather than whole
  declarations, so the row stays true when the color beside it changes. Two
  shrink arms: a listed value that is no longer written fails, and a row whose
  file no longer offends at all fails. Cost, measured on spacer: 60 files carry
  136 distinct literals — median 2 per file, max 8, 27 files with exactly one.
  The list roughly doubles in WIDTH, not in length, and stops being a list of
  filenames and starts being an inventory of what is left.
- **Should `:hover` be gated to pointer devices, app-wide?** DEFERRED (Joel,
  2026-08-24) — raised by the header's button work, not decided there.

  A touch device applies `:hover` when you tap and leaves it applied until you
  tap elsewhere, so on a phone a tapped row or button stays in its hover look
  indefinitely. The app has never used `@media (hover: hover)`: every hover in
  it fires on touch — list rows, menu items, the segmented control, every
  `.button`, the header's marks.

  The model that makes it a decision rather than a workaround: **hover is a
  state only a pointer can be in** — "I am over this and have not committed" —
  and a finger has no such state, it is either off or pressing. Which is why the
  answer pairs with the other half: gate `:hover` to `(hover: hover)`, and give
  touch its own feedback with `:active`, which the app currently has almost
  nowhere.

  The header's marks are where this first bites, because their background would
  carry both hover and press. If it is right there it is right everywhere, and
  the sweep is large — so the header may take it as a local rule first and the
  app follows later, or not at all. Not decided.

- **What `css-philosophy.md` becomes** when this ships. It is reasoning about
  decided design — neither work-in-flight nor current-state. Joel wants it kept.

- **Should there be an EM vocabulary, and is it one vocabulary or two?** Raised
  in the homepage area (F7, where a disc's gap to its username was em on
  purpose — it tracks the h1). The eight are rem or unitless; the one em
  vocabulary we already have is `letter-spacing`, and nobody thought that odd,
  because a ratio to the type is a perfectly good thing to name.

  Measured across `src/` while F7 was open, and the inventory FORKS:

  - **em spacing *between* things — two values.** `HomePage`'s `0.45em`
    (now gone, F7) and `button.css`'s `.icon-button { gap: 0.4em }`, the
    icon-to-label gutter. Two numbers that almost certainly want to be one.
  - **em *sizing to* the type — about ten, and growing.** `--dot-size` at
    `0.6` / `0.65` / `0.7em` across four files, `--filter-select-dot: 0.65em`,
    EntryBox's caret `height: 1.15em`, `StrikeMarks` at `1.05em`,
    `SetupNextPuzzleSection`'s `min-height: 1.4em`.

  The second family is the one with a real spread, and none of it is visible to
  a spacer guard — they are widths, heights and custom properties, not `gap` or
  `margin`. So the question is not only "do we want an em ramp" but "is *size
  relative to the type* its own vocabulary". Two data points is too few to
  decide on; this gets re-asked when a later area adds to either list.

- **A guard has to tell bespoke-BY-INTENT from bespoke-by-laziness** (Joel,
  2026-08-22). The vocabularies exist to answer two questions — *"are we going
  crazy-stupid with bespoke numbers?"* and *"before I make up a value, should I
  check whether it fits a vocabulary?"* — and neither one requires bespoke to be
  rare. Boards especially are almost always bespoke, and that is correct.

  Today `vocabularies.test.ts` knows two states: converted, and `pending`.
  `pending` means *nobody has looked yet*, which is exactly what a deliberate
  bespoke value is not — so a value someone decided has nowhere to live but a
  row that lies about it, and the guard's only other move is to push the value
  onto a ramp it does not belong on. That is the pressure to avoid: a guard
  should never make bespoke the expensive choice.

  What is missing is a third state, marked AT THE DECLARATION with its reason,
  which the guard reads and COUNTS rather than fails on. §7's a/b/c rule already
  says this in prose and `list.css:129` already writes the annotation by hand
  (`.item-row`'s padding, "tuned to the box, not taken from a ramp") — nothing
  reads it, so nothing can answer the first question. Due before the first
  gameboard area, since that is where the count either stays legible or stops
  meaning anything.

## 19. The midnight spike — moved out

Step 4 ran on 2026-08-20/21 and answered its question: the file split holds when
something other than daylight asks it to. Everything it found — what survived the
flip, the depth ceiling, the three answers to it, and what building a dark theme
would still cost — is now **[dark-mode.md](dark-mode.md)**, because it outgrew a
section and because dark mode is not part of this sprint.

What matters to THIS sprint, in one line each:

- **The split holds.** 161 roles, one chain, nothing undefined. Every family kept
  its shape; only values and directions changed.
- **⚠️ Depth is the exception**, and it is the decision step 5 inherits. A shadow
  can only darken what is under it, so on a dark page it is capped by the page's
  own lightness — tuning the alpha was never the fix. `base.css` is right for the
  geometry; the shadow's ink is not obviously right there.
- **Three bugs it found that were never about theming**, all fixed: the page
  background was never painted, stackdown's depth ramp named a token the rename
  had moved, and the judged letter ink could not be pinned to one side of the
  flip.

## 20. The z- layers — the blessed vocabulary

**BLESSED 2026-08-22**, over an evening with Joel. **Everything in this section
is agreed except what is listed under "Open" at the end** — that is the rule for
reading it, and the answer to "when did we decide this?" is "here, unless it is
under Open."

These are the words to use in conversation, in docs, in component names and in
CSS class names — not only for stacking. A `dialog`, a `companion` and a
`modal-normal` are now specific things, where before the conversation they were
loose talk.

**✅ BUILT 2026-08-25**, in the `floating-panels` area. The old `--z-index-*`
ladder is deleted — every reader moved, which is the condition Open item 3 set —
and `base.css` → "THE Z- LAYERS" plus `code-conventions.md` now describe this
vocabulary and only this one. Two rungs were added while building it that this
section did not anticipate: **`--z-help` (2300)** and **`--z-menu` (3200)**; both
are recorded below.

### Why "z-", and why not "z-index"

**`z-` is the concept; `z-index` is one CSS property that sometimes implements
it.** The question a z- name answers is "what does the user see on top of what",
which is not always a paint-order question. The clearest case: **the pause gate
is a z- with no z-index at all** — `PauseBoundary` UNMOUNTS the play surface
rather than covering it, which is better for several reasons and is not going
to change.

The prefix also separates a thing from its layer: `toast` is a component,
`z-toast` is the band toasts live in and that other toast-like things could join.

### The layers, bottom to top

**The numbers are PROPOSED, and deliberately not today's.** The shipped values
were never planned — they arrived one at a time — so they encode no
relationships. These do:

- **A thousand is a different world.** The play surface, the floating windows,
  the always-available system, an announcement, a stop — crossing one of those
  boundaries is a change of kind.
- **A hundred is a layer within a world.** Kin, ordered, genuinely distinct.
- **Ten would be a tweak of a layer**, not a new one. Nothing uses one yet;
  the step exists so that when something does, it says so.
- **`z-board` owns a RANGE**, 1000–1099, for pieces stacked on other pieces.
  Every layer could have one; only this one needs it today.
- **The jump from 5100 to 9000 is the point** — nothing lives above a fault
  except the thing that blocks nothing.

| layer | what it is for                                                                         | z | sharp examples |
|---|----------------------------------------------------------------------------------------|---|---|
| `z-page` | The page itself. Nothing here is ever deliberately drawn over anything else            | 0 | the club page's game list; any button in the header |
| `z-board` | The play surface and the pieces on it, including pieces stacked on other pieces        | 1000<br>(–1099) | a wordle tile; stackdown's tile depth |
| `z-board-question` | A box over one square of the board, showing or taking something for that square        | 1100 | crosswords' rebus entry; its read-only peek |
| `z-ghost` | A piece in transit, following the pointer between two places on its own board          | 1200 | dragging a scrabble rack tile; a bananagrams hand tile |
| `z-infocol` | The readouts and controls beside the board — a page of its own on a phone              | 1300 | the turn log; the found-word list |
| `z-companion` | Something you keep nearby while you play — open it, keep it open, move it where you want | 2000 | the scratchpad; crosswords' setter-note |
| `z-dialog` | A question that can wait. No dim, movable, reopens where you left it                   | 2100 | the anagram finder; edit-word |
| `z-modal-normal` | A question worth thinking or talking about. Dims to focus you; chat stays reachable | 2200 | setup; edit profile; the celebration |
| `z-pause-gate` | Everything below it is gone while the game is paused. **A render gate, not a z-index** | 3000 | a player drops off the call; the Pause button |
| `z-chat` | Always reachable, over every lower-than-chat dim — talking is what the app is for      | 3100 | the chat panel (opened from the header bubble, which is ordinary page content) |
| `z-toast` | An announcement you must see wherever you are and whatever you are doing               | 4000 | "Joel invited you to a game" |
| `z-modal-blocking` | The world stops. Answer it now; nothing underneath is live                             | 5000 | confirm end game; crosswords' jump-to-number |
| `z-modal-fault` | As blocking, but strictly above it — an error must be readable even mid-question       | 5100 | "can't reach the server" |
| `z-tooltip` | Always the very top. You asked for it by hovering, and it blocks nothing               | 9000 | a button's hover label |

**The ordering rule, which is the most useful sentence in the conversation:**
*shorter-lived or more important sits higher.* The code has no rule today, only
numbers people picked one at a time.

### The names, agreed 2026-08-21

Agreed in conversation; nothing in code carries them yet. **The `z-` prefix does
most of the disambiguation** — it says "layer" out loud, so a layer may safely
reuse a component's word (`z-toast` beside `toast`). Only two names needed
changing because they were wrong even with the prefix:

- **`z-companion`**, not `z-panel`. `FloatingPanel` is the shell for chat,
  dialogs, modals, confirmations and faults — six layers — so naming one layer
  after it would be a lie the prefix can't fix.

  **It was `z-workspace` until 2026-08-24, and the rename is Joel's**: *"'workspace'
  implies a kind of 'you can write here', but very few of these allow that.
  'companion' suggests something you keep nearby without the implication of
  editing."* The original word was picked off the scratchpad, which is the one
  member you type into; help, a setter's note and a clue explainer are all
  read-only, and chat is the only other one you write in. **Reading is the
  common case and the name should say so.**
- **`z-modal-normal` · `z-modal-blocking` · `z-modal-fault`** — Joel's call, over
  a proposal to drop the shared stem. The stem is load-bearing precisely BECAUSE
  the three are not adjacent: `z-modal-normal` sits below chat while the other
  two sit above it, with the pause gate, chat and toasts in between, so the name
  is the only thing that says they are kin. They share "look at me", a dim, and
  centering. Longer is usually better for a name, and nobody has to wonder
  whether blocking is more or less than modal.

**`z-infocol` is a layer on desktop too**, even though nothing overlaps there.
The info column is genuinely distinct from the board, its questions and its
pieces; that it happens to sit beside the board rather than over it is a fact
about the viewport, not about what kind of thing it is.

### The satellites — things that are NOT rungs

Four things attach to a layer rather than occupying one. This is what kept the
ladder short:

- **A scrim sits one below its owner.** A layer that dims carries its own; the
  scrim is a property, not a rung. (Already true in code: `FloatingPanel` paints
  its backdrop at `zIndex - 1`.)
- **A dropdown sits just above its host.** Our select-replacement
  (`FilterSelect`) has to beat whatever contains it — a page, an info column, or
  one day a modal. As a rung it would have to outrank `z-modal-blocking`, which
  is absurd for a filter. As a satellite it is one rule that works everywhere.
  **HOW it is written was decided 2026-08-22** (homepage F22.1) and is not built
  yet: a contract slot, `z-index: calc(var(--z-host, var(--z-page)) + 1)`, with
  a host that isn't the page setting `--z-host` on itself. Custom properties
  inherit, and our three "just above the host" satellites all render in place;
  the one that portals is the tooltip, which wants no host at all. It lands with
  the first satellite that converts — a token nothing reads is a token the
  dead-token guard should fail on.
- **Help sits just above whoever summoned it.** From the game page that is the
  page; from the setup modal's footer "?" it is that modal. Classing it as a
  rung fails both ways: `z-modal-blocking` would dim and inert the form you
  opened the rules FOR, and `z-modal-normal` ties with setup and dims it too.
  It USED to work by accident — Help passed no tier, so it tied with setup
  at the shipped `--z-index-panel` default and wins on DOM order.
- **A tooltip goes to the absolute top**, because it cannot know its host and
  never blocks anything. **Joel's argument for why that is safe:** you cannot
  hover what a modal has made inert, so a tooltip can never need to cover one —
  and a tooltip on a control INSIDE a modal then just works.

Menus and the definition popup are the same shape: anchored to what you clicked,
no scrim, dismissed by the next click anywhere. They can never contend with each
other (opening one dismisses the other), which is the argument for not splitting
them.

### The four question-shaped things

They differ in intent, not implementation — one component with a dim property is
fine, but in docs and in conversation they are four different things.

| | dims | centers | movable | resizable |
|---|---|---|---|---|
| `dialog` | no | no — **opens where you left it** | yes | by the test below |
| `modal-normal` | yes | yes | yes — to see the board while filling a form | by the test below |
| `modal-blocking` | yes | yes | **no** | no |
| `modal-fault` | yes | yes | **no** | no |

**Buttons.** A dialog is very likely to carry a **Save** / **OK** / **Start** —
it has an answer to give, and the button is how it ends. A companion is very
unlikely to: there is nothing to answer, so it closes by its X. Measured: the scratchpad,
the setter-note and the clue-explainer have no buttons at all; edit-word has
Save, setup has Start, confirmations have their confirm/cancel pair.

The sharper form of the test is **whether the button ENDS the thing**, because
word-lookup and the anagram finder each have a primary button (*Look up*,
*Find*) that acts INSIDE the dialog and leaves it open. That is what lets them
be the patient kind you keep beside a cryptic while still being dialogs. So a
button that only acts within a surface says nothing about its category.

**Immovability is the visible signal**, and a better teacher than a scrim
shade: if you can drag it, you can leave it for later; if you cannot, deal with
it now.

**Two scrim colors, ~35% and ~55%** — the light one for `modal-normal` (the
board stays readable), the dark one for `modal-blocking` and `modal-fault`.
Both tokens already exist (`--scrim-light-color`, `--scrim-color`) at 40% and
45%, a difference nobody can see, and they are currently assigned by how a thing
was BUILT rather than by what it means. **Whether the two colors earn their keep
at all is Open item 2** — immovability may already signal the category.

**What "dim" must mean: everything under it is inert.** For `modal-blocking` and
`modal-fault` that has to be literally true — nothing may outrank them. For
`modal-normal` it means "focus is here", and chat sitting above it is a
deliberate exception rather than a lie, because a `modal-normal` never claimed
the world stopped.

**Resizing — who knows the right size?** *Content knows* → auto-fit, never
resizable; a form is as tall as its fields (setup already does this with
`fitContent`). *The user knows* → resizable; how much scratchpad, how much chat
history, how many anagram results is a question only the person can answer.

**Two of the families answer it by RULE, and two answer it case by case** (Joel,
2026-08-25). This replaces the old claim here that "chat, the scratchpad and the
crossword notes are the only three resizable things in the app", which was
measured wrong — it is six, and it is the whole companion family:

| family | resizable | remembers x/y + size |
|---|---|---|
| `companion` | **always — a rule.** Every one of them genuinely benefits from being sized in both axes | **yes, both**, and in ONE localStorage entry: `useDraggablePanel` writes the whole rect under a single key. Where you put it and how big you made it are both your answers |
| `modal-blocking` · `modal-fault` | **never — a rule.** Locked, and always centered | **no.** Nothing to remember: it cannot move and it cannot be sized |
| `dialog` | **case by case.** All three of ours are `fitContent`, so there is nothing to resize — but that is a fact about these three, NOT a property of the family. A dialog that wanted resizing would be fine | x/y yes (it is what "opens where you left it" means); size only if it ever resizes |
| `modal-normal` | **case by case**, for the same reason: all of ours fit their content today, so resizing would be pointless. Not a hard rule | no — a modal is a fresh task each time and opens centered |

The distinction matters because it says which of these is a bug when it changes.
A resizable blocking modal is broken; a resizable dialog is just a dialog nobody
has needed to resize yet.

**The one floating panel that was on the wrong side of this is fixed**:
codenamesduet's AI clue suggestion was filed `modal-normal` — the only resizable
one, and the only floating panel in the app whose size was neither chosen nor
derived. It is a
COMPANION (2026-08-25): you need the board to judge the advice, so a scrim is
exactly wrong, and the giver drags it over the info column and sizes it to see
the board. Being short-lived does not make something a modal — Help is a
companion too, and what makes one is that the page beneath stays LIVE and you
place the thing yourself.

### Measured: where the code disagrees with the model

All verified 2026-08-21, and none of it was changed.

| finding | consequence |
|---|---|
| **A fault is at the ordinary panel tier (500); chat is at 10000** | **an open chat panel covers a fault.** Worst case: "can't reach the server" hidden behind the thing the message is about |
| **scrabble's center-letter picker is at 50** | below almost everything. It is also 41 hand-rolled lines — no focus trap, no Esc, and a scrim click CANCELS, the opposite of every other modal's see-and-acknowledge contract. Its tier is the smallest thing wrong with it |
| **Confirmations and number-jump sit below chat** | classed as blocking, but chat covers them today |
| **The celebration is above chat** | should come down. Open question, below |
| **Nothing creates a stacking context around a board** — `.boardCol` is `position: relative` with no z-index, and `isolation` appears nowhere in `src/` | the "board" layer is a convention, not a seal: tile numbers race the whole app. Harmless today only because every board's numbers are small. Joel's ruling: assume the invariant *nothing in a layer with a range ever enters another layer* holds, and treat how as an implementation detail |
| **Nothing raises anything within a tier** | two panels at one tier stack by DOM render order — fixed by component order, not by which you opened. So a strict order is in force today that nobody chose and nobody can see |
| **`draggable={false}` is passed by exactly two components** — confirmations and faults | the three-way dim/drag split above is ALREADY encoded in the affordances. Only the tier is wrong |
| ~~**`Chat`'s bottom-right launcher does not render at all**~~ **FIXED 2026-08-22** | Both call sites passed `hideClosedButton`, so the closed branch returned null and `.openButton` was dead CSS — carrying the z-index 6c had converted into a `calc(… - 1)`, a derivation given to a rule nothing renders. Removed: the branch, the always-true prop, and the module stylesheet (45 lines, all of it that button). The dead-token guard then caught `--shadow-floating`, which only that rule read, so it went too. Chat opens from the header `<ChatButton>` — ordinary page content, not a layer |

### The tokens

**`--z-<layer>`, not `--z-index-<layer>`** (Joel, 2026-08-22). The token IS the
layer name, and the layer name is the whole point of splitting `z-` from
`z-index`. Two things fall out:

- **A layer with no z-index can sit in the list** as a commented line without
  reading as a broken token. `z-pause-gate: 3000` commented in the ladder block
  is a layer that happens not to need the property; `--z-index-pause-gate` would
  have claimed a mechanism it deliberately doesn't use.
- **It matches the repo.** `--radius-md` feeds `border-radius`, `--shadow-panel`
  feeds `box-shadow` — tokens here are named for what they ARE, not for the
  property that consumes them. `--z-index-*` was the odd one out. It also fits
  §5 better: `z` is a bucket, where `z-index` is a property name in the bucket
  slot.

**Multi-word layers keep their hyphens** — `--z-modal-blocking`, not
`--z-modalBlocking`. §5's camelCase rule is for words that cannot be separated
(`inFlight`), and here `blocking` clarifies `modal` — two questions, not one
unsplittable idea. Worth folding that test into §5 when the sprint lands; it is
sharper than what §5 says today.

**A token exists exactly when something reads it.** `cssTokens.test.ts` fails on
a token defined but never referenced — that is what killed `--shadow-floating`
the moment the chat launcher went.

**Superseded 2026-08-22, when the ladder was built** (homepage F22): §6.6's
`DECLARED_AHEAD` list does this job properly, so every rung landed as a live
token and the unread ones are written down instead of commented out. Only
`z-pause-gate` is still a commented line, and now for its own reason rather than
to dodge a guard — it is a render gate, not a z-index, so there is no value for
a token to hold. `z-board` graduating to a reader would still be the signal that
boards became sealed.

### The families, settled 2026-08-22

| component | family | why |
|---|---|---|
| `CodenamesduetAISuggestModal` (codenamesduet) | `z-modal-normal` | it demands attention — "here's the answer you asked for". Dim is right |
| `CelebrationBlockingModal` | `z-modal-normal` | it looks like one, it already dims, and you can still chat |
| scrabble's center-letter picker | `z-modal-normal` | the board goes inert, which is the point; chat stays |
| `GameHelpCompanion` | **`z-help` (2300)** — superseded 2026-08-25 | keep-open, no Save, X-to-close. Its resting home is the companion layer; when something above that summons it, it sits just above its summoner |
| `Chat` | **companion**, living at `z-chat` | it matches the companion test on every axis — resizable, remembers its rect, no dim, no Save, X-to-close, meant to be kept open. Only its layer differs. **It does NOT take the family word** (Joel, 2026-08-24): *"the chat panel will not get a 'companion' name; it sits in a different layer and simply calling it something like `Chat` suffices."* The rule below — a component about one family takes that family's name — earns its exception here, because a name saying `companion` would point at a layer this one deliberately does not live on |

**⚠️ Chat must NOT be moved to `z-companion`** — being classed as a companion
will invite exactly that, which is half of why its name stays clear of the word.
The reason it sits at `z-chat` is the most-discussed rule in this
whole section: the conversation has to stay reachable over every dim below it,
and chat is the one companion that can OPEN ITSELF (a `!` message force-opens it
for every recipient), so a self-opening panel materializing under a setup modal
would be worse than not opening at all. That belongs in the component's
docstring, not only here.

**⚠️ The celebration must NOT be unified onto `FloatingPanel`.** It is the one
modal that isn't one — a hand-rolled fixed scrim with a card at
`max-width: min(90vw, 420px)` and no media query, so it stays a small card over
a dimmed board at every size, phone included. That is the look Joel wants. The
plausible tidy-up ("the modal family should share the shell") would hand it
`FloatingPanel`'s full-screen phone sheet and silently delete the decision.

### "modal" is a family, never a member

`z-modal-normal` · `z-modal-blocking` · `z-modal-fault`. **No silent default** —
§7's rule, written after `.button` meant "primary" by staying quiet.

The structural reason it matters here: the family word cannot also be a rung.
Two members sit at 5000 and 5100 while the third sits at 2200, so if the third
were called `z-modal`, one string would mean both "all three" and "the one at
2200" — and a CSS class named for the family would collide with a token named
for the member. With three explicit members, `.modal` is free to carry what the
three share, and `.modal-normal` styles only the non-blocking one.

`normal` because this repo already uses it for the unmarked member of a family
(`--button-normal-primary-color` is the tone a button has when it isn't caution,
destructive or quiet). Rejected: `-nonblocking` (defines by negation, and is a
two-character difference from `-blocking` at reading speed, in the one place a
misread is a real bug).

### One list of names, for both the things and the layers

The families and the layers share a name on purpose. A `companion` is a kind of
thing; `z-companion` is where that kind of thing lives — and inventing a second
vocabulary for the second axis would mean every future conversation has to say
which list it means, forever, to buy correctness in two components.

So: **a layer is where its family lives unless a component states otherwise.**
Two components state otherwise, both written down: `Chat` (permanent,
at `z-chat`) and `GameHelpCompanion` (permanent, at `z-help` — it was written here as
CONDITIONAL, "just above whoever summoned it", and that could not be delivered:
the setup modal renders Help as a SIBLING, so `--z-host` never reaches it).
That is the same move the satellites make — the scrim and the dropdown were
never given names either, just described relative to something that had one.

**An exception is safe when it is written where the tempted person is standing.**
That means the component's docstring, not only this document.

### The vocabulary is for code too, not just for layers

The conversation's real product is that `companion`, `dialog` and `modal` now
mean something tight. So they get used everywhere (Joel, 2026-08-22):

- **A React component entirely about one family takes that family's name.** A
  component shared ACROSS families keeps a generic one — `FloatingPanel` is the
  shell for chat, dialogs, all three modals, and faults, so naming it after any
  one of them would be the lie `z-companion` exists to avoid.
- **A CSS class names what it styles, not what it happens to be attached to.**
  `.floatingPanel` means "this changes every panel in the app"; `.dialog` means
  "this changes three components you can name". The class name states the blast
  radius.

### "Floating panel" is the umbrella; "panel" alone is banned

Settled 2026-08-24. The five families above — companion, dialog, and the three
modals — need a word for what they have in common, because they share one shell
and a pile of behavior with it. That word is **floating panel**, in full, always.

**What a floating panel is:** a window-like thing that floats over the page. Its
own rect, out of the document's flow; a header bar carrying a title and a ✕; its
own surface and shadow; dismissible. Everything `FloatingPanel` provides.

**The name and the component are the same words on purpose.** Normally that would
be the collision this section refuses for `modal` — a family word that is also a
member. It is safe here because the category is *defined as* the things built on
that shell, so the two have the same extension. `FloatingPanel` describes the
implementation, whose whole subject is the floating-ness, and that is why it
keeps its name (Joel, 2026-08-24).

**"Panel" on its own means nothing and is banned** — in prose, in docs, in
conversation, and in any component name. A module-scoped CSS class may still use
it, because a local `.panel` states its own blast radius.

**"Draggable panel"** is the prose name for the subset you can drag, which is
every floating panel except `modal-blocking` and `modal-fault`. `useDraggablePanel`
is the hook, and it is a good name for the same reason `FloatingPanel` is.

**The evidence, from the conversation that produced this rule:** Claude called
connections' `HintList` a "panel" while cataloguing the dialog-like things. It is
a readout sitting in the info column's flow — no rect of its own, no titlebar, no
✕, nothing to dismiss. **"Floating panel" would have blocked the mistake and
"panel" invited it**, which is the whole argument in one example. The same test
excludes tooltips (not window-like) and menus (not window-like, and they already
have a sharp name).

The precedent is `card`, which was exactly this kind of loose word until it was
given a specific meaning.

**The folders — decided and SHIPPED 2026-08-24.**

- **`components/panels/` → `components/floating-panels/`** — kebab, matching
  `loading-and-errs`, the repo's only other multi-word folder. It now holds only
  floating panels: the shell, `ConfirmationBlockingModal`, `GameScratchpadCompanion`, `modalActions`.
- **`Menu` → `components/menu/`**, top-level beside it, because it uses none of
  the shell's machinery and has no business under a floating-panel folder.
  **Singular on purpose** (Joel, 2026-08-24): *"that the gamepage / clubpage /
  homepage actually use different menus doesn't matter. From the high-level
  perspective: there's one menu, it contains different things."* So it is not the
  plural shape-folder that `buttons/` and `lists/` are — it is the one menu's home.
- **`components/chrome/` → `components/page-header/`**, taking everything about
  the strip. `chrome/` held only the three `PageHeader*` files, so it was already
  the header's folder and merely named for a category it was the sole member of.
  It gains `PageHeaderPlayersStrip` and `PageHeaderStatusSlot` (from `game/`) and
  **`ChatButton` + `ScratchpadButton`** — neither is a floating panel; each is a
  header mark that OPENS one, and filing them by their target is what put a
  button in `panels/`. If general chrome needs a home later, we re-create it then.

Implicated component names, on the rename roster (Open item 4), NOT decided here:
`infoPanel.module.css` (22) — the last one left, and `shared-game-chrome`'s.

Consumer docstrings that still say "panel" loosely get fixed as each area is
audited, not in a sweep.

**Measured: "Dialog" currently names four different families**, which is the
best argument for the above. `ConfirmationBlockingModal` and `FaultModal` are
`z-modal-blocking` and `z-modal-fault` — the two strictest things in the app,
and the only two components that pass `draggable={false}`. `SetupGameModal`,
`EditProfileModal` and `EditClubModal` are `z-modal-normal`. `CrosswordsNoteCompanion` and
`CrosswordsExplainCompanion` are **companions** — no dim, resizable, and they remember their
rect. Only `AnagramDialog`, `WordLookupDialog` and `WordEditDialog` are actually
dialogs.

**The renames get their own step**, not a ride-along with each area's pass: the
vocabulary is app-wide, and doing it per-area leaves one word meaning different
things in the repo for weeks. Settle the full roster first — a rename encodes a
classification, and arguing classification one rename at a time means having the
same argument sixteen times.

### Open

1. **The multiple-movable-things strategy**, for the companion layer and the
   dialog layer both: (a) a strict order, (b) opened order, (c) raise on
   interaction. Needed sooner than it looked — crosswords can plausibly have the
   note, the explainer and the anagram finder open at once. NB: (a) is in force
   TODAY by accident, via DOM render order, which is also the only reason
   Help-over-setup works.
2. **Do the two scrim colors earn their keep**, given that immovability already
   signals the category?
3. ~~**The reconciliation itself**~~ — **ANSWERED 2026-08-22 (homepage F22): the
   two ladders coexist and migrate a rung at a time.** It read as a big-bang
   problem — 6c's tokens don't map 1:1 onto this model, and every value changes
   — and it isn't one. `THE Z- LAYERS` in `base.css` is the target and grows a
   reader at a time; the `--z-index-*` block above it empties as each
   component's area is audited; the sprint ends when it is empty. Moving a
   component alone would rank it against neighbors that have not moved, which is
   how a menu ends up under a panel — so the order is the constraint, not the
   values.
4. ~~**The component roster**~~ — **SETTLED 2026-08-25.** Every family is
   declared in code (the `family` prop), and the names are agreed below. What is
   left is executing them, which is its own step for the reason this item always
   gave: doing it per-area leaves one word meaning different things in the repo
   for weeks.

   **Companions** — the family word is the suffix:

   | from | to |
   |---|---|
   | crosswords `NoteDialog` | `CrosswordsNoteCompanion` |
   | crosswords `ExplainDialog` | `CrosswordsExplainCompanion` |
   | `HelpPanel` | `GameHelpCompanion` |
   | `ClubHelp` | `ClubHelpCompanion` |
   | `FloatingChat` | **`Chat`** — the ONE companion without the family word, and it is a stated exception rather than an oversight: the name would point at `z-companion`, the one layer it deliberately does not live on |
   | `GameScratchpad` | `GameScratchpadCompanion` |

   **Dialogs** — all three already correct, and the only names in the app that
   were: `AnagramDialog`, `WordLookupDialog`, `WordEditDialog`.

   **modal-normal** — `normal` is UNMARKED, so the suffix is plain `Modal`:

   | from | to |
   |---|---|
   | `SetupGameDialog` | `SetupGameModal` |
   | `EditProfileDialog` | `EditProfileModal` |
   | `EditClubDialog` | `EditClubModal` |
   | codenamesduet `CluePanel` | `CodenamesduetAISuggestModal` — `cluepanel-clue-for-what`: the old name said neither its game nor its job. `Codenamesduet`, not `Codenames`, per docs/naming.md's no-mid-caps rule |

   **modal-blocking / modal-fault** — MARKED, so the member word rides along:

   | from | to |
   |---|---|
   | ~~`ConfirmDialog`~~ | ~~`ConfirmationBlockingModal`~~ ✅ shipped |
   | ~~`useConfirmDialog`~~ | ~~`useConfirmation`~~ ✅ shipped |
   | `CelebrationDialog` | `CelebrationBlockingModal` |
   | `SuspendConfirmDialog` | `SuspendConfirmationBlockingModal` |
   | `FaultDialog` | **`FaultModal`** — strictly the grammar wants `FaultFaultModal`, which is pointless (Joel). `Fault` names the member; nothing else can be read into it |
   | crosswords `NumberJumpDialog` | `CrosswordsNumberJumpBlockingModal` |
   | scrabble `BlankPicker` | `ScrabbleBlankPickerBlockingModal` — the name is settled even though the component has not moved onto the shell yet |

   **The machinery keeps its names** (§7 → "Floating panel is the umbrella"):
   `FloatingPanel`, `useDraggablePanel`, `BlockingModal`, `Menu`.

   **Not in scope:** `infoPanel.module.css` still carries "Panel" as a kind. A
   filename rather than a component, and `shared-game-chrome`'s.

## 21. The area process — stamps, areas, and what "broken" means

Blessed 2026-08-22. §13's step 7 is the whole rest of the sprint, and this is
how it runs. The sprint reads **every** file — CSS, React, tests, SQL, edge
functions, scripts — so the first requirement is knowing, for any file, whether
it has been read.

### The stamp

Every file in scope carries one comment on its first line, `cs-` for
"css-system" (the sprint outgrew the name; the name stays).

| stamp | means | who sets it |
|---|---|---|
| `cs-unmet` | not reached yet | the initial sweep |
| `cs-found` | reached through the import/render graph | whoever reads the file that pointed at it |
| `cs-met` | **on an open area's agreed roster** — an area is being done for it | Claude, when Joel agrees the roster |
| `cs-audited` | an audit for it exists in `plans/areas/<area>.md` | Claude |
| `cs-partial` | some findings resolved; it names which are outstanding and where | Claude |
| `cs-fixed` | every finding resolved | Claude |
| `cs-blessed` | **Joel read it himself** | **only Joel** |
| `cs-na` | in the tree, deliberately not read | either |

**A JUDGMENT STAMP NAMES THE AREA THAT MADE IT** (Joel, 2026-09-02) — as a
suffix, so the five from `met` down read `cs-met-deep`, `cs-audited-club-page`,
`cs-blessed-forms`. `cs-unmet` and `cs-na` stay bare: no area has reached the
first, and the second is a standing decision no area owns.

It answers a question only the file itself can answer — Joel: *"hey, when did I
approve this? should I revisit it now that we're elsewhere in the sprint?"* A
stamp is a claim, and a claim with no author cannot be re-examined.

**The suffix is NOT guarded, deliberately.** Joel: *"you don't need to guard
this; it's just useful for me."* The guard checks the STATE against the eight and
ignores the rest. Validating the area would need a list of areas, that list would
be a manifest, and a manifest rots on the renames this sprint does constantly —
while a stamp left reading `cs-blessed-dialogs-and-forms` after that area split
still answers the question right, because the old name IS the moment. The cost,
stated plainly: a typo'd area passes silently.

`splitStamp()` in `scripts/cs-stamp.mjs` does the splitting — no state word
contains a hyphen, so the first one is always the seam, which is why area names
may contain as many as they like. `list` and `set` take either form (`list met`
is every area's, `list met-deep` is one area's), and `tally` breaks each state
down by area.

**`cs-fixed` and `cs-blessed` are different claims.** "Claude found nothing" and
"Joel actually read it" are not the same statement, and the sprint's real exit
criterion is the second one.

**There is no ladder to walk.** The stamp is the latest true statement about a
file, not a position in a sequence. A file can go `unmet` → `audited` in one
sitting, and — the load-bearing half — **a dependency at `cs-found` stays there
until an area is scheduled for it. Being found is not a claim on attention.**

**But `cs-found` means one specific thing, and reading is not it** (Joel,
2026-08-22): *"'found' marks 'we came across this organically while exploring
that area' — this helps us make sure a page will be audited in an area.
Reading-needed-for-research isn't 'found'."* So a file the area DEPENDS ON gets
the stamp, because the stamp is how we guarantee something downstream of an
audited surface eventually gets an area of its own. A file opened as EVIDENCE —
compared against, measured, quoted — does not, however carefully it was read.
The homepage area investigating ClubPage's and GamePage's page structure moved
neither stamp.

**`cs-met` is the eighth stamp, added 2026-09-02** when opening `deep`
turned up a state with no word for it: **listed on an open area's roster, agreed
by Joel, and not yet read.** `cs-found` was the near miss and it is genuinely a
different claim —

- **`cs-found`** says *this deserves an area*. Nobody owes it anything; it can
  sit there for the rest of the sprint.
- **`cs-met`** says *this HAS an area, and the area is open*. Somebody is coming
  for it.

Collapsing the two would have cost the question the stamp exists to answer:
which of the files we have reached are actually claimed. **Neither means read** —
that is still `cs-audited` and above.

A file usually goes `unmet → met` in one move, because an area opening names its
own files directly; `found → met` happens when a dependency later gets an area
of its own. The ladder order in `STAMPS` puts `met` after `found` for that
reason, and it remains true that there is no ladder to walk.

**Why in the file** rather than one manifest: this sprint renames constantly, and
a manifest rots on every rename while a stamp travels with the file.

`scripts/cs-stamp.mjs` does the work (`stamp` · `unstamp` · `tally` · `list` ·
`set`) and owns the scope: **what git tracks**, in `src/` `e2e/` `supabase/`
`scripts/`, in a language with a first-line comment. 1351 files at the sweep.
Assets and puzzle data have nowhere to put a comment, so they stay the plan's
business — they are step 11. `src/guards/csStamps.test.ts` fails on a file with
no stamp (which is every NEW file) or a word outside the eight, and prints the
tally.

**Stamping a migration is safe**, checked before the sweep rather than assumed:
`supabase_migrations.schema_migrations` is keyed on `version` with no checksum
of the file, and `migration list` matched local to remote with a stamped
migration on disk. `stamp` and `unstamp` are exact inverses, proved by
round-tripping all 1351 files and diffing, which is what step 12 depends on.

### The 2026-09-02 restart — nothing is read, and an opened area is re-audited

**Every file in scope is `cs-unmet`**: 1491 of them, plus
`src/guards/csStamps.test.ts` at `cs-na`, which stays there because the guard
about stamps is not a surface. Nothing sits at `found`, `audited`, `partial`,
`fixed` or `blessed`.

**Why.** Sprints nested inside this one ran between its last area and its resume
— the error/envelope sprint above all — and they rebuilt machinery underneath
every surface already audited: the envelope shape, the fault modal, `FailureLine`,
the edge-function crash path. An audit of a surface whose foundation moved
afterwards describes an app that no longer exists, so carrying those stamps
forward would cost more than re-reading the files.

**The three finished audits were DELETED** (Joel, 2026-09-02) — `homepage.md`,
`floating-panels.md` and `forms.md`, replaced by shells. *"Let's delete them;
we'll regenerate them and don't need to worry about history. So much has changed
since we audited them."* An audit is a reading of code that has since moved
underneath it, and keeping one invites the worst outcome: treating it as current.

**Nothing pending was lost, and that was checked before deleting.** Every
forward-pointing item those files held — the punts to `crosswords`, `scrabble`,
`codenamesduet`, `letterboxed`, the red e2e specs, the deferred decisions — was
already written into §7 → "Carried forward" **in full**, not by reference. That
checklist is the durable half; the area files held the reading. What went with
them is the resolution record: how each finding was argued and closed.

**Their finding NUMBERS died with them.** Each area regenerates from
`F-<area>-1`, so an old number would come to name a different finding. Every
surviving citation therefore describes the finding and names the audit it came
from — "the first `homepage` audit, `unequal-mark-separation`" — rather than
pointing at a number that will be reused. The one exception is a finding that
was still live and belonged elsewhere: `router-query-params` moved into `deep`
and was renumbered there as `F-deep-12`.

**Every area now has a file before it opens** (Joel, 2026-09-02): *"so we have a
place to put todos/defers/notes … this way we're not creating them only when we
open them; we can put things in them now."* A shell carries the same headings as
a live one — roster, findings, notes/to-dos/deferrals, predicted test breaks —
and the notes section is the point. **A shell is not an open area.** §21's rule
still holds: an area opens by listing its files and stopping, and its roster is
agreed with Joel then.

### Areas

An area is a loose unit of reading — a page, a component family, a game.
`plans/areas/<area>.md` holds its audit (findings, each with its resolution), its
predicted test breaks, and its notes. **The plan holds the order** (§13); the area
file holds everything else.

**Every area has its file from the start, opened or not** — twenty-three of them,
seven for the app's surfaces and sixteen for the games, keyed by CODENAME. Joel,
2026-09-02: *"this way, we're not creating them only when we open them; we can put
things in them now."* A shell carries the live headings — roster, findings,
notes/to-dos/deferrals, predicted test breaks — so a note has somewhere to go the
moment it turns up, months before its area opens. **A shell is not an open area:**
the roster stays empty until Joel agrees it, and opening is still "list the files
and STOP".

**Where a note goes, and it is one of two places** (Joel, 2026-09-02):

- **the area file** — the audit, the findings, the notes, and *the record of what
  the sprint did here*. All of it, including work done during the sprint.
- **the standing register** — `docs/games/<game>.md` → Deferred for a game,
  `docs/deferred.md` otherwise — and only for something the area turns up that is
  **genuinely out of this sprint's scope**, added deliberately and by name.

The split is by *whose work it is*, not by whether it is finished: the register is
the app's list of owed work, the area file is the sprint's record of the area.

**A finding's ID names its AREA: `F-deep-1`, `F-club-page-7`** (Joel,
2026-09-02), sub-numbered `F-deep-6.1` when one finding grows a list of its own.
Use the full ID everywhere the finding is referred to — in the area file, in
conversation, in a commit message.

**Numbering restarts at 1 in every area.** It always did in practice; what was
missing was a way to say so in the ID. A bare `F2` was three different findings
in three files, so it only meant something with an area held in your head
alongside it — and an inherited finding was worse, because §21 forbids
renumbering it, which stranded `F48` in a file whose own run stops at 11. The
number looked arbitrary because the sequence it belonged to was invisible.
`F-homepage-48` puts it back in the namespace where 48 is a sensible count.

What the ID buys, beyond reading correctly:

- **it greps per area** — `grep -r F-deep` finds every mention across `plans/`
  and the commit log, where `\bF3\b` finds three unrelated findings;
- **it survives a split** — when `dialogs-and-forms` became two areas, three
  findings moved and kept numbers that then looked arbitrary in their new home.
  `F-floating-panels-8` explains itself wherever it lands;
- **no area ever has to dodge another's numbers.** `forms` started at F30 to
  clear the numbers it inherited; nothing needs that now.

**The slug stays, and does a different job.** The ID says where the finding
lives; the slug says what it is about. Their rules are different too, which is
why one cannot replace the other: a slug may be renamed when the subject genuinely
changes, and an ID never moves. In conversation, say both —
`F-deep-3 (palette-waits-for-the-session)`.

**The same goes for the plan's other two numberings, and they collide.** This doc
has sections 1–21 AND steps 1–12, so "5" is either §5 (Naming) or step 5 (the
shallow pattern pass). Write `§5` for a section, `step 5` for a step, and a
finding's full ID (`F-deep-5`) for a finding — **never a bare number for any of
them**. The finding form no longer collides with the other two at all, which is a
second thing the area half of the ID buys.

**Dependencies are listed, not audited.** Reading the homepage is the first time
the page header appears; auditing it there would hand Joel a list nobody can
hold in one sitting. So a dependency is stamped `cs-found`, listed by name in
the area file, and left. Whether it becomes its own area is Joel's call, and a
scheduled one usually lands directly after the area that found it.

A file audited inside one area can be fixed inside a later one: **the stamp
tracks the file, the plan tracks the area.**

### How an area opens, and how it closes

**Opening an area is one thing: LIST ITS FILES AND STOP** (Joel, 2026-08-22).
The whole output is the files thought to belong to the area — its OWN files,
`HomePage.tsx` and `HomePage.module.css`, not the things they depend on. **No
stamps, no audit, no reading ahead**, until Joel has agreed the list.

The reason is that what counts as "the homepage area" is Joel's to define, and
stamping first means the disagreement arrives *after* the audit exists — a list
of findings about files he would have excluded, which is exactly the drowning
this process is built to prevent. Dependencies are a separate question, answered
later by reading, not at the moment the area opens.

**An area is committed before the next one opens.** Several commits inside one
area is normal and expected; **no commit spans two areas.** The exception is the
one above: a sweep caused by this area's rename ships with this area.

**Claude does not decide that we are moving on.** Finishing a step is not
permission to start the next one — and that includes the sprint's own setup,
which is committed before any area opens.

### Findings are numbered AND slugged

**Every finding in an area file gets an ID and a slug**, written together as its
heading, with its status in front when it has one:

```
## F-club-page-26 · `three-wrappers` · Three `.frame` rules, and only one of the
differences is a decision
```

The **ID** is the address: an hour into an area, "26" is whatever list was last
on screen and `F-club-page-26` is only ever this finding, in this file or any
other. It never changes, and findings raised after the audit take the next free
number rather than a sub-number — a finding is not required to have come from the
audit. Sub-numbers (`F-club-page-6.1`) are for a finding that grows its own list.
The area half is what makes the number readable; see "Areas" above for why.

The **slug** is the hook (Joel, 2026-08-23). Two or three kebab words naming the
SUBJECT rather than the verdict, so it survives the finding being resolved
either way. It does not have to be self-explanatory enough to skip reading the
audit — it only has to be enough to remember which finding this is.

**Why both.** Claude was writing a fresh parenthetical every time a finding came
up in conversation — F26 was "the three frames", then "the three `.frame`
copies", then "the three wrappers" — which puts the ambiguity the number
removed straight back at the description layer. A slug is written once and
reused verbatim, which also makes it greppable.

**The rules:**

- **A new finding gets a slug when it is written.** No exceptions, or the file
  goes half-slugged, which is worse than neither.
- **In conversation, say the ID AND the slug** — `F-club-page-26 (three-wrappers)`.
  Repeating it every mention is fine and preferred: *"a little bit more to read
  is less disruptive for me than switching context to remember what F99 is."*
- **A slug may be renamed if the subject genuinely changes**, never silently.
  The whole value is that it does not move underneath you.

### Broken is expected, and it comes in three kinds

The app does not need to work until the sprint ends; only what has reached
`cs-fixed` should. Stopping mid-area to repair every consumer makes the diff
unreadable and is how both of us lose the thread. But "broken" covers three
different things and they get three different rules.

| kind | what it is | the rule |
|---|---|---|
| **compile break** | a rename, a newly-required prop; consumers don't build | **We MAY sweep every consumer in the same commit — and Joel decides that, not Claude.** Plenty of things break the build and plenty of them we simply leave. The case it fits is a rename, where the fix is find-and-replace and keeping `tsc -b` alive is worth it for the area we're standing in |
| **test break** | it builds; a spec asserts the old shape | **Predict it, write the spec names in the area file, leave it.** The diff against that prediction is what tells us we broke something we didn't expect |
| **behavior break** | it builds and passes; it looks or acts wrong somewhere we haven't reached | **Leave it.** Note it against the area that owns the surface |

The baseline the test-break rule measures against: **1953 tests in 199 files**,
green at the stamp sweep (1956 with the stamp guard).

**A sweep is invisible to the stamp model** (Joel, 2026-08-22). When we do
decide to fix the consumers of a rename, those files are edited and **their
stamps do not move** — a `cs-unmet` file stays `cs-unmet`, and it does not
become `cs-found` by having been touched.

The stamp answers *has this been read*, not *has this been edited*. A
find-and-replace over an import path involves no reading and produces no
knowledge, so a stamp that moved would be a lie — and an expensive one, because
we would reach that file later and its own first line would tell us we had
already been there.

It is also why such a commit doesn't break "no commit spans two areas": the
sweep is not a second area's work, it belongs to the area whose rename caused
it, and it ships with that area.

### Renaming is the point, not a risk

A lot of renaming happens here — it is what a whole-repo read is FOR, and
"that's a lot of work" is not an argument against one. The stamp is what makes
it safe: a rename that breaks something reaches a file we have not read yet,
and that file's stamp already says so.

## 22. The font — decided 2026-08-22

**We ship `Roboto Flex`.** §18 had "should we LOAD a font?" open and §13 pinned
it to what is now the `forms` area; it was answered early because the tile
problem below turned out to be a live bug rather than a preference.

**The point is NOT that the system font is bad.** Joel designs on macOS, so the
app has been tuned against SF Pro and looks right there. The point is that
`system-ui` means three different faces with three different sets of metrics —
SF Pro, Segoe UI Variable, Roboto — so today the app has never actually been
seen as designed by anyone on Windows or Android.

### Why this one, over the neutral faces we compared

Measured from Google's own CDN, Latin subset, so these are bytes a browser
really downloads:

| family | weight | italic | width | grade | optical |
|---|---|---|---|---|---|
| **Roboto Flex** | 100–1000 | **no** (slant only) | **25–151** | **−200…150** | 8–144 |
| Google Sans | 400–700 | yes | — | −50…200 | 17–18 |
| Inter | 100–900 | yes | — | — | 14–32 |
| Noto Sans | 100–900 | yes | 62.5–100 | — | — |
| Open Sans | 300–800 | yes | 75–100 | — | — |
| Roboto | 100–900 | yes | 75–100 | — | — |

**WIDTH IS THE ONE THAT DECIDED IT, and it fixes something broken.** psychicnum
and connections put a whole word on a tile whose width the board fixes, so the
only lever today is making the text SMALLER — which is worst exactly where it
hurts most, on a phone. A width dial takes the space out of the letters
instead, so the word stays at a readable size and gets narrower. That is a real
improvement to a shipped surface, not a preference, and no other candidate
combines it with grade.

**Grade is ink without width** — every glyph keeps its exact advance, so text
can darken or lighten with nothing on the page moving. It is the correct fix for
the one thing the midnight spike could not solve cleanly: light text on a dark
ground reads heavier than the same weight does dark-on-light. Compare with the
alternative, which is picking a lighter weight per theme and reflowing every
line.

**What it costs, per dial** (same file, subset differently):

| dials | KB |
|---|---|
| weight only | 33 |
| weight + grade | 55 |
| weight + width | 58 |
| weight + width + grade | 79 |
| + optical size | 235 |
| + slant | 288 |

Optical size is the expensive one — each dial multiplies against the others, so
the fourth costs far more than the third. **We ship all five anyway** (Joel,
2026-08-22): Netlify is fast, the players have good connections, and the file is
cached after the first visit. Dropping optical size is the lever to pull if that
ever stops being true, and it costs nothing but a re-subset.

### The subset, and the rule that goes with it

**Our subset is Latin plus `→ ← ≥ ≈ ≠`.** Those five are drawn in the original
1.7 MB font and were dropped by Google's Latin slice; `→` alone is used 28
times, so taking Google's slice unchanged would have put a fallback glyph in the
middle of our own sentences.

**Twelve symbols we use are not in the font at all**: `↔ ↗ ↵ ⇧ ⇒ ⌥ ⌫ ✓ ✕ ✗ ★ ⟲`.
Emoji are a separate matter and always were — the OS draws those and always
did, under `system-ui` too.

**THE RULE (Joel, 2026-08-22): a symbol outside the subset is surfaced and
decided by the area that wants it** — the a/b/c rule, applied to characters.
Deciding twelve of them now, out of context, is how a rule becomes six
exceptions. The two shapes it will take:

- **a standalone mark is a clean lucide swap** — `✕` as a close affordance, `★`
  on a scrabble premium square, `✓`/`✗` as a status mark. They are already
  icon-shaped and lucide does them better than a text character;
- **a glyph inside a sentence is not.** `⌥Z` in a keyboard hint is TEXT, with a
  letter beside it; an inline SVG there has to be sized and baseline-aligned by
  hand or it looks pasted in. That is a small design job per site.

The sharpest illustration of why the boundary matters: `↑` and `↓` are in
Google's slice and `←` and `→` are not, so an arrow-key hint would have rendered
two arrows in the app font and two in a fallback, side by side.

### Facts that change how we write CSS

- **Digits are TABULAR by default** — all ten advance 1156 units. Scores,
  timers and counts are width-stable with no CSS at all, which is the
  layout-stability rule getting a win for free. The font carries `pnum` to go
  the other way if prose ever wants it, and no `tnum`, because it does not need
  one.
- **Resting width stays 100% for now.** The face sets narrower than SF Pro;
  measured on `/font`, **110% is indistinguishable** from what Joel is used to.
  Not adopted yet — use it a while first, then tune, and re-check the areas
  already converted (Joel, 2026-08-22).
- **⚠️ ANYTHING THAT MEASURES TEXT TO FIT IT MUST WAIT FOR THE FONT.** A tile
  that measures before the file lands measures the FALLBACK, fits to it, and
  goes stale when the real font arrives. `document.fonts.ready` is the gate.
  This only shows on a cold cache, which is exactly the bug nobody can
  reproduce.
- **Optical sizing changes advance widths**, and that is fine: it is a function
  of the font-size, which any fitting code knows already.

### Where it comes from

**Self-hosted, from the app's own origin.** Not Google's CDN — that means two
extra servers, and the font's URL is not even known until their stylesheet
arrives, so it is a chain of round trips before a byte of font moves. The old
argument for their CDN (someone else's visit warmed the cache) died when
browsers partitioned caches per site. Not Supabase Storage either, which is the
same third-origin problem wearing our own logo.

Netlify serves it beside everything else, it is versioned with the code, and a
font change is reviewed like any other diff.

### Still open

1. ~~**Grade and slant verdicts**~~ — **BOTH KEPT** (Joel, 2026-08-22). Grade
   because the dark-page correction has no other clean form, and slant because
   nine places ask for italics and this family has no drawn one — the font's
   own oblique beats the browser's synthesized skew.
2. **The resting-width tune**, above.
3. **Fallback metrics** — deferred by Joel, 2026-08-22, understood as not
   urgent. The system face stands in until the file lands and takes different
   space, so the swap moves text. `size-adjust` and the `ascent-override`
   family on a fallback `@font-face` are what make the stand-in occupy the same
   box. Note it is only worth solving for whichever `font-display` we settle
   on: it is the fix for `swap`'s reflow, and largely moot under `optional`.
4. ~~**`font-display`**~~ — **SETTLED: `swap`** (Joel, 2026-08-22). A moment of
   system font on a cold load, then a switch. The two alternatives were weighed
   and lost: `optional` never swaps, but in an SPA a missed window means a
   whole SESSION in the fallback rather than a moment, because there is no
   second document load to pick the font up; `block` hides the text entirely
   for up to ~3s rather than showing the wrong face. With the preload in
   `index.html`, `swap`'s window is small.
5. **The monospace surfaces** — nine declarations across seven files, none of
   them a considered decision. Filed on §7's carried-forward against the areas
   that meet them first, deliberately NOT swept (Joel, 2026-08-22).
