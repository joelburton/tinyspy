# CSS System 2

**The single spec for the CSS sprint.** It draws on the wisdom in
[css-philosophy.md](css-philosophy.md) and the decisions in `css-system.md`, but
it exists because much of `css-system.md` FAILED: we built part of a system too
complex to understand and too fragile to maintain. On any conflict, this
document wins. `css-system.md` is being folded in and deleted.

**Editorial rule:** decisions, plans and measurements — not rationale. The
"why" lives in `css-philosophy.md`. This file has to stay readable in one
sitting or it rots the way its predecessor did.

---

## 0. What this sprint turned out to be

It began as CSS. It is a **sweep, area by area — homepage, clubpage, then each
game — locking down shared ideas to reduce difference and code.** CSS is the
biggest part and not the only one: the same duplication lives in the React
(three pages hand-rolling one header; a component's parts renamed by every
consumer), and the sweep reads each file once, so anything the area needs gets
done while it is open.

**Growing is expected, not scope creep** — as long as the growth is organized by
area. Things that joined after the plan was written: the three consistencies
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

## 6.5 The three CONSISTENCIES

Every surface sits in one of three, and **the number says what a DIFFERENCE
means** there. Use the words in conversation, comments and commit messages:
*"that's consistency-2, and we're making it pink for this game because …"*.

