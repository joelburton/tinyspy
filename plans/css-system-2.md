# CSS System 2

**The single spec for the CSS sprint.** It draws on the wisdom in
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
(a surface stating its own density, once). Which also settles what to do at
step 9 — the component should state the ROOMY default and the info column
should tighten it, rather than the reverse, which is what leaves the club page
undoing six values.

Two things the split needs to be usable:

- **The boundary is the SURFACE, not the folder.** `components/game/` holds
  LOCKED things — `<ModePill>` lives there and all six render sites are club
  surfaces; `FilterSelect` lives there and its contested consumer is the club
  page — while `<PageHeader>` is locked and GamePage carries it. §14's roster
  files work by folder, which is how `<ModePill>` got filed at step 9 when it
  belongs to step 8.
- **The line runs INSIDE boardCol.** A board's contents are tuned; the furniture
  around them is justified — the board frame, the history ring, the game-over
  frame, `dimNotYourTurn`, the below-board feedback slot, the your-turn flash.
  "boardCol is per-game" would otherwise invite a game to restyle the frame.

**The shared vocabulary cuts across all three and is none of them.** The outcome
colors, the tile ramp, member colors, the feedback pill, the focus ring: 100%
standard everywhere *including* inside the most-tuned board. The three levels
answer "how much may this vary"; the vocabulary answers "what may never vary".

The step order already obeys this, which is some evidence the model is real
rather than invented: steps 6–8 are locked surfaces, step 9 is justified's
shared half, step 10 is tuned plus justified's per-game half.

## 6.6 The vocabularies

