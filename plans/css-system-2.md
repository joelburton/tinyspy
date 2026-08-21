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
  utilities.css      the small global set: muted, card, error, definable
  patterns/          shared modules, cut by PATTERN never by container
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
- **Not every token is a design decision.** Six kinds, and two aren't tokens in
  spirit: a **contract slot** is a blank a game fills in (`--tile-bg-color`,
  `--grid-gap`), and **local math** is arithmetic (`--cols`, `--side`). Neither
  is a color, so the game-prefix rule doesn't apply to them.
- **Device density.** The mobile breakpoint changes real spacing, which is
  neither theme nor standard look. `common/breakpoints.css` exists. **A position
  is owed before step 5**, or mobile density gets re-scattered into the modules
  we are emptying.
- **Owed to tile-feedback:** the dim-up rule wants restating in light-mode
  language, and `--tile-disabled-color` cannot be one token — a delta frozen into
  an absolute is right for exactly one starting point, and the tile ramp has five.

## 10. Guards

| | |
|---|---|
| `no unnamed colors` | sharpens into a LOCATION rule: a hex appears only in a theme file or a game's `brand.css` |
| rectangular families | a test per bucket that every member carries every variant |
| contract slots | new: every game mounting a component defines the slots it reads |
| `no dead tokens` | **the hazard.** Reserved cells look dead. `palette.ts` / `PalettePage.tsx` is written to BE the reader that keeps them alive — verify that mechanism before relying on it |
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
| 4 | ~~the **midnight spike**~~ **DONE 2026-08-20** | `themes/dark-mode.css` + `themes/midnight.css`, all 161 roles answered, behind `?theme=midnight`. The split holds everywhere except DEPTH — see §19 |
| 5 | shallow whole-app pattern pass | the top ~10 patterns NAMED, app-wide, by reading rendered surfaces |
| 6 | homepage | the rehearsal: lowest blast radius |
| 7 | dialogs + forms | the first real win — many near-identical instances |
| 8 | clubpage + remaining non-game chrome | |
| 9 | shared game chrome | `common/components/game/` — 258 rules, and every game sits on it |
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
- **Device density** (§9) — owed before step 6.
- **Which cursor colors**, given the board cursor is amber today for a recorded
  reason: scrabble's premium squares are already red and blue.
- **Whether the shrinking allowlist is the right guard mechanism.**
- **What `css-philosophy.md` becomes** when this ships. It is reasoning about
  decided design — neither work-in-flight nor current-state. Joel wants it kept.

## 19. What the midnight spike found — 2026-08-20

A throwaway dark theme, complete (all 161 roles daylight defines), reachable at
`?theme=midnight`. `themes/loadTheme.ts` picks ONE chain and dynamically imports
it, so a role midnight forgot would resolve to nothing rather than to a
plausible light hex — which is §3's rule made mechanical.

**The split holds.** Every family kept its SHAPE across the flip; only values and
directions changed. `edge` survives untouched — the fill taken 84% toward black
reads as an edge on a dark board too. `ink` fails to derive in BOTH themes, and
for mirrored reasons: gold cannot go dark in daylight and cannot go light in
midnight, so a family constrained at one end is constrained at the other by a
different amount. Role names beat lightness names, as claimed: `wash` mixes
toward the card, so a wash is genuinely darker here, and the name still fits.
The `ink` cell added to the pill that morning paid for itself the same day — it
reads `--page-text-color`, so pills flipped to light-on-dark with no further
edit.

**⚠️ DEPTH DOES NOT SURVIVE, and that contradicts where we put it.** Shadows,
scrims and the three dims sit in `base.css` as non-themed, on the argument that
"this object stands off its ground" is the same sentence in both themes. The
sentence is; the value isn't. Measured, as how far the page darkens under each
shadow, out of 255:

| | daylight | midnight |
|---|---:|---:|
| `--tile-shadow` | 75 | **5** |
| `--shadow-dialog` | 87 | **6** |
| `--shadow-popover` | 45 | **3** |

An alpha black over `#121212` is invisible. The GEOMETRY is theme-independent
and belongs where it is; the shadow's ink is not. **This is the decision step 5
inherits**, and two of the three ways out have now been tried on 2026-08-21.

**⚠️ THE CEILING, which settles the shape of the answer.** A shadow can only
DARKEN what is under it, so the ground's own lightness is the most a shadow can
ever say. Daylight's page is L\* 98 and a 30% black makes a perceptual step of
26. A dark page at L\* 12 can make at most **12**, by going all the way to pure
black — so a darkening shadow can never carry on a dark page what it carries on
a light one, **at any alpha**. Tuning the shadow is not a fix, and it never was.
Depth on a dark page needs a LIGHTER cue: a ground the piece stands on, or
lightness-as-hover.

| | L\* | step a 30% black makes |
|---|---:|---:|
| daylight `#fafafa` | 98 | 26 |
| `#121212` | 5.5 | 1.9 |
| a lifted slate `#1a1f2b` | 11.8 | 4.6 |
| the tan board ground `#776951` | 50 | 15 |

**Tried — a board ground** (`--board-ground-color`, transparent in daylight
because the page already IS a ground). At `#776951`, one rung above the tile
ramp, the stackdown tile shadow went from 5 to 33 out of 255. Two things it
taught: a ground must sit OUTSIDE the range of the pieces standing on it — set
to shade 1 it collided with stackdown's exposed tile, which is also shade 1 —
and a ground makes the shadow's ALPHA a theme's business, since matching
daylight's step on a tan ground needs roughly double it. Parked, not deleted.

**Tried — a hued, lifted page.** `#1a1f2b`, a blue-slate. There is no law that
dark mode means black: Solarized, Dracula and Nord are all hued, and Material's
`#121212` is one convention rather than the convention. It roughly triples the
shadow's room and is a real quality win on its own — a hued dark reads as a
considered surface where a neutral one reads as an absence. It does NOT rescue
shadows, per the ceiling above.

**Not tried — lightness-as-hover.** Worth recording how it would avoid becoming
a rule change, since "a theme is only values" is the property worth protecting:
give the hover rule BOTH channels, a shadow and a fill, and let each theme zero
one out. A shadow at alpha 0 costs nothing; a hover fill equal to the resting
fill costs nothing. Same CSS, both themes, values only.

**Two bugs the spike found that were never about theming:**

- **Nothing painted the page background.** `--page-bg-color` existed, was
  documented as "off-white so pure-white cards have a subtle ground", and was
  read by two components — so what you saw behind every screen was the USER
  AGENT's canvas. Invisible in light mode, where that canvas is white and the
  token is `#fafafa`. Midnight only looked right because Chrome's dark canvas is
  `#121212`, the same value midnight had picked. Fixed in `base.css`; daylight's
  page moves `#ffffff` → `#fafafa`, which is the ground the cards were always
  designed for.
- **`--outcomes-near-ink-color` measures 1.89:1 against the page in daylight** —
  gold as text does not carry, which is the gold problem stated in contrast
  rather than in prose. It is a LIGHT-mode problem only: midnight's near ink
  measures 13.28. Not fixed here; it is the colour pass's.

**What did not need saying twice:** the treatment slots are byte-identical in
both themes, which is the correct outcome — a slot is a contract, not a
decision. And `--ink-onDark-color` / `--ink-onLight-color` are unchanged too: a
role named for the ground it sits on is a role a theme has nothing to say about.
`--print-ink-color` is the one role that must NOT flip, because paper is paper.
