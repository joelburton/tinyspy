# Area: corecss

The folders it reads: `core-css` · `themes`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN (2026-09-05).** Roster stamped `cs-audited-corecss`; every
file read in one sitting; findings below.

## The roster

Agreed 2026-09-05 (Joel: "stamp and read. commit, then audit.") — every file
of `src/common/core-css/` and `src/common/themes/`, less the two `boot`
blessed:

| file | what it is | stamp |
|---|---|---|
| `src/common/core-css/base.css` | the element layer and every shared non-color value: the font face, the seven non-color vocabularies, depth, the three dims, the z- ladder, page geometry, the resets, the four heading levels, the bare `<button>`, the print sheet | `cs-audited-corecss` |
| `src/common/core-css/fixed.css` | the colors exempt from theming, loaded outside the chain: the eight member fill/edge pairs and the wordle fills + edges | `cs-audited-corecss` |
| `src/common/core-css/utilities.css` | the global classes that are adjustments: `.card`, `.muted`, `.error`, `.actions`, `.divider`, `.link-button`, `.definable`, and the `[data-tooltip]` long-press rule | `cs-audited-corecss` |
| `src/common/core-css/patterns/badge.css` | `.badge` — the one-word category lozenge; paints no color, the border is `currentColor` | `cs-audited-corecss` |
| `src/common/core-css/patterns/focus-ring.css` | `--chrome-cursor-ring` and the three-offset rule for where the ring sits | `cs-audited-corecss` |
| `src/common/core-css/patterns/heading.css` | `.heading-with-controls` — a heading on the left, the control that changes what is below it on the right | `cs-audited-corecss` |
| `src/common/core-css/patterns/page.css` | `.pageHeaderAndMainArea`, `.pageMain`, `.pageMain-fills` — the bounded page and the part inside it that scrolls | `cs-audited-corecss` |
| `src/common/core-css/patterns/segmented.css` | `.segmented` — a joined row of mutually exclusive options, the chosen one read off `aria-pressed` | `cs-audited-corecss` |
| `src/common/core-css/doc.md` | a one-sentence lede; Design owed | (no stamp — markdown) |
| `src/common/core-css/todo.md` | one Soon (the scroll-region utility), eight Someday, two Maybe at the open | (no stamp — markdown) |
| `src/common/themes/daylight.css` | the shipping light theme: the complete role → hex grid, every family a rectangle with its formula beside each cell | `cs-audited-corecss` |
| `src/common/themes/light-mode.css` | what is true of every light theme — one declaration, `color-scheme: only light` | `cs-audited-corecss` |
| `src/common/themes/midnight.css` | the dark spike behind `?theme=midnight`: every daylight role answered in the same order, with each flipped formula saying so | `cs-audited-corecss` |
| `src/common/themes/dark-mode.css` | the dark twin of light-mode.css — `color-scheme: only dark` | `cs-audited-corecss` |
| `src/common/themes/doc.md` | a one-sentence lede; Design owed | (no stamp — markdown) |
| `src/common/themes/todo.md` | one Soon (the `--page-surface-color` rename), three Someday, one Maybe at the open | (no stamp — markdown) |

**Decided at the opening, and why:**

- **`loadTheme.ts` and `loadTheme.test.ts` stay `cs-blessed-boot`**, per the
  areas table. A change this area's reading needs in the loader ships with
  this area as a conformance edit; the stamp is `boot`'s.
- **Evidence, not roster:** `src/main.tsx` (the one importer of the stylesheet
  chain), `docs/ui.md` (the doc whose subject is these folders),
  `docs/buttons.html` and `plans/dark-mode.md`. Same ruling `supabase`,
  `session` and `realtime` made for their docs: a forward fix happens where a
  sentence is about this area's files, and nothing else is touched. The guards
  that read these files (`cssTokens`, `vocabularies`, `tileColor`) are never
  roster. Posed as Joel's call at the open; "stamp and read" took the list as
  proposed, so recorded as the reversible reading.
- **The `/* @@ */` markers are this area's biggest fact** — the twelve
  stylesheets carry 489 of them, and a marker comes off only when Joel has
  seen the rule in place and says it looks right. Whether the burn-down is
  this area's work or waits for step 12 was posed at the open and is NOT
  ruled; the findings below do not touch a marker.

## Findings

Recorded 2026-09-05 from one read of all sixteen files, every claim below
re-checked against the tree. Shape findings first, prose after. No prefix
means OPEN.

### F-corecss-1 · `vocabulary-literals-in-the-vocabulary-files` · The files that DECLARE the vocabularies still write the literals they exist to replace

`guards/vocabularies.test.ts` keeps a `pending` row per file for every literal
not yet converted, and the a/b/c rule says a value converts when its area is
audited. This is that area, and at the audit its own five stylesheets held
**thirteen** rows (the audit first wrote fourteen; the rows are
`vocabularies.test.ts:250, 333, 334, 350, 387, 388, 389, 426, 500, 533, 558,
559, 560`).

**Pass one — every exact match — is worked.** Seven declarations converted,
six rows deleted, no pixel moved:

| file | property | literal | token |
|---|---|---|---|
| `base.css` | `border` | `1px` (field edge) | `--border-width-line` |
| `badge.css` | `border` | `1px` | `--border-width-line` |
| `segmented.css` | `border` + `border-left` | `1px` ×2 | `--border-width-line` |
| `utilities.css` | `border` | `1px` (`.card`) | `--border-width-line` |
| `heading.css` | `gap` | `0.5rem` | `--spacer-4` |
| `segmented.css` | `transition` | `100ms` | `--transition-duration-paint` |
| `utilities.css` | `margin-top` | `1rem` (`.error`) | `--spacer-2` |

What is left, and each of the four is Joel's — the font ramp has three steps
and this area's own files want 0.7, 0.8, 0.9 and 1.4:

| file | vocabulary | literal(s) | the a/b/c question |
|---|---|---|---|
| `base.css` | spacer | `1rem`, `1.25rem`, `1.15rem` — the h1–h4 margins | h2/h3/h4 use `margin-block` equal to their own font-size, which is a RATIO (`1em`) written as a rem; h1's `1rem` against a `1.5rem` font is not a ratio and is an exact `--spacer-2`. Note the spacer `allowed` regex rejects `em`, so a (c) that writes `1em` needs the guard widened |
| `base.css` | font-size | `1.5rem`, `1.25rem`, `1.15rem`, `1rem` — h1–h4; `max(16px, 1em)` — the touch floor | the ramp's own `fix` text already says "Headings are not on this ramp — their sizes are decided by h1–h4 in base.css", so the exemption is stated and only the row has not caught up. Separately, `max(16px,` / `1em)` are artifacts of an extractor that cannot see inside `max()`: the touch floor is `docs/mobile.md` → Decisions #3 and can never be a ramp token. Four files carry the same pair |
| `utilities.css` | font-size | `0.9rem` (`.muted`) | not a one-off: **26 declarations in 18 files against `--font-size-2`'s 21**, and the guard binds `.muted`'s to `setup-form`'s `.help` (the row comment still calls it `.helpText`) with `fields/field.module.css` writing the same value. That is the ramp missing its most-written step, not a nudge to `-2`, and it wants its own presentation |
| `badge.css` | font-size | `0.7rem` | off-ramp below `-3` (0.75); (a) `--font-size-4` or (b) `-3`. Four sites app-wide |
| `badge.css` | line-height | `1.4` | between `-1` (1.5) and `-2` (1.25). `--line-height-3`'s own comment in `base.css` defines it as "a single line that should occupy exactly its own height", which is what a lozenge is (badge.css itself says nothing about line-height) — but (b) is not free: at `0.7rem` the line box goes 15.7px → 11.2px and the lozenge shrinks |
| `segmented.css` | font-size | `0.8rem` | between `-2` and `-3`; (a)/(b). Twelve sites app-wide |

**Recommendation for what remains:** present the four off-ramp values one at
a time with an (a)/(b) render each, `0.9rem` separately from the other three
because it is a ramp question rather than a class's. The two `base.css`
heading rows are not decisions — they are a stated (c) that wants a row
comment in the shape of the `0.375rem` one.

**Pass one WORKED (2026-09-05, Joel: "do pass one now")** — the seven
conversions above, with the `heading.css` spacer row, the `segmented.css`
transition row and all four border-width rows deleted from the guard in the
same edit. Thirteen rows → seven. All 26 guard files green (270 tests).
`utilities.css`'s spacer row survived this pass — `.error`'s `1rem` converted
but `.actions` still wrote `1rem` and `1.5rem` — and then went with
F-corecss-3, which also emptied `.divider`'s `0.85rem` out of the font-size
row. Six rows stand.

### F-corecss-2 · `default-bg-color-rename` · The rename the folder's own `todo.md` has carried since 2026-08-22, never built

`themes/todo.md` Soon: `--page-surface-color` → `--default-bg-color`,
"decided 2026-08-22 and never built", because the white is "what a
background is unless something says otherwise" (`docs/ui.md` → The buckets
→ "Two backgrounds"). Verified: the doc still says exactly that, and the
token still carries the old name in both themes.

Readers today: 30 files outside this area across 26 folders (every game's
components, lists, floating-panels, toasts, tooltips, the info sheet…), plus
`docs/ui.md`, plus `src/common/devtools/FontPage.module.css`. A rename is a
sweep caused by this area's change and ships with it.