**Chosen 2026-08-21. The NAMES are agreed; the VALUES are provisional** — a
token's whole point is that re-tuning it later is editing one number, not
revisiting every site. Applied area by area, never swept (§13 → "How a value
gets converted").

| # | vocabulary | steps | lives in |
|---|---|---|---|
| 1 | `--spacer-1 … -5` | `1.5 · 1 · 0.75 · 0.5 · 0.25rem` | `base.css` |
| 2 | `--font-size-1 … -3` | `1 · 0.85 · 0.75rem` | `base.css` |
| 3 | `--line-height-1 … -3` | `1.5 · 1.25 · 1` | `base.css` |
| 4 | the text grays, ×4 | the existing two, a label gray, true black | **the theme** |
| 5 | `--opacity-1 … -2` | provisional; grows when the `0.4`s surface. **Numbers are a HOLDING POSITION** — opacity spans at least two KINDS (a disabled control, `OpponentStrip`'s separator), so it wants role names once the spectrum is visible. `css-philosophy.md` → "When a numbered scale is honest" |
| 6 | `--transition-duration-paint / -nudge / -travel` | `100 · 80 · 180ms` | `base.css` |
| 7 | `--letter-spacing-label / -wide` | `0.03em · 0.2em` | `base.css` |
| 8 | `--border-width-line / -line-thick / -frame` | `1 · 2 · 4px` | `base.css` |

Only #4 is themed. Everything else is a constant: a theme is color (§3), and a
distance is the same distance in daylight and midnight.

### Notes on the ones that took an argument

**1 · spacer, not space.** "Space" is a key on the keyboard, and casually it also
means the room *inside* a button between its border and its label. "Spacer" says
what these are: the space BETWEEN things. `gap` and `margin` were rejected as
implementation-tied — the vocabulary feeds both.

`--spacer-1` is the BIGGEST, `h1`-style. It reads naturally that way even though
it is numerically backwards (§5 → Numbers or names?).

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
| 1 | **Field** | a label with its control, and the explanatory line under it | `SelectField.field/.label` · `WordEditDialog.field` · `EditProfileDialog.field/.label` · `setupForm` | component + module |
| 2 | **Choice row** / **choice group** | a radio or checkbox with its label, inline; and a wrapping row of them | `setupForm.radio/.radioRow/.checkRow` · `TimerField.radio/.timerRow` (verbatim copy) · `EditClubDialog.gameRow` · `WordEditDialog.check` | component + module |
| 3 | **Text input** | the typed-in field: fill, edge, radius, padding, the 16px touch floor that stops iOS zooming | `WordLookupDialog.input` · `AnagramDialog.input` (byte-identical) · `WordEditDialog.field input` · `TimerField.timerInput` | element rule + one class |
| 4 | **List** / **list row** | a stack of rows, divided, one hover, last divider suppressed | `HomePage.clubsList/.clubItem` · `ClubGameCard.row` · `AnagramDialog.list/.row` · `WordList` · crosswords' setup chooser — **not the menu**, see below | shared module |
| 5 | **Section** | a bordered group under a heading | `setupForm.fieldset` · `SetupSection.section/.summary` · `EditClubDialog.games/.gamesLegend` · `infoPanel.box/.heading` | component + module |
| 6 | **Section header** | a heading with its action opposite | `HomePage.sectionHeader` · `infoPanel.headerRow` · `Menu.header/.headerTitle/.headerLine` | shared module |
| 7 | **Overlay surface** | a surface floating above the page — surface, edge, radius, shadow | `Menu.popover` + `.flyout` · `Toast.toast` · `FloatingPanel.shell` · `DefinitionPopover` | shared module |
| 8 | **Scroll region** | the box that scrolls inside a fixed parent: `flex: 1 1 auto` + `min-height: 0` + `overflow-y: auto` | 48 × `min-height: 0`, 22 × `overflow-y: auto` | utility |
| 9 | **Focus ring** | 13 sites, all `2px solid var(--chrome-cursor-color)`, at three offsets (−1px, −2px, +2px) | `Menu` ×2 · `SelectField` · 3 dialogs · `HomePage.kbCursor` · `ClubGameCard.kbCursor` | utility |
| 10 | **Disabled control** | 11 × `cursor: not-allowed`, opacity spread over 0.45 / 0.5 / 0.55 / 0.6 | `Menu.itemDisabled` · `SelectField` · `TimerField` · `AnagramDialog` · `WordEditDialog` | utility |

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
| `<PageHeader>` | `components/chrome/` | a COMPONENT — two slots are structure. Both slots always render. The height is a CONTRACT (`--page-header-height`), read by the component and by `--game-header-bottom` |
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

Everything step 6 found and did not do. Each line is a task with an owner step.

| step | |
|---|---|
| **8** | **The page shell.** *A page is an optional header above a centered, width-bounded body, and the body is either a card or a layout.* Verified on all six non-game pages: five are a 480px `.card`, ClubPage is a 1000px centered region that is NOT a card. A COMPONENT, like the header. GamePage is out of scope |
| **8** | **The viewport-fit chain**, which the shell owns. `min-height: 0` appears 48× in 24 files doing TWO jobs: 17 sites are the chain (the **bound** — `max-height` on a centered card, `height` on a full-bleed page, only two sites; the **relay** — a flex column carrying it down; the **scroller**), and 31 are a flex/grid item allowed to shrink below its content, which is board geometry and stays. Eleven of the relays are steps 9–10 anyway. The relay still has no good name |
| **8** | **`.frame` → `.page`.** It is the page's outer stack, not anything header-specific; all three pages declare nearly the same rule and only the bound differs. The word is taken: `frame` means "a rectangle around a board" in four places. Rename when the bound is settled, so the element is touched once |
| **8** | `<ModePill>` reads the shared `.badge` — it still holds its own copy of the five values |
| **8** | **The two-line row** — `.content` / a name line / a muted meta line, in both `StartGameButtons` and `ClubGameCard`. The pattern should name the SLOTS; each component keeps its own name for what goes in one (`.gameTitle`, `.gametypeName`) |
| **8** | `ClubGameCard`'s `.wrapper` / `.card` names — after the conversion the wrapper IS the row and the card is its inner box, so both names describe the previous arrangement |
| **8** | The club page's filters render TWICE, desktop and mobile, each hidden in the other mode. A markup decision before a CSS one |
| **8** | The two-column fold: `.columns` stacks at `--mobile` and `data-tab` hides one side. GamePage answers the same question with the InfoSheet |
| **8** | **A dialog riding the popover tier.** crosswords' `NumberJumpDialog` is a `position: fixed` modal with its own scrim taking `--z-index-popover`, not `--z-index-panel` — so a menu could open over it. It has always painted this way; converting it named the tier without asking whether it is the right one |
| **9** | **The two drag ghosts disagree** — bananagrams 1000, scrabble 100, and `dragGhost.module.css` says the split is unintended. Both are `position: fixed`, so they are two tiers apart against everything else: scrabble's paints BELOW an open dialog, bananagrams's above. Nobody drags mid-dialog, which is why it has never shown. Neither takes a token until they agree |
| **7** | `CelebrationDialog`'s `.title` is an `<h2>` at `1.5rem` — h1's size, where h2 is `1.25rem`. May be earned; should be a decision |
| **7** | `CelebrationDialog`'s `.button:focus-visible` re-declares the shared ring. Nothing about that dialog should change a button's ring |
| **7–9** | **Nine `.body` classes want real names.** All nine mean "a panel's content area, as opposed to its header": `FloatingPanel`, `GameScratchpad`, `SetupSection`, `CelebrationDialog`, `DeviceBlockNotice`, `FaultDialog`, `DefinitionView`, crosswords' `ExplainDialog`. ClubPage's tenth became `.columns` |
| **9** | `FilterSelect`'s club-page override INVERTS: the component states the roomy default, the info column tightens it. Today the club page undoes six of its seven decisions one at a time |
| **9** | `<TurnLog>`'s `headerAction` is optional in name only — all eleven call sites pass it, so the bare-`<h3>` arm is dead. Make it required |
| **10** (scrabble) | **`BlankPicker`'s overlay at `z-index: 50`** — a full-screen `position: fixed` modal parked BELOW the panel tier, so an open chat or menu paints over it. Long-recorded as the ladder's known anomaly; it wants a look, not a reflex bump |
| **each surface** | **Ten consumer modules style `<Dot>` as a bare `.dot`.** The qualified form already exists in half the app (`greetingDot`, `playerDot`, `rosterDot`, `actorDot`, `itemDot`, `bonusDot`) |
| **shuffle games** | `<ShuffleButton>` should never take focus at all — game stuff doesn't. Its `:focus { outline: none }` says a click leaves no ring, then `:focus-visible` puts one back for a keyboard that has ⌥Z. The fix is removing the tab stop, not restyling the ring |
| **crosswords** | its setup chooser is drifted on three values (`6px` not `--radius-md`, its own hover and rule colors) — unintended, per Joel |
| **account** | `ColorChoiceList.swatchActive` draws the cursor ring to mean "the color you CHOSE" — deliberately not converted, since tying a selected state to a keyboard decision marries them forever. Whether "selected" should look like "the cursor is here" is its own question |
| **when it has a consumer** | the two-line density variant of `.item-row` |

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
  a CSS file; it inherits, so it counts. **The guard lands at step 9**, when
  this CSS is open anyway.
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
| contract slots | new, **at step 9**: every game mounting a component defines the slots it reads. Must check per MOUNT POINT — repo-wide "is it defined anywhere" is what the phantom-token guard already does, and it passes all fifteen (§9) |
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
| 6d | **homepage, again** | The rehearsal for the full toolkit: patterns + vocabulary + the page shell. Plus a **React pass** — the duplication is not only in the CSS |
| 7 | dialogs + forms | the first real win — many near-identical instances. Also decide here: whether to LOAD a font (§18) |
| 8 | clubpage, again + remaining non-game chrome | Build **the page shell** (§7): an optional header above a centered, width-bounded body. Absorbs the punted viewport-fit chain, the `.frame` rename, `<ModePill>` reading the shared `.badge`, and the leftovers listed in "Why 6 stopped" |
| 9 | shared game chrome | `common/components/game/` — 258 rules, and every game sits on it. Also: the **contract-slot guard**, checked per mount point (§9, §10) |
| 10 | per game — CSS pass, then tile-feedback pass, back to back | psychicnum first, as the control |
| 11 | assets | 17 game logos carry baked color; the wordmark and favicon carry near-whites that fail on a dark page. All of it at once, at the end — doing one per game argues about a tree sixteen times |
| 12 | fold + delete | durable rules into `docs/ui.md` and `docs/code-conventions.md`; the allowlist empties; this doc goes |

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
| **9** (shared game chrome) | The two drag ghosts disagree — bananagrams 1000, scrabble 100 — and `dragGhost.module.css` says the split is unintended. Two tiers apart, so naming them cannot paper over it |
| **10** (scrabble) | `BlankPicker`'s full-screen overlay at `z-index: 50`, below the 500 panel tier. Already the known anomaly in the ladder doc; it wants a look, not a reflex bump |
| **8** (non-game chrome) | The ladder doc files the account `Menu` under in-board controls (10–100) and again under popovers (1500). It ships at 1500; the doc's first row is the stale one |

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

Left on the club page for step 8: the two-line row (§7's named-patterns list),
`ClubGameCard`'s `.wrapper` / `.card` names — after the conversion the wrapper
IS the row and the card is its inner box, so both names describe the previous
arrangement — `FilterSelect`'s club-page override (which inverts at step 9: the
component states the roomy default, the info column tightens it), the filters
rendered twice for desktop and mobile, and the two-column fold.

**Steps 2 and 10 are structural passes, not color passes** — but a few values
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

- **Better name for the `button` bucket?** Accepted for now: buttons are easy to
  visualize, and "control" is vague. It is used for text occasionally too.
- **What actually goes in `light-mode.css`** — possibly nothing. Kept as a named
  home so nobody invents a filename mid-work.
- **Device density** (§9) — SETTLED 2026-08-21, see §9.
- **The VOCABULARIES** — decided 2026-08-21, moved to §6.6. Values are
  provisional by declaration; the names are the part that was agreed.

- **Should we LOAD a font?** (Joel, 2026-08-21) — decide at step 7. We ship no
  webfont at all today: no `@font-face`, no font file in the repo, `body` is
  `system-ui, -apple-system, sans-serif`. So type is SF Pro on a Mac, Segoe UI
  Variable on Windows, Roboto on Android — three different sets of metrics, which
  is where the cross-platform differences come from. Measured 2026-08-21: 124
  `font-weight` declarations over six values — 600×54, 700×42, 500×14, 800×9,
  400×3, and **650×2**, which only renders as 650 on a variable font and rounds
  to 700 everywhere else.
- **Which cursor colors**, given the board cursor is amber today for a recorded
  reason: scrabble's premium squares are already red and blue.
- **Whether the shrinking allowlist is the right guard mechanism.**
- **What `css-philosophy.md` becomes** when this ships. It is reasoning about
  decided design — neither work-in-flight nor current-state. Joel wants it kept.

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

## 20. The z- layers — a conversation, NOT decisions

⚠️ **Nothing in this section is settled**, and step 6c did not act on any of it.
It is the record of one evening's thinking (2026-08-21) about what covers what,
written down so it survives the session. Joel's framing, Joel's names, Joel's
provisional numbers. Read it as "where the conversation got to", and expect the
names to change before anything is blessed.

The step-6c ladder that SHIPPED is `base.css` → "The Z-INDEX LADDER" and
`code-conventions.md`. This section describes something different: the model we
would want, which today's tokens only partly implement.

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

Numbers are ILLUSTRATIVE — spacing and gaps are arbitrary, chosen so there is
room to insert. They are not proposed token values.

| z- | layer | what lives there |
|---|---|---|
| 0 | page | the literal page: text, buttons, cards. Nothing is ever deliberately stacked here |
| 10–45 | board | the board, and pieces stacked ON it (stackdown's tile depth is the only real case) |
| 50 | board question | something briefly over the board, asking about the board — crosswords' rebus entry |
| 60 | drag ghost | a piece in transit. Above its board, below anything that floats over the window |
| 100 | infoCol | on mobile only, where the info column covers the board. On desktop this is not a layer at all |
| 200 | panel | a **thinking-space you keep open**: the scratchpad, crosswords' setter-note and clue-explainer |
| 300 | dialog | a **question that is patient**. Movable, opens where you left it, no dim. Word-lookup, the anagram finder, edit-word |
| 350 | modal | a question worth **thinking about or talking about**. Dims, centers, movable. Setup, edit-club, edit-profile |
| 500 | pause gate | everything below is hidden when the game is paused. **Not z-index** — a render gate |
| 500 | chat | above every dim, on purpose: the setup form is exactly what people talk about |
| 700 | toast | announcements you must see even mid-setup ("Joel invited you"). Stack vertically |
| 800 | blocking modal | **the world stops.** No thought needed, no conversation needed. Confirmations, crosswords' number-jump |
| 900 | critical modal | as blocking, but strictly above it. Faults only. Queued, never simultaneous |
| top | tooltip | always the very top — see "the satellites" |

**The ordering rule, which is the most useful sentence in the conversation:**
*shorter-lived or more important sits higher.* The code has no rule today, only
numbers people picked one at a time.

### The satellites — things that are NOT rungs

Three things attach to a layer rather than occupying one. This is what kept the
ladder short:

- **A scrim sits one below its owner.** A layer that dims carries its own; the
  scrim is a property, not a rung. (Already true in code: `FloatingPanel` paints
  its backdrop at `zIndex - 1`.)
- **A dropdown sits just above its host.** Our select-replacement
  (`FilterSelect`) has to beat whatever contains it — a page, an info column, or
  one day a modal. As a rung it would have to outrank a blocking modal, which is
  absurd for a filter. As a satellite it is one rule that works everywhere.
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
| dialog | no | no — **opens where you left it** | yes | by the test below |
| modal | yes | yes | yes — to see the board while filling a form | by the test below |
| blocking modal | yes | yes | **no** | no |
| critical modal | yes | yes | **no** | no |

**Immovability is the visible signal**, and a better teacher than a scrim
shade: if you can drag it, you can leave it for later; if you cannot, deal with
it now.

**Two scrim colors, ~35% and ~55%** — the light one for modals (the board stays
readable), the dark one for blocking and critical. Both tokens already exist
(`--scrim-light-color`, `--scrim-color`) at 40% and 45%, a difference nobody can
see, and they are currently assigned by how a thing was BUILT rather than by
what it means.

**What "dim" must mean: everything under it is inert.** For a blocking modal
that has to be literally true — nothing may outrank it. For a modal it means
"focus is here", and chat sitting above it is a deliberate exception rather than
a lie, because a modal never claimed the world stopped.

**Resizing — who knows the right size?** *Content knows* → auto-fit, never
resizable; a form is as tall as its fields (setup already does this with
`fitContent`). *The user knows* → resizable; how much scratchpad, how much chat
history, how many anagram results is a question only the person can answer.
Predicts the current code exactly: chat, the scratchpad and the crossword notes
are the only three resizable things in the app.

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

### Open

1. **The celebration**: below chat (the moment you most want to say "gg") or a
   blocking modal (dismiss before chatting)? Joel: decide later.
2. **The multiple-movable-things strategy**, for the panel layer and the dialog
   layer both: (a) a strict order, (b) opened order, (c) raise on interaction.
   Needed sooner than it looked — crosswords can plausibly have the note, the
   explainer and the anagram finder open at once.
3. **scrabble's center-letter picker**: modal or blocking modal? Decide during
   scrabble's pass.
4. **Do the two scrim colors earn their keep**, given that immovability already
   signals the category?
5. **Names.** Every name here is Joel's working vocabulary, deliberately kept
   while thinking. `AnagramDialog` / `WordLookupDialog` are named for a category
   they may not be in, whatever it ends up called.