| | the surface | a difference here is |
|---|---|---|
| **consistency-1** | a game's board and its pieces | **expected.** Tuned to fit, wildly different between games, and standardizing it is not a goal |
| **consistency-2** | game chrome — the info column, and the furniture AROUND the board | **a claim, and it owes a reason.** Standard in general (the turn-log frame, the setup disclosures), with named exceptions where a game genuinely differs (psychicnum's status line can't read like spellingbee's) |
| **consistency-3** | everything non-game — menus, dialogs, buttons, the homepage, the club page | **a bug**, until someone says otherwise. Not fatal, but it wastes lines and attention for nothing |

Two things the split needs to be usable:

- **The boundary is the SURFACE, not the folder.** `components/game/` holds
  consistency-3 things — `<ModePill>` lives there and all six render sites are
  club surfaces; `FilterSelect` lives there and its contested consumer is the
  club page — while `<PageHeader>` is consistency-3 and GamePage carries it.
  §14's roster files work by folder, which is how `<ModePill>` got filed at step
  9 when it belongs to step 8.
- **The line runs INSIDE boardCol.** A board's contents are consistency-1; the
  furniture around them is consistency-2 — the board frame, the history ring,
  the game-over frame, `dimNotYourTurn`, the below-board feedback slot, the
  your-turn flash. "boardCol is per-game" would otherwise invite a game to
  restyle the frame.

**The shared vocabulary cuts across all three and is none of them.** The outcome
colors, the tile ramp, member colors, the feedback pill, the focus ring: 100%
standard everywhere *including* inside the most-tuned board. The three
consistencies answer "how much may this vary"; the vocabulary answers "what may
never vary".

The step order already obeys this, which is some evidence the model is real
rather than invented: steps 6–8 are consistency-3, step 9 is consistency-2's
shared half, step 10 is consistency-1 plus consistency-2's per-game half.

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

**Shipped at step 6: `.button-small`** (`utilities.css`) — `0.8rem` at weight
500 in `0.25rem 0.6rem`. A SIZE, composing with any tone and either treatment.
Its second consumer, `clubFilters.module.css`'s `.modeOption`, adopts it at step
8; that will add weight 500 and move its padding 0.05rem.

**A pattern gets a FILE, named for the pattern** (Joel, 2026-08-21) — the
default, not a threshold to clear: too many files merge easily, one long file
has to be read through. `common/patterns/button.css` and
`common/patterns/list.css` exist; `utilities.css` keeps only the adjustments
that name nothing, `.muted` being the clearest case. It went 293 → 129 lines,
of which the button was 164.

**THE PAGE SHELL — the step-8 target, stated 2026-08-21 (Joel).** The
viewport-fit chain below is one half of this; the centering is the other, and
they live on the same two elements, so they get built together.

> **A page is an optional header above a centered, width-bounded body, and the
> body is either a card or a layout.**

Verified against all six non-game pages:

| page | header | body | centered by |
|---|---|---|---|
| home | ✓ | `.card` | `.card`: `max-width: 480px; margin: 0 auto` |
| club | ✓ | two-column region | `.body`: `max-width: 62.5rem; margin-inline: auto` |
| create-club | — | `.card` | as home |
| login | — | `.card` | as home |
| claim-a-handle | — | `.card` | as home |
| palette | — | `.card` | as home |

The axis that varies is the body's WIDTH and KIND: five pages are a 480px
bordered card; ClubPage is a 1000px centered region that is NOT a card — no
border, no background — holding two framed panels side by side. Both are
centered and bounded.

The no-scroll rule binds on home and club (the two with lists) and is satisfied
trivially by the rest, which are short forms. **GamePage is out of scope** — its
layout is its own thing and shouldn't be forced into this box.

Like the header, this is structure, so it is a COMPONENT, not a class. It owns
the height bound, the centering, and the `.frame` rename below.

**PUNTED at step 6 to step 8: the VIEWPORT-FIT chain** (Joel, 2026-08-21) — it
moves layout, and one instance isn't enough to see the shape. Revisit at the
club page, which is where the second instance of the *bound* is.

What the reading found, so it isn't re-derived. `min-height: 0` appears **48
times in 24 files doing two unrelated jobs**:

- **The viewport-fit chain, 17 sites**, in three roles. The **bound** —
  `max-height` / `height` off the viewport — exists in exactly two places,
  `HomePage.frame` and `ClubPage.frame`, and they deliberately differ
  (`max-height` for a centered card so it isn't stretched, `height` for a
  full-bleed page; docs/ui.md → Page-height fits the viewport). The **relay** is
  a flex column + `min-height: 0` that carries the bound down: `HomePage.card`
  `.clubsSection` · `ClubPage.left` `.startBlock` `.right` · `TurnLog.turnLog` ·
  `PlayArea.infoCol` · `FloatingPanel.body` · `GameScratchpad.body` ·
  `AnagramDialog.content` · `InfoSheet` (mobile) · `ChatBody` · crosswords ×6 ·
  `letterboxed.chainBlock`. The **scroller** ends it with `flex: 1` +
  `overflow-y: auto`. Eleven of the seventeen relays are game chrome or games,
  so most of this is steps 9–10 anyway.
- **Letting a flex or grid item shrink below its content, 31 sites** — the same
  declaration, nothing to do with the viewport: every game's `.board` / `.grid`
  / `.tile`, `bananagrams` ×4, and `ClubPage.body` (a ROW splitting sideways).
  That is board geometry and stays with the games.

**`.frame` is the element this lands on, and it wants renaming at the same
time** (Joel, 2026-08-21). It is the page's OUTER STACK — a flex column with a
gap, holding the page's top-level pieces and carrying the bound. Nothing about
it is header-specific; a page wants one as soon as it has more than one piece,
which is why login and claim-a-handle have none (their card is their only
piece). All three pages that do have one declare nearly the same rule — GamePage
`display:flex` + column + `gap: 1rem`, Home and Club the same plus `width:
100%` — and only the BOUND differs (none / `max-height` / `height`). But the
word is taken: `frame` means "a rectangle drawn around a board" in four places
(`historyViewer.frame`, `PlayArea.gameOverFrame`, crosswords' `.peerFrame`,
bananagrams' `.boardFrame`), and that is the documented sense. Rename the
page-level one — `.page` is the candidate — when the bound is settled, so the
element is touched once.

Naming is unsettled and is the other reason to wait: the relay is "a flex column
that lets a height bound through instead of stopping it", and neither
`.passes-height` nor anything mechanism-shaped (`.min-height-zero`) is good
enough to ship.

**Shipped at step 6: `.badge`** (`patterns/badge.css`) — the shape only, border
in `currentColor` so the caller sets `color` alone. "Solo" on a club row and
"Co-op" on a game row are one thing. Solo adopted the mode pill's shape (six
sites to one, and `text-transform` on a shared badge would render "Co-op" as
"CO-OP"). `<ModePill>` still holds its own copy; it reads the class at step 8.

**Owed, noted in the code rather than fixed (Joel, 2026-08-21):**
**Ten consumer modules style `<Dot>` as a bare `.dot`** — a component's own
module may use short names because the file is the subject; a consumer's may
not (docs/code-conventions.md → "A component's own module may use short
names"). Rename at each surface's pass; the qualified form already exists in
half the app (`greetingDot`, `playerDot`, `rosterDot`, `actorDot`, `itemDot`,
`bonusDot`).
**Nine `.body` classes want real names** — a class called `.body` says "body of
what?" and reads as the page's `<body>`. All nine mean "a panel's content area,
as opposed to its header": `FloatingPanel`, `GameScratchpad`, `SetupSection`,
`CelebrationDialog`, `DeviceBlockNotice`, `FaultDialog`, `DefinitionView`,
crosswords' `ExplainDialog`. Rename at each one's pass (**steps 7–9**);
ClubPage's tenth was the two-column region and became `.columns`.
`CelebrationDialog`'s `.title` is an `<h2>` at `1.5rem` — exactly h1's declared
size, where h2 is `1.25rem`. The one place a level and its size disagree, and a
leftover from when h2's browser default was also `1.5rem`. It may be earned (a
celebration's title is the loudest thing on screen at that moment) but it should
be a decision — **step 7**.
`CelebrationDialog`'s `.button:focus-visible` is a local copy of the shared
focus ring — nothing about being in that dialog should make a button's ring
differ from a form's, so it goes at **step 7**. And `<ShuffleButton>` **should
never take focus at all**: game stuff doesn't get real focus, which is why board
tiles and readouts don't (docs/keyboard-shortcuts.md). Its `:focus { outline:
none }` already says a click leaves no ring; `:focus-visible` then puts one back
for a keyboard that has ⌥Z anyway. Nine call sites, and the fix is removing the
tab stop rather than restyling the ring — **at the shuffle games' passes**.

**Shipped at step 6: `--chrome-cursor-ring` + `.kb-cursor`**
(`patterns/focus-ring.css`) — thirteen sites wrote `2px solid
var(--chrome-cursor-color)` by hand; now one token. **The offset is the only
variable and it is not taste**: `-2px` when the element abuts its neighbours,
`-1px` when it has its own border to sit inside, `+2px` when it has clear space.
`.kb-cursor` is the class form for the case a pseudo-class cannot express — the
list holds the focus, so the row the arrows point at has no focus of its own.
Three byte-identical copies became one. **Not converted, deliberately:**
`ColorChoiceList.swatchActive` draws the same ring to mean "the color you
chose", and tying a selected state to a keyboard decision would marry them
forever — noted in place, its own question at the account pass.

**Shipped at step 6: `<PageHeader>`** (`components/chrome/PageHeader.tsx`) — a
COMPONENT, not a class, and the correction is the lesson: it was half-built as
`patterns/page-header.css` before Joel asked whether a shared component already
existed. None did — home, club and game each hand-rolled the `<header>`. Once
the pattern grew two slots it was structure, which §7's own table sends to a
component, and §7 already records the general case ("a shared stylesheet with
several consumers and no component is a component waiting to be written").
**The height is now a real contract**: `--page-header-height` in `base.css`,
read by the component and by `--game-header-bottom` (which positions the mobile
InfoSheet). Both were the literal `2.5rem`, true only because the header's
tallest child happens to be the menu trigger — and the token's own comment
records the sheet riding 4px over the rule when that coincidence slipped.

**Shipped at step 6: `.heading-with-controls`** (`patterns/heading.css`) — a
heading with the control that acts on what's BELOW it. Named to refuse the
wrong use: a bare `<h3>` takes no class. Two things the reading settled: the
`gap` is a MINIMUM that only bites once the row is full (so `0.5rem` everywhere
costs nothing and is the tightest instance's answer), and `min-width: 0` on the
heading slot decides who gives — it makes yielding possible without saying how,
and a heading that can get long owes ellipsis or a dropped clause. **Naming
ruling (Joel):** `<h1>`–`<h6>` are HEADINGS, the top-of-page strip is a HEADER —
`.header` in HomePage + ClubPage should become `.page-header`, owed at step 8.
Found on the way: `<TurnLog>`'s `headerAction` is optional in name only (all
eleven call sites pass it); the dead branch goes when the turn log converts.

**Shipped at step 6: `.item-list` / `.item-row`** (`patterns/list.css`), with
the homepage's clubs list as the first consumer. The hairline is declared on
the LIST (`> *:not(:last-child)`), not the row, because a row wrapped in an
`<li>` is never its parent's last child and the usual `:last-child` suppression
silently stops working. Two rulings that came with it: **the element follows the
behavior** — `<a>` when the row navigates to a URL (middle-click / cmd-click are
real behavior a `<button>` can't fake), `<button>` otherwise, and today's six
lists vary mostly by accident; and **a game's corner flag is not an outcome
bar** — it is deliberately more prominent and a different thing, so the two
never merge.

**The MENU is not a list** (Joel, 2026-08-21), and the step-5 reading had it
filed as one on the strength of looking identical. A menu is a set of ACTIONS
you pick from and it closes; a list is a set of PLACES that stay put. It keeps
menu names and does not compose `.item-row` — §7's compose on IS-A, never on
LOOKS-LIKE, which the pattern list itself broke first time out. If the two end
up sharing code, the shared thing gets its own name and both read it. **The
same question is owed to every other row-shaped thing on the list** before it
converts. The two-line density variant waits for its first consumer
(clubpage) rather than shipping unused. Crosswords' setup chooser is drifted on
three values (`6px` not `--radius-md`, its own hover and rule colors) and Joel
ruled that unintended — it converts at its own pass.

Found by converting the homepage's "+ New club", which also made **`.button`
element-agnostic**: `display: inline-block`, the radius and
`text-decoration: none` moved into it from the `button { … }` element reset,
which a `<a>` never matches. Every existing button already computed to those
three, so nothing moved. The button now carries no class of its own —
`cls('button', 'secondary', 'button-small')` and nothing else, which is the
shape the rest of step 6 should reach for.

Three things the reading turned up that are not patterns:

- **`.card` and `.actions` each name two different things.** Global `.card` is
  the page card (homepage, login, club, create-club); `ClubGameCard.card` is a
  game row in a list. Global `.actions` is a COLUMN of buttons with a top
  margin; `.modalActions` is an end-aligned ROW. Same word, different thing,
  in both cases.
- **`.muted` and `.error` already exist globally and are re-typed anyway** — 65
  declarations of `color: var(--page-text-muted-color)` and local `.error` rules
  in `WordEditDialog` + `AnagramDialog`. Whatever the pattern pass ships, the
  existing utilities are evidence that shipping it is not the same as adopting
  it.
- **Three token vocabularies paint a 1px line**, and the theme means them
  differently — `--page-surface-border-color` `#e2e2e2` (37 uses),
  `--field-edge-color` `#cfcfcf` (13), `--page-divider-color` `#8a8a8a` (10) —
  but the usage crosses: `HomePage.clubsList` draws a list container in the
  FIELD edge, `ClubGameCard.row` draws a row divider in it, and `infoPanel.box`
  draws a 2px border in the DIVIDER gray. Settle per surface at its pass, not
  here.

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
| 6 | homepage | the rehearsal: lowest blast radius |
| 7 | dialogs + forms | the first real win — many near-identical instances. Also decide here: whether to LOAD a font (§18) |
| 8 | clubpage + remaining non-game chrome | Build **the page shell** (§7): an optional header above a centered, width-bounded body. Absorbs the punted viewport-fit chain, the `.frame` rename and `<ModePill>` reading the shared `.badge` |
| 9 | shared game chrome | `common/components/game/` — 258 rules, and every game sits on it. Also: the **contract-slot guard**, checked per mount point (§9, §10) |
| 10 | per game — CSS pass, then tile-feedback pass, back to back | psychicnum first, as the control |
| 11 | assets | 17 game logos carry baked color; the wordmark and favicon carry near-whites that fail on a dark page. All of it at once, at the end — doing one per game argues about a tree sixteen times |
| 12 | fold + delete | durable rules into `docs/ui.md` and `docs/code-conventions.md`; the allowlist empties; this doc goes |

**Steps 2 and 10 are structural passes, not colour passes** — but a few values
shifting is fine and expected. What is not fine is a value shifting without
anyone noticing: every move is recorded (§16), decided, or marked (§15). Broad
colour tinkering stays a separate later pass; the structure is what makes it
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

## 16. Parked

Places where two meanings collide on one value today. Recorded, not fixed —
this is the colour pass's agenda.

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
- **A limited vocabulary of DISTANCES** (Joel, 2026-08-21 — noodled, not
  decided). The shape, so it isn't re-derived:

  - `--space-1 … --space-N`, global, and **property-agnostic**: it mostly feeds
    `gap` (40 distinct gap values against 14 margin ones), so a name like
    `--margin-top-2` would be read as a `gap` within a week.
  - **Not theme- or polarity-scoped.** Themes are color (§3).
  - **The class names the thing and reads the token.** The markup stays
    `<button class="button primary">` — no `mt-2`-style utility, because a
    spacing decision in JSX can't be changed by editing CSS, and every pattern
    so far has *absorbed* spacing rather than parameterizing it.
  - **DENSITY SCOPES are the real prize.** `.infoCol` re-declares the same token
    names one notch tighter and its whole subtree follows, so "this is smaller
    in the info column" stops being N overrides in a dozen modules. Custom
    properties already do this in three places here — a game's `--tile-bg-color`,
    `<Dot>`'s `--dot-size`, scrabble's `--viewer-accent` on the board column.
  - **A hand-entered literal length becomes a smell in consistency-2 and -3**,
    needing justification. That is the `no unnamed colors` guard's sentence with
    a different noun, and that guard has held for months.
  - **DEFINE IT PROVISIONALLY NOW, apply as each surface converts, re-fit the
    values once near the end.** My first instinct was to measure after the
    patterns land, on the grounds that patterns keep eating spacing
    declarations — `.clubsList`'s margin vanished, `.left`/`.right` collapsed to
    one, the h3 margins became a heading level. Joel's counter, and it wins:
    this sweep reads every file exactly once, so a scale that doesn't exist yet
    means seeing `gap: 0.4rem` and leaving it, then coming back later.

    The caution was weak anyway, because **the indirection makes re-fitting
    nearly free**: a site says `var(--space-2)`, so re-tuning the ramp is
    editing five numbers in one place and no site moves. Getting the values
    slightly wrong now costs almost nothing; not having names costs a second
    pass over everything.

    It also fixes something visible in this doc's own history: every pattern
    written on 2026-08-21 picked a spacing value and then justified it in a
    comment — `0.5rem` on the heading row, `0.4rem 0.9rem` on the packed rows,
    `0.375rem` in the page header. Each defensible alone; together they are
    three opinions of "small".

  **STILL BEING THOUGHT THROUGH — not decided, and not to be treated as
  settled.** Recorded here because it is too big to hold in session memory.

  Measured 2026-08-21, gap + margin in rem, as the before-picture:
  **consistency-3** 17 distinct values over 79 declarations (five cover 55);
  **consistency-2** 12 over 45, the same top five; **consistency-1** 20 over
  222, out of scope by definition. The union of the two top-fives is roughly
  `0.25 · 0.4 · 0.5 · 0.75 · 1 · 1.5`.

  **The one open question inside the question:** are `0.4` and `0.5` two steps
  or one? They are the two most-used values (14 and 18 in consistency-3), which
  either means both are real or means one idea is spelled two ways. Joel is not
  ready to settle this yet.

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