**One thing blocks it, and it needs Joel's word: `/font` reads the token.**
`FontPage.module.css` is under the absolute exclusion ("do not read them, do
not edit them, do not touch them"). A rename that skips it leaves the font
page reading a token that no longer exists — the surface goes transparent.
So the rename cannot complete without ONE edit to an excluded file, or an
alias kept for it, or the page taking the breakage until its own turn.

**Also to rule:** the todo names one token. Its two siblings,
`--page-surface-border-color` and `--page-surface-hover-color`, keep the
`page-surface` prefix under the rename as written, and `page.css:10` says
"everything called `--page-*` is about `<body>` and nothing else". Rename the
family (`--default-bg-border-color`, `--default-bg-hover-color`) or the one?
The doc lists the hover gray as a deliberately unnamed exception, which
argues for the one.

### WORKED · F-corecss-3 · `dead-utility-classes` · `.actions` and `.divider` have no reader

Verified by grepping every `.tsx` for the class as a `className` string or a
`cls('…')` argument: nothing passes `actions` or `divider`. The earlier loose
count that found sixteen and five was matching `styles.actions` /
`styles.divider` — module classes with the same word, which is precisely the
collision `core-css/todo.md` → "`.card` and `.actions` each name two things"
records. The global half of that item is dead; deleting it settles the item
for `.actions`. `.error` has one reader (`ChatBody`); `.link-button` four;
`.muted` nineteen; `.definable` fifteen.

**Resolution (2026-09-05, Joel: "do f3")** — both rules and their comments
deleted from `utilities.css`. Re-verified first: no `className` string, no
`cls()` argument and no test selector anywhere reaches either class, and
`--page-divider-color` keeps fourteen other readers, so `.divider`'s
departure strands no token.

Four sentences went false with them and were fixed in the same edit:

- `core-css/todo.md` — the item is now `.card` alone.
- `floating-panels/modalActions.module.css` — the paragraph distinguishing
  itself from "the GLOBAL `.actions` utility" is gone; nothing to
  distinguish from now. (It also cited `theme.css`, a file that has not held
  these classes since the reorg.)
- `docs/common.md` and `docs/ui.md` — both listed `.actions` among the
  universal utilities and both named `common/theme.css`. Now
  `common/core-css/utilities.css`, and `.definable` takes the slot, which is
  what the list was actually missing.

The deletion also finished two of the rows F-corecss-1 left open:
`utilities.css`'s spacer row is deleted (`.error`'s `1rem` had already
converted, so nothing was left) and its font-size row is down to
`['0.9rem']`. Thirteen rows → six. Guards green (26 files, 270 tests).

`docs/ui.md` → Dialog buttons said "each dialog owns a small `.actions` /
`.buttonRow` flex rule, all sharing `gap: 0.75rem` and `min-width: 6rem`".
That is about per-dialog MODULE classes rather than the global one, so it was
first left for `floating-panels` — wrongly (Joel, 2026-09-05: "if we know
that there's a problem in another area, we should lean toward fixing it
NOW"). Verified and fixed here: every dialog in the repo applies
`actionRow.modalActions` (`EditClubModal`, `CreateClubModal`,
`BlockingModal`, `SetupGameModal`, `WordEditDialog`, `EditProfileModal`) and
no dialog owns a local action row; the only surviving `.buttonRow` is
`ClaimHandleScreen`'s, which is a screen. The sentence now names the shared
rule and keeps both numbers, which the shared rule does carry.

Four one-line staleness items in `guards/vocabularies.test.ts`, recorded at
the audit as "found outside and left", were swept under the same ruling: the
`.helpText` row comment (the class is `.help`), the F43 citation at the
`0.375rem` row (a finding ID in a durable file — now the reason itself), the
`list.css` pointer in the spacer docstring (the example lives in
`lists/SelectionList.module.css`), and one stray indent. Left deliberately:
the `0.6rem` row comment's "the retired list.css pattern's row gap", which
names the file as retired and is recording where a value came from, not
sending anyone to read it.

### WORKED · F-corecss-4 · `pageHeader-two-spellings` · One component, two token spellings

`--pageHeader-border-color` (daylight, midnight) and `--page-header-height`
(base.css) name the same component. Every other component-named token in the
area is camelCase — `--pageMain-width`, `--floatingPanel-titlebar-height`,
`--floatingPanel-titlebar-color`, `--iconButton-size`, `--entryBox-font-size`
— and `page.css:10` reserves `--page-*` for `<body>`. Readers of the odd one:
`PageHeader.module.css`, a docstring in `PageHeader.tsx`, `base.css`
(`--game-header-bottom`), and one sentence in `docs/ui.md`.

**Resolution (2026-09-05, Joel: "fix f4")** — renamed to
`--pageHeader-height`. Five sites in four files: the declaration and the
`--game-header-bottom` calc in `base.css`, `PageHeader.module.css`'s
`height`, the `<PageHeader>` docstring, and the "the height is a contract"
line in `docs/ui.md`. No pixel moves, no guard names it, no e2e names it;
`tsc -b` and the 26 guard files green.

Checked for others while here: every `--page-*` token left in `base.css` and
`daylight.css` is about the page itself — `-bg-`, `-divider-`, `-padding-x/y`,
the three `-surface-` and the four `-text-`. This was the only component
wearing the page's prefix, so `page.css:10`'s reservation now holds without
an exception. (The `-surface-` family is a different question and stays with
F-corecss-2: it names a background, not a component.)

### WORKED · F-corecss-5 · `stale-file-and-class-citations` · Six pointers at things that moved or never existed

| where | says | the tree |
|---|---|---|
| `base.css:811` | chrome is opt-in via "`.button` in utilities.css" | no global `.button` exists; the chrome is `.primary` / `.secondary` in `common/buttons/StandardButton.module.css` |
| `utilities.css:8` | a class that names a thing "gets its own file in patterns/ — the button did, and the list did after it" | neither is in `patterns/`; both live with their component (`buttons/`, `lists/SelectionList.module.css`) |
| `daylight.css:238` | `ActionButton.module.css` re-sets the slots | `StandardButton.module.css` |
| `daylight.css:579` | the selected width "lives in standards.css" | `base.css` |
| `daylight.css:29` | a game's brand anchors are in "that game's brand.css" | every game's file is `theme.css` |
| `focus-ring.css:34` | `<SelectionList>`'s `.cursor` is in `common/components/lists/` | `common/lists/` |

**A SEVENTH, found later (2026-09-05, Joel: "what are all the comments at the
bottom of focus-ring.css?") and fixed with the rest.** The offset block ended
"Only the abutting case gets a class… **see below**", and below said the class
is not in this file — a pointer that resolved to an absence. Rewritten as one
block that says why the abutting case is a class at all (a list row never
takes focus; the list does and points at a row, so there is no
`:focus-visible` on the row to hang the ring on) and then names where it
lives. Two more things came out of reading it properly: the three offsets are
the SHELL's, and a game's board piece is tuned to its own board — the repo
writes -3px and 3px on boards, which the block read as violations. And the
`ColorChoiceList` warning said "nothing has brought the two into line", which
is unfair to that file: it declines to read the token deliberately, says so,
and hands the real question — should selected look like the cursor — to the
account pass. The warning now says that.

**Resolution (2026-09-05, Joel: "do 1 and 2")** — all six fixed. Five were
name swaps, each target confirmed against the tree first: `.primary` /
`.secondary` in `buttons/StandardButton.module.css` (twice — `base.css` and
the daylight slot comment), `base.css` for the selected tile width (where
`--tile-edge-width` and `--tile-selected-edge-width` do sit side by side, so
only the filename was wrong), `theme.css` for a game's brand anchors, and
`common/lists/` for the cursor.

The sixth needed a rewrite rather than a swap. `utilities.css`'s lede used
the button and the list as proof of the rule "a class that names a THING
gets its own file in patterns/", and both had since moved to their
components — the two examples had come to contradict the sentence they were
supporting. The rule is right and `patterns/` demonstrates it five times, so
it keeps the rule and states both homes: patterns/ for a thing with no
component of its own, the component's module when it has one.

Every other path and symbol the sixteen files name was checked and holds:
`tileColor.ts`, `feedbackTiming.ts`, `layoutWidth.ts`, `breakpoints.css` and
its four custom-media names, `FloatingPanel.module.css`'s ratios,
`PlayArea.module.css`'s three dim classes and its `.infoCol` `--z-host`,
`infoPanel.module.css`'s 0.95rem heading, `colorVarFor` / `<Dot>`,
`MODE_LABEL`, `<RadioRow>`, `<FilterSelect>`, `ModeFilter` +
`useStickyChoice`, and all eight `docs/*.md` headings cited.

### WORKED · F-corecss-6 · `plan-citations-in-durable-files` · Six citations of the plan or a finding

Banned by the no-cite rule for every file that outlives the sprint:
`page.css:45` "F27 `width-100-undeclared`", `page.css:68` "F31
`centering-said-4x`", `base.css:55` and `:596` "(§22)", `midnight.css:17`
"(§3: the base must load because a theme asked for it)", `midnight.css:19`
"(§4)". Each becomes the reason itself or the owning doc — the two `page.css`
ones already state their reason in the sentence before the tag, so the tag
just goes; the font ones point at `docs/ui.md` → The typeface.

**Resolution (2026-09-05, Joel: "do it")** — all six. Four were tags that
carried nothing: both `page.css` ones state their reason in the sentence
before, and `midnight.css:19` was a section rule with a number stapled on
(the dashes were re-padded so the comment box still squares up).
`midnight.css:17`'s parenthetical held a real explanation, so it kept the
words and lost the `§3:`. The two `§22`s now point at `docs/ui.md` → The
typeface, which is the doc that owns the decision they defer to.

Swept after: no `§`, no `F<n>`, no `app-audit` and no `areas/` reference
remains anywhere in the twelve stylesheets.

**`midnight.css`'s three citations of `plans/dark-mode.md` were held back for
a ruling and then allowed** — see F-corecss-15's resolution. A plan that is
the standing record of a spike is a destination; the no-cite rule is about
this sprint's own plan, which gets deleted when it ships.

### WORKED · F-corecss-7 · `flash-durations-kept-in-step-by-hand` · Two files disagree about how they agree

`base.css:274–275`: the JS "reads the same numbers from
`feedbackTiming.ts`; keep the two in step." `feedbackTiming.ts` says
something different and more precise: the JS value must be AT LEAST the CSS
one, and holds `YOUR_TURN_FLASH_MS = 1200` against `--mark-yourTurn-flash-
duration: 1.1s` on purpose (the class outlives the fade). So base.css states
a rule the other file deliberately breaks. And "kept in step by hand" is the
shape `mobile` fixed for the breakpoints: the hook exports its value and a
spec holds it to the stylesheet.

**Resolution (2026-09-05, Joel: "just do 1. we don't need a test for it.")**
— base.css's sentence now says the JS waits at least this long and sometimes
longer, and points at `feedbackTiming.ts` for the rule and the constants. No
spec: the enforcing test was offered and declined, so nothing is owed
anywhere for it — do not re-file it.

Verified while working it: neither token is overridden by any game's
`theme.css`. Each is declared once in base.css and read once in
`PlayArea.module.css`, and the two JS constants have four consumers (the
waffle, connections and psychicnum boards, and `useTurnStartFlash`), so the
pairing is exactly two-to-two and nothing else can drift into it.

### WORKED · F-corecss-8 · `scroll-region-utility` · The folder's one Soon item

`core-css/todo.md` Soon: a utility for the box that scrolls inside a fixed
parent — `flex: 1 1 auto` + `min-height: 0` + `overflow-y: auto`, written by
hand at dozens of sites. It is this folder's to build, and this is the area.
Building it here with no readers puts a global class in `utilities.css` that
nothing wears until each area converts — the same "live and unread" state
the tokens sit in, minus a guard that would notice.

**Resolution (2026-09-05, Joel: "i'll take your rec")** — the item is
deleted, and the utility is not built. Its premise did not survive counting.
Four rules in the repo write the full triple, and two of them are a game's
tuned surface:

| rule | |
|---|---|
| `chat/ChatBody.module.css` `.messages` | shell |
| `floating-panels/FloatingPanel.module.css` `.body` | shell |
| `bananagrams/PlayerBoard.module.css` `.hand` | tuned |
| `crosswords/ClueLists.module.css` `.list` | tuned |

"Dozens of sites" came from counting the ingredients apart — and they
measure different things. `min-height: 0` is the ordinary let-a-flex-child-
shrink fix and appears all over columns that never scroll; it co-occurs with
`overflow-y: auto` in five rules, four of which add the `flex`. (The item's
recorded 48 and 22 are 62 and 16 today, which is what a count in a durable
file does.)

Two shell readers is not a pattern worth a global name, and the folder's own
rule — a value with one or two readers belongs in its class as a number —
disqualifies it. Building it would also have put an unworn class in
`utilities.css`, which is the state this audit flags elsewhere.

### F-corecss-9 · `marker-placement-and-cosmetics` · Three markers sit mid-selector, plus two whitespace nits

`base.css:769–770`, `:779–780`, `:796–797`: the rule is `input,\ntextarea {`
and the marking script put `/* @@ */` before `textarea`, the second selector,
because it anchored on the `{` line. The convention is one marker per RULE at
column 0 before it. Cosmetic and mechanical. Same bucket: `daylight.css:190`
is the one declaration in the file with no space after its colon
(`-hover-color:color-mix`), and `base.css:738` is a line holding one space.

### WORKED · F-corecss-10 · `tile-ramp-meanings-stale` · The TILE block's "the numbers ARE the meaning" table names readers that do not read

`daylight.css:537–540`: `1` attention (scrabble) · `2..5` stackdown depth
0..3 · `3` normal. Verified readers of each shade outside the area:
`--tile-1` codenamesduet's board; `--tile-2` spellingbee and wordwheel;
`--tile-3` boggle and scrabble; `--tile-4` and `--tile-5` nobody; `spent`
scrabble's rack. Stackdown reads no shade at all — its `theme.css` says its
per-tile background is an hsl ramp computed at runtime, and `Board.tsx:20`
still describes the shades as `--tile-1…4` for depth 0..3, which is a third
story. `midnight.css:319–324` retells the stackdown mapping as current fact,
and `docs/ui.md` → The buckets says "stackdown reads stack depth off them".

**⚠️ The finding above is WRONG about stackdown, and so was the audit.**
Stackdown DOES read the ramp. `Board.tsx` composed the token name at
runtime — `` `var(--tile-${1 + Math.min(depth, 3)}-fill-color)` `` — so a
search for `--tile-4` found nothing and both the audit and the presentation
concluded there was no reader. Joel caught it. There is no hsl ramp in that
file; the sentence claiming one is `stackdown/theme.css`'s own, and it is the
stale thing here. So `--tile-4` is read (depth 3), `midnight.css:321`'s
inverted-ramp argument rests on a real reader and is correct, and
`docs/ui.md`'s "stackdown reads stack depth off them" is correct. Neither
needed touching. What was actually wrong in daylight: the stackdown row said
2..5 where the map is 1..4, and row 1 credited scrabble, whose
placed-but-not-committed tile is shade 3 plus the attention overlay
(`--scrabble-tile-attention`).

**Resolution (2026-09-05)** — the reader list is gone rather than corrected,
on Joel's argument: *"surely, if i were curious, i'd just search the repo for
the name. the comments just seems like a magnet for being stale."* Every row
of it had rotted, and a list of who reads a token from elsewhere is not what
a comment is for. The block now says what a shade IS — a step of lightness,
nothing reserved, walk them in order if a board shows a range.

That left one hole: for this ramp, searching for the name did NOT work, and
the reader it missed was the most important one. Joel's fix, and it is the
better one — *"why don't we change this to a set of if-else conditions on
depth, each choosing the correct --tile-x string? then we could grep it"* —
removes the trap instead of commenting on it. `depthColor` now indexes a
`DEPTH_FILL` array of the four literal strings (an array rather than a chain:
same greppability, and the clamp bound comes off the array instead of a
magic 3). All four shades are findable by name now, so the comment owes
nothing.

Also fixed: `stackdown/theme.css`'s lede said the per-tile background is "an
hsl ramp computed at runtime, so it isn't a token". It is tokens — the
shared ones — as that file's own next comment says.

### WORKED · F-corecss-11 (with F-corecss-19) · `archaeology-and-counts` · Passages that tell how it used to work, and counts that rot

CLAUDE.md: "how it used to work is not useful", and a count is a claim that
is wrong the next time anyone touches a file. Found:

- `base.css:403–407` — the old `--z-index-*` ladder "IS GONE (2026-08-25)…
  Eight tokens, thirteen declarations, eleven files"
- `base.css:643–657` — "until 2026-08-20 nothing painted it", the whole
  story of the unpainted body; the rule (the body paints `--page-bg-color`;
  a token right by coincidence is a token not being used) survives in two
  sentences
- `base.css:725–729` — "until 2026-08-21 the spacing … WAS the UA's"
- `base.css:804–813` — "This INVERTS what it used to be … twenty-nine rules
  began with that apology"; `:826–830` "19 rules cancel the old fill … up to
  19 hover states" (the reason to keep the radius stands without the count)
- `base.css:49` — "Nine places in the app ask for italics" (seven today, see
  F-corecss-17); `:75` "Four of the six non-game pages take it" (five of six
  wear `.pageMain` at the default; the count adds nothing to "a page that
  needs its own says so")
- `fixed.css:40–48` — "NOT DERIVED, though a comment claimed they were… Was
  `-dot-` / `-border-`"
- `daylight.css:82–85` "Was `--control-*`"; `:146` "Was the `action`
  family"; `:52–57` and `midnight.css:66–71` the titlebar token "was
  `--page-surface-hover-color` for months" (the rule — the two must not be
  coupled — stays)
- `focus-ring.css:32–35` — `.kb-cursor` "used to live here"
- `utilities.css:117–123` — "an earlier pure-CSS ::after version overflowed"

**Resolution (2026-09-05, Joel: "do it")** — each passage keeps its rule and
loses its history and its number. Comment-only throughout.

Both countable claims were wrong when re-checked: `base.css:75` said four of
six non-game pages take the default width (five do — ClubPage, HomePage,
ClaimHandleScreen, LoginScreen, ErrorPage), and it now says "nearly every",
which is the part that was ever load-bearing.

An ELEVENTH passage turned up in the sweep afterwards and was fixed with
them: the `--pageHeader-height` contract comment said the value "used to be
the literal 2.5rem in both places". It now states what the number is for.

**F-corecss-19 (`card-readers-listed-wrong`) is worked here**, being the same
rule under Joel's tile-ramp ruling — a reader list in a comment is a count in
disguise. `.card`'s said "the homepage's body is one, the error page is one"
and missed three of the five. It now says when a page reaches for a card
instead of naming who does, and keeps the true club-page sentence.

**Left out deliberately:** `base.css:49`'s "Nine places in the app ask for
italics" (seven declarations today). The same sentence carries F-corecss-17's
unverified oblique claim, so both edits land in one place and it is cheaper
to do it once, there.

### WORKED · F-corecss-12 (with F-corecss-14) · `base-loads-before-the-theme` · base.css says it loads after the theme; it loads before

`base.css:24`: "Loaded after the theme chain (see main.tsx) so a rule here
can read a token from it." `main.tsx` imports base.css statically at line
20; the theme arrives by dynamic `import()` inside `loadTheme()` at line 47,
after the whole static graph. So base.css is in the document first. Nothing
depends on the order — `var()` resolves at compute time, and the two `:root`
blocks set disjoint properties — which is why the false sentence has never
cost a pixel. `utilities.css:18` ("loaded after base.css") is true.

**Resolution (2026-09-05, Joel: "i'll take your rec")** — comment-only, three
files. base.css now says it loads BEFORE the theme, that the theme is late
because it is a runtime choice and so arrives by dynamic import, and that the
order does not matter either way. Verified rather than assumed: `base.css`
and `daylight.css` declare no token in common, so even a rule that read
across the two could not be order-dependent.

**F-corecss-14 (`imaginary-themes-as-loaders`) is worked here** — same
subject, one file over. `cupcake` and `horror` are gone from the two mode
files; a reader cannot tell an imaginary theme from an unimplemented one, and
the sentence makes its point with the two that exist ("a light theme loads
this and a dark one loads dark-mode.css"). `light-mode.css`'s future tense
about dark-mode.css is now present tense, the file having existed all along.
The rule both files state — a theme declares its chain, neither file is ever
an unconditional default — is untouched.

### WORKED · F-corecss-13 · `wordle-converged-and-an-unscheduled-rename` · Two sentences in fixed.css about wordle

`fixed.css:60` — the palette is shared by "waffle today, wordle as it
converges". Wordle has converged: `wordle/theme.css`, `Board.module.css`,
`GameTurnLog.module.css` and `lib/colors.ts` all read the shared fills.
`fixed.css:89–91` — "the wordle-vocabulary rename is scheduled for wordle's
own pass, so these names are UNCHANGED here on purpose." Nothing schedules
it: not `src/wordle/todo.md`, not `docs/games/wordle.md`, not
`plans/areas/wordle.md`; the only mention is the do-not-read plan. And
`docs/ui.md` → The buckets now argues the `wordle-*` name is RIGHT ("wordle
green is a phrase people say").

**Resolution (2026-09-05, Joel: "1", then "ok, do 2")** — the first sentence
is fixed:
the palette is "shared by the letter-coloring games — wordle and waffle", no
"as it converges". Verified: all four wordle files read it
(`theme.css`, `Board.module.css`, `GameTurnLog.module.css`, `lib/colors.ts`),
as do `shared/wordle-style/tileColor.ts` and the on-screen keyboard.

**The rename is OFF.** The comment reserved a `wordle-vocabulary` rename that
nothing scheduled — not `src/wordle/todo.md`, not `docs/games/wordle.md`, not
`plans/areas/wordle.md` — while `docs/ui.md` → The buckets argued the
opposite, that naming this one family for its colors is deliberate and right.
The sentence is replaced by that argument in short: the names read at speed
because "wordle green" is a phrase people say, the prefix keeps it honest
under any theme, and it separates these from a player's identity color, where
plain `green` is taken. Nothing is owed in any todo.md.

### WORKED with F-corecss-12 · F-corecss-14 · `imaginary-themes-as-loaders` · light-mode.css and dark-mode.css cite themes that do not exist

`light-mode.css:6` — "daylight and cupcake both load this". Cupcake is a
thought experiment in `docs/ui.md` ("imaginary: pink, cheery, light"), not a
theme; `loadTheme.ts`'s `ThemeName` is `'daylight' | 'midnight'`.
`dark-mode.css:7` — "a future `horror` would load it too". `light-mode.css:28`
— "dark-mode.css WILL carry `color-scheme: only dark`", future tense for a
file that exists and does. The rule both files state (a theme declares its
chain; this file is never an unconditional default) is right and stays.

### WORKED · F-corecss-15 · `midnight-board-numbers-predate-the-slate` · The BOARD block measures against a page that is no longer the page

`midnight.css:352–355`: "an alpha black over #121212 has 18 units to work in
rather than 250. Measured before this existed: the tile shadow moved the page
by 5 of 255." The page is `#262e3f` (line 53), lifted to L* 18.9 precisely so
a shadow has room — the PAGE block (lines 34–46) explains that and gives the
number. The BOARD block's figures describe the page before the slate, and
`plans/dark-mode.md` is where that measurement belongs if it belongs
anywhere.

**Resolution (2026-09-05, Joel: "i'll go with your rec")** — and this also
settles the question F-corecss-6 left open: **`midnight.css` MAY cite
`plans/dark-mode.md`.** That plan is not work in flight — it is the standing
record of the spike this file IS — so it is a destination, not a sprint
citation. The three citations stay.

With that settled, the BOARD block loses its numbers rather than
re-measuring them. `plans/dark-mode.md` §3 already holds the correct version
in more detail than a comment can — five candidate grounds with L*, the step
a 30% black makes, and the ceiling. The block keeps the rules, which do not
rot: a ground must sit outside the range of the pieces standing on it, and a
ground makes shadow alpha a theme's business.

Also corrected in the same block: it called the tan ground "parked… still
the strongest answer to the depth question." The plan concluded something
different — tried, then rejected as the GENERAL answer, because a floating
board is real design intent for several games, and available per game where
a board wants one. The comment now says that.

And one found next door in the PAGE block, same subject, comment only:
"Daylight's is 26" followed a sentence about the CEILING, where daylight's
ceiling is 98 — the 26 is the step a 30% black actually makes on `#fafafa`,
the other column of the plan's table. The comparison is the useful one, so
the sentence now says which measure it is switching to rather than reading
as a wrong ceiling.

### F-corecss-16 · `badge-cites-mode-pills` · The pattern that says a badge is not a pill points at a section called "Mode pills"

`badge.css:10` cites `docs/ui.md` → Mode pills, and `badge.css:26–29` is
the argument that a badge and a pill are two roles with two shapes. The
thing the section describes is rendered by `<ModePill>` with `cls('badge',
…)`, and `ModeFilter.tsx:25` calls it "the Co-op badge". One thing, two
names, and the pattern file is the one that defines the other name as
something else.

**Recommendation:** the doc heading and the component follow the pattern —
"Mode badges", `<ModeBadge>`. The heading is a forward fix (a sentence about
this area's pattern); the component rename is a line in
`common/game-page/todo.md`.

### F-corecss-17 · `italic-count-and-oblique-claim` · A rule nobody follows, and a count that is off

`base.css:48–51`: no italic exists in Roboto Flex; "nine places ask for
italics; `font-style: oblique` reaches the dial, and plain `font-style:
italic` gets the browser's synthesized skew." Today: seven sites write
`font-style: italic` (crosswords `Controls` + `Grid`, letterboxed `PlayArea`,
`WordList`, `ManualBoardField`, `DefinitionView`, and the excluded font page)
and zero write `oblique`. So the comment states a rule with no follower.
Whether the claim is even true is NOT verified: CSS Fonts 4 lets a browser
satisfy `italic` from an oblique face when the family has no italic, so
`italic` may already reach the dial. That needs a real render, not a grep.

**Recommendation:** render one site both ways; if they match, the sentence
becomes "either spelling reaches the slant dial"; if they differ, "use
`oblique`" is a line in six folders' `todo.md`. The count goes either way.

### F-corecss-18 · `six-shadows-are-five` · The todo item about chrome shadows describes tokens that are not there

`core-css/todo.md` Someday: "Six chrome shadow levels… `toast` is the
TOPMOST layer and blurs 16 where `dialog` blurs 48… `popover` alone has four
(Menu ×2, FilterSelect, DefinitionPopover)". `base.css` declares five
`--shadow-*` (popover, notice, panel, toast, boardFloat) and no `dialog`;
popover has three reader files. The item's question — decide the count and
the names — is still open and still this folder's; its evidence has rotted.

**Recommendation:** rewrite the item against the tree (five tokens, three
sharing `0 8px 24px`, four with one reader) when the area works its todo.md.

### WORKED with F-corecss-11 · F-corecss-19 · `card-readers-listed-wrong` · `.card`'s comment lists who wears it, and misses most of them

`utilities.css:24–27`: "the homepage's body is one, the error page is one,
and the club page has none at all." Readers: `HomePage`, `ErrorPage`,
`LoginScreen`, `ClaimHandleScreen`, and `GamePage`'s not-found page. The
club-page sentence is true. A reader list in a comment is a count in
disguise; the sentence that matters is the one after it (the card carries
the surface and nothing else).

## Notes

- **Verified and holding, so no finding:** `--button-success-*` has no
  consumer (the one `'success'` in `ClubPage.tsx` is a toast tone);
  `--page-text-strong-color` and `-label-color` are unread and on
  `DECLARED_AHEAD`; `--z-board`, `--z-board-question`, `--z-ghost` unread
  and declared ahead; `--tile-edge-width` / `--tile-selected-edge-width`,
  `--iconButton-size`, `--entryBox-font-size` (re-set by strands and
  psychicnum) all read; the crosswords picker still folds "ended manually"
  into the suspended stripe, so daylight's "gets minted when crosswords
  converts" is current.
- **Two tokens carry no `@@` on purpose:** `--radius-round` (blessed on
  sight, Joel 2026-08-22: "it's fine", per `b6f07dfc`) and
  `--page-text-strong-color` (`#000000`, decided outright).
- **All four guards green at the open** (`cssTokens`, `vocabularies`,
  `csStamps`, `folderDocs`), so anything red after this area is this area's.
- **Found outside the area and swept with F-corecss-3**, once the ruling was
  that a known problem gets fixed where it is found: the F43 citation and the
  `list.css` pointer in `guards/vocabularies.test.ts`, plus the `.helpText`
  name and a stray indent. See that finding's resolution.
- **Left for `game-page`:** `GamePage.tsx:169` renders its not-found page as
  a `.card.pageMain` (the home of that page is already on that folder's
  list); the `<ModePill>` rename if F-corecss-16 is worked.
- **Nothing left for `stackdown`.** The audit thought its board ran an hsl
  ramp of its own; it reads the shared shades, and both its files now say so
  (see F-corecss-10).
- **The excluded font page reads `--page-surface-color`** — the one fact that
  makes F-corecss-2 need a ruling rather than a sweep.
- **Owed by every area from `mobile`, checked here:** no hooks in the area;
  `window` is not referenced.

## Predicted test breaks

- `src/guards/vocabularies.test.ts` — every literal F-corecss-1 converts must
  come off its `pending` row in the same edit (the guard fails from both
  sides: a listed literal that is gone is as red as an unlisted one).
- `src/guards/cssTokens.test.ts` — a rename (F-corecss-2, F-corecss-4)
  changes the declared set; every reader moves in the same commit or the
  dead-token / unknown-token check goes red.
- `src/guards/tileColor.test.ts` reads the `@@` markers; F-corecss-9 moves
  three of them one line and must not lose one — run
  `node scripts/cs-stamp.mjs tally` after.
- `e2e/` — none predicted: nothing here moves a pixel except F-corecss-1's
  off-ramp decisions, each of which is presented with its render first.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
