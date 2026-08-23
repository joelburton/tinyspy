# Area: homepage

The first area of the CSS sprint's step 7. The process is
[css-system-2.md](../css-system-2.md) §21; the plan holds the order, this file
holds everything else.

**Status: audited, and PAUSED for scaffolding.** Twenty-two findings, eight
resolved (F1, F2, F4, F5, F6, F6.1, F8, F22). Shipped: the two fixes, the class
guard, the vocabularies, the font-weight rule and the z- ladder.

**The pause is Joel's call (2026-08-22), and the reason generalizes:** the first
area pays for the toolkit every later area will use. F5 and F22 are not homepage
work — they are the vocabulary and the layer ladder the whole sprint reads —
and they surfaced here only because this is the first surface anyone looked at.
Expect the second area to be much smaller.

## The area's files

Agreed with Joel 2026-08-22 when the area opened, then stamped `cs-audited`:

| file | |
|---|---|
| `src/common/components/home/HomePage.tsx` | 313 lines, of which ~120 are comment |
| `src/common/components/home/HomePage.module.css` | 71 lines, 8 rules, 4 raw values |
| `e2e/home-keyboard.e2e.ts` | the page's only test — and it is red (F3) |

**`src/common/components/branding/homeTitle.png`** is in the area but carries no
stamp: a PNG has nowhere to put a comment. Joel reviews it himself and this file
records the date he says he has.

- reviewed by Joel: *(not yet)*

## Findings

**Numbered `F1` … `F21`, and sub-numbered `F6.1` where one finding grows its own
list** (Joel, 2026-08-22). The prefix is the point: an hour into an area, "2" is
whatever list was last on screen and `F2` is only ever this finding. Refer to
them by their F-number everywhere — in this file, in conversation, in a commit
message.

Each finding is what was measured; the resolution goes in the quoted block under
it, and an empty one means the finding is still open.

### Dead references — three of them on a 71-line page

**F1 · `styles.clubsList` is undefined.** `HomePage.tsx:255` writes
`cls('item-list', styles.clubsList)`, and the `.clubsList` rule was deleted in
`bae1f941` ("headings get four levels that mean something") when the h3 took
over the gap it supplied. `cls()` drops the undefined, so it paints nothing and
nothing complains. `HomePage.tsx:278` also points a comment at it — "once the
clubs outgrow the card — see `.clubsList`" — and the scroll it describes is real
but comes from `.item-list`, which sets `overflow-y: auto` and `min-height: 0`.

> **resolution (Joel, 2026-08-22): fixed.** The `<ul>` is `className="item-list"`
> — no `cls()` around a single literal — and the comment now names what actually
> scrolls: `.item-list` supplies the `overflow-y: auto`, and it bites once
> `.frame`'s max-height stops the clubs growing the page.

**F2 · `.soloItem` never existed.** The component docstring (`HomePage.tsx:44`)
says solo clubs are "visually distinguished — see the `.soloItem` styles". There
is no such class in any commit reachable from here; what distinguishes a solo row
today is the `Solo` badge and nothing else.

> **resolution (Joel, 2026-08-22): fixed by explaining the badge properly.** The
> docstring now says a solo club is marked by a "Solo" BADGE on the row — the
> shared `.badge`, a one-word label saying what KIND of thing this is, small and
> outlined, never the fully-round feedback pill.
>
> The row's own JSX comment called it "its pill", which is the confusion
> `badge.css` is written to prevent ("`--radius-sm`, not a full 999px round — the
> fully-round shape belongs to the feedback pill, and the two should not be
> confusable"). Now "its badge".
>
> The block still opens with "used to be hidden … Now they're", which is F17's
> archaeology and F17's call — left alone.

**F3 · `e2e/home-keyboard.e2e.ts` has been failing since 2026-08-21.** It locates
rows with `[class*="_clubItem"]`. `.clubItem` was deleted in `89122fc7` ("the
homepage stops describing a button and a list, and just uses them") — the commit
that made the list `.item-list` / `.item-row` — and that commit did not touch the
spec. The locator now matches nothing, so the spec dies at line 29 waiting for
the first row. **Verified by running it**, not by reading: `npx playwright test
e2e/home-keyboard.e2e.ts` fails on `expect(rows.first()).toBeVisible()`.

Rewriting it means choosing what the ring is *on*: `kb-cursor` rides the `<a
class="item-row">`, while the `scrollIntoView` ref rides the `<li>`.

> resolution:

**F4 · The "class defined ≠ referenced" guard (§10) has two live cases here** —
a `styles.typo` that fails silently (F1) and a bare class-name string that fails
silently (F3), which is exactly the pair §10 names. **F2 is not one of them**: a
stale class name inside a comment is prose, and no guard can tell a wrong
`.soloItem` from a right one without flagging every word that starts with a dot.
Said here because the audit's first draft claimed all three.

It would be a static guard in `src/guards/`, not a render test, and the reason is
load-bearing: **vitest resolves CSS modules through a proxy that fabricates any
class name asked for** (`css: false`), so a rendered component happily reports
`className="undefined"`-free markup for a class that does not exist. A test can
assert a class is APPLIED; only a text scan can assert it EXISTS.

Four checks, in the shape `cssTokens.test.ts` already uses:

1. every `styles.x` in a component resolves to a class in its sibling module —
   catches F1;
2. every class defined in a module is read by its sibling — catches the rule left
   behind when markup changes;
3. every global class written as a string literal (`'item-list'`, `'badge'`,
   `'kb-cursor'`) exists in a global stylesheet — catches a typo'd global, which
   today paints nothing and says nothing;
4. every `[class*="_x"]` selector in `e2e/` names a class some module defines —
   catches F3, and would have failed the day `.clubItem` was deleted rather than
   four weeks later.

> **resolution (Joel, 2026-08-22): built — `src/guards/cssClasses.test.ts`,
> four checks, whole repo including the games.** Each was verified by planting
> the bug it exists to catch (in throwaway files, so nothing existing was
> touched) and each caught its own; the shrink arm of the allowlist was planted
> too. Suite: 1956 → 1960 in 201 files.
>
> Two false-positive shapes had to be designed out, both found by running it
> rather than by thinking about it:
>
> - the import statement itself reads as a member access — `import gridCursor
>   from '…/gridCursor.module.css'` looks exactly like `gridCursor.module` — so
>   imports come out before the member scan;
> - a string inside `cls(…)` is not necessarily a class: `cls(styles.tile,
>   outcome === 'won' && styles.won)` holds a comparison operand. Thirty-three of
>   those drowned the one real name until both sides of a comparison were
>   dropped.
>
> **It found four more live bugs on its first run**, none of them in this area,
> all listed on the plan's §7 carried-forward against the area that owns them
> and on the guard's own pending lists:
>
> - `strands/HintBar.tsx` reads `styles.hint`; the module defines `.hintReady`
>   and no `.hint`, so the Hint button's base class has been `undefined`;
> - `codenamesduet/CluePanel.module.css` `.clueLabel`, `setgame/PlayArea.module.
>   css` `.breakdown` + three siblings, and `stackdown/WordEntry.module.css`
>   `.good` / `.bad` are defined and read by nothing;
> - **`e2e/club-keyboard.e2e.ts` is red for the same reason F3 is** —
>   `[class*="_kbCursor_"] a` returns null now that the cursor row takes the
>   global `.kb-cursor`, and the href assertion under it fails. Two specs, one
>   rename, four weeks unnoticed.
>
> What it cannot catch is stated in the file: a stale class name inside a
> comment, which is F2's shape and is prose.

### Vocabulary — this is where the first ones land

**F5 · None of the eight vocabularies exist yet** (grepped: no `--spacer-`,
`--font-size-`, `--line-height-`, `--opacity-`, `--transition-duration-`,
`--letter-spacing-`, `--border-width-` anywhere in `src/`). The homepage consumes
almost none of them — its whole raw-value inventory is four numbers:

| where | value | vocabulary |
|---|---|---|
| `.frame` | `gap: 1rem` | `--spacer-2`, exact match → silent conversion |
| `.greetingDot` | `--dot-size: 0.7em` | a contract slot, not a decision (§9) |
| `.greetingDot` | `margin-right: 0.45em` | F7 |
| `.clubName` | `font-weight: 500` | F8 |

**The question is how many vocabularies this area defines.** Defining all eight
in `base.css` trips the `no dead tokens` guard (`cssTokens.test.ts:176`) the
moment one has no reader — §10 already flags that as "the hazard", with
`/palette` written to be the reader that keeps a reserved cell alive. Defining
only `--spacer-*` keeps the guard honest and leaves seven for the areas that
first need them.

> **resolution (Joel handed the call to Claude, 2026-08-22): all eight land now,
> as live tokens, and the dead-token guard gets a named shrinking allowlist for
> the ones without a reader yet.**
>
> The choice was between landing them live and landing them commented-out with
> their values and order ready to uncomment. Live wins because **a commented
> token is invisible to every instrument we own**: the phantom-token guard, the
> dead-token guard, `/palette`, and `css-token-snapshot.mjs` (which resolves
> every shared token in a real browser and diffs before against after) all read
> declarations, and none of them reads a comment. The sprint's own recorded
> failure — decisions written in prose got overwritten by a later pass, and what
> survived was what a test asserted — is the argument against parking a scale in
> a comment for sixteen areas.
>
> The scale is also **one decision, not eight**. `--spacer-1 … -5` is a ramp
> whose members only mean anything against each other; declaring `-2` alone and
> the rest later invites the ramp being re-litigated at every area.
>
> What "don't worry about unused tokens" must NOT mean is the guard going dark.
> It is repo-wide — switching it off to tolerate seven vocabularies stops it
> catching a genuinely dead token anywhere else, for the rest of the sprint. So
> it takes the same mechanism 6a already built for `vocabularies.test.ts`: a
> `pending`-style list naming the tokens declared ahead of their consumers, which
> **fails when a name on it is misspelled or gone**, and which each area shrinks
> as it converts. The debt stays countable and the guard stays live for
> everything it already protects.
>
> The list empties two ways, not one: an area converting a value, or `/palette`
> growing a row that shows the scale doing its job. **The palette mechanism is
> verified, which §10 asked for before relying on it** — `scanTokens` collects
> `var(--x)` references from `codeFiles` as well as stylesheets, so a token
> spelled out inside a string in `palette.ts` does count as a reader.
>
> Eight, not nine: F8 settles `font-weight` as CSS's own scale rather than a
> vocabulary of ours.
>
> **BUILT, 2026-08-22.** Seven ramps in `base.css` — spacer, font-size,
> line-height, opacity, transition-duration, letter-spacing, border-width —
> every declaration carrying `/* @@ */`, because landing a ramp is not agreeing
> its numbers. `DECLARED_AHEAD` in `cssTokens.test.ts` holds the ones with no
> reader yet and fails from both sides: a name on it must still exist, and a
> name on it must still be unread.
>
> **The eighth landed too, and it needed two new values.** The text grays are
> the one themed vocabulary, and the ramp was two members short:
> `--page-text-label-color` (Joel: pick something, mark it `@@` — it is
> `#5a5a5a` in daylight, a hair DARKER than muted, because a label is
> structure rather than de-emphasized content and has to stay legible small and
> uppercase) and `--page-text-strong-color` (Joel: true black, `#000000`, and
> NO `@@` — that one is decided). Midnight answers both by translation, and
> both of midnight's values carry `@@`: `strong` is pure white there, since the
> role is "the most ink available against this page".
>
> **The homepage converted the one value it owns that was an exact match** —
> `.frame`'s `gap: 1rem` → `--spacer-2`. It is the whole conversion this area
> gets, because F7 owns the other two numbers and is still open.

**F5.1 · Every vocabulary got a guard entry, not just spacer's** (Joel,
2026-08-22: *"if you think the guards are useful and don't get in our way, feel
free to add. guards are for you, not me."*). So `vocabularies.test.ts` now runs
eleven entries instead of two, and two of them needed a mechanism it did not
have.

> **resolution: built.** `transition-duration` and `border-width` are almost
> never written as the property the vocabulary is named for — the app writes
> `transition: opacity 120ms ease` and `border: 1px solid var(--x)`. An entry
> keyed on the longhand would have matched **zero** declarations in `common/`
> while looking like coverage, which is worse than no entry at all. So a
> vocabulary may declare an `extract` regex that pulls its own values out of a
> shorthand; a value with no match is clean, which is what makes `border: 0`
> and `transition: none` come out right without naming them.
>
> The cost is that `pending` covers 200 files. That is the honest size of the
> job — it is the sprint's to-do list seen from the guard's side, and an area
> deletes from it as it converts.
>
> **And it is keyed by VALUE, which this area is the reason for.** §18 had
> "whether the shrinking allowlist is the right guard mechanism" open; the
> homepage answered it by accident. Converting `.frame`'s gap while F7 stayed
> open left `HomePage.module.css` on the list, and a file-level list excuses
> the WHOLE file — so the value we had just converted could have been written
> back to `1rem` in silence. Now a row names the literals still allowed there,
> any other literal in that file fails, and the conversion is protected the
> moment it lands. Verified by planting exactly that: reverting the gap now
> fails, where the day before it would not have.

**F6 · The spacer vocabulary spans three properties; the guard takes one.**
`vocabularies.test.ts` is keyed on a single `property` per entry (`border-radius`,
`z-index`). Spacer feeds `gap`, `margin` and `padding` — deliberately, per §6.6
("`gap` and `margin` were rejected as implementation-tied"). Either the entry
grows a property list, or spacer ships as three entries sharing one `fix` string.

> **resolution (Joel, 2026-08-22): a vocabulary entry takes a LIST of properties,
> and spacer's list is `gap` and `margin`** — padding is parked by F6.1. That is
> a small change to the guard's `Vocabulary` type and its declaration regex, and
> it keeps one `fix` string per vocabulary instead of copies drifting apart. The
> list is where padding rejoins later, without the entry changing shape.
>
> **BUILT.** `properties: string[]`, and the longhands are named individually —
> `margin-bottom` is as much a margin as `margin` is, and a guard that knew only
> the shorthand would have a hole exactly where a converted file is most likely
> to write one. Sixty files in `common/` still write a literal gap or margin.

**F6.1 · Padding needs an explicit ruling, because two records already disagree
about it.** §6.6 names the vocabulary "spacer" precisely to mean *the space
BETWEEN things*, and rejects "space" partly because "casually it also means the
room INSIDE a button between its border and its label" — which is padding. And
`list.css:129` carries a decision written in exactly those terms: `.item-row`'s
`padding: 0.5rem 0.9rem` is annotated *"Tuned to the box, not taken from a ramp
(plans/css-system-2.md §7)"*, echoing §7's "much of it is a tuple tuned to a
box".

So checking `padding` against the spacer scale would fail a value someone already
decided to keep. Three ways out, and it is Joel's call which:

- **(a)** the scale governs all three properties, and `.item-row`'s tuple is
  re-decided (both its numbers are off the scale: `0.5rem` is `--spacer-4`,
  `0.9rem` is nothing);
- **(b)** the scale governs `gap` and `margin`; padding tuples stay tuned to
  their box, and the guard does not look at padding;
- **(c)** the scale governs all three, and a tuple tuned to a box is a **(c)**
  under the a/b/c rule — bespoke, with the reason in the file, which is what
  `list.css` already writes.

> **resolution (Joel, 2026-08-22): (b) FOR NOW — padding is parked, not
> excluded.** There aren't enough data points yet to say whether the room inside
> a box belongs on the same ramp as the space between boxes, and paddings tend to
> run smaller than gaps (text inside a button). So they stay ad-hoc, the guard
> checks `gap` and `margin` only, and this gets revisited later in the sprint:
> finding every padding in the repo is one grep away, so nothing is lost by
> deciding late. `.item-row`'s tuple is untouched and its annotation stays true.
> Recorded in §6.6 as well, since that is where the spacer scale is defined.

**F7 · `0.45em` and `0.7em` are em-relative; the spacer scale is rem.** Both are
on the greeting disc and both are em on purpose — the disc and its gap track the
h1's font size, which is what keeps it from reading as a bullet point. A rem
token cannot express that, so this is an a/b/c call: (a) the vocabulary grows an
em arm, (b) they become rem and stop tracking, or (c) they stay bespoke with the
reason written in the file. `0.7em` also has a second reader — `Menu.module.css`
sets exactly the same `--dot-size` — which is the only place two dot sizes in the
app agree.

> resolution:

**F8 · `font-weight` is not one of the eight, and the app writes six values.**
Counted across `src/`: `600` ×54, `700` ×40, `500` ×14, `800` ×9, `400` ×3,
`650` ×2. The `650`s are both letterboxed. `500` is the "slightly-emphasized
name" weight and it is shared — `.clubName` here, plus `Menu`, `PlayersStrip`,
`RankBar`, `Stats`, `ActorMention`, `GenericFeedbackPill`, `TooltipHost`,
`button.css`.

> **resolution (Joel, 2026-08-22): font-weight is NOT a vocabulary of ours — or,
> put the other way, it is one and CSS already ships it: `100 … 900`. Those are
> the numbers CSS uses, so tokens would only rename them.**
>
> **The rule that follows: a font-weight must be a multiple of 100.** One that
> isn't is a bug, and it gets addressed by the audit of the area that owns it —
> not swept now.
>
> That leaves exactly one outstanding case in the repo, and it is not this area's:
> letterboxed's two `650`s (`components/Board.module.css:55`,
> `components/PlayArea.module.css:136`). Carried to the `letterboxed` area via the
> plan's §7 carried-forward checklist. Being tuned does not exempt it — a weight
> is not board geometry, and `650` renders as `700` in most families anyway.
>
> Worth a guard, and it fits the shape 6a already built: a `vocabularies.test.ts`
> entry on `font-weight`, `root: '.'` (every game, since this is not a
> per-game decision), `allowed` = `[1-9]00` plus the keywords that defer
> elsewhere (`normal`, `bold`, `inherit`, `initial`, `unset`, `revert`), and the
> two letterboxed files on `pending` until that area clears them. Unlike the
> other vocabularies this one needs no tokens at all — it is a guard and nothing
> else.
>
> **BUILT, exactly as written.** Verified by planting a `650` in `common/` and
> again inside a game, since `root: '.'` is the part of this entry that is easy
> to get wrong and impossible to see.

**F9 · The radius guard has already assigned a decision to this area.**
`vocabularies.test.ts` says, in its own comment: *"The pill gets a name when
badges are settled in the homepage area."* `999px` is spelled out in the
`allowed` list rather than pretended into the scale. HomePage itself writes no
radius, but it is the app's only `.badge` consumer outside the mode pills, so the
badge-vs-pill shape question is answerable here.

> resolution:

### Color

**F10 · `--chrome-badge-color` has exactly one reader in the app**, and it is
`.soloBadge`. §7's rule is that a value with one reader belongs inside its class
as a number — except this one is themed (`#1976d2` daylight, `#64b5f6` midnight),
which is the one thing a class cannot hold. So the question is whether it is a
badge *family* token that only one badge has claimed, or a homepage value wearing
a general name. Related: `badge.css` describes the result as "a gray Solo badge"
and it is blue in both themes.

> resolution:

### Patterns and duplication — the React pass

**F11 · The list-cursor logic is written twice, for three lists.** Clamp with no
wrap, Enter opens the row under the cursor, the ring hides unless the container
proper holds focus, `scrollIntoView({ block: 'nearest' })` on the cursor row.
`HomePage.tsx:145-174` is one; `ClubPage.tsx:837-868` is the other, parameterized
over its two lists. A `useListCursor` would sit beside the existing 2-D
`useBoardCursorKeys` in `hooks/input/`. The fix spans this area and `club-page`.

> resolution:

**F12 · The page-header trio is written three times.** Identical apart from the
logo, the sections and the label:

```tsx
<PageHeader>
  <Menu ref={menuRef} trigger={<TriggerWithChevron><Logo /></TriggerWithChevron>}
        sections={…} triggerLabel="…" />
```

`HomePage.tsx:192`, `ClubPage.tsx:920`, `GamePage.tsx:511` (which also passes
`returnFocusOnClose={false}`, for a documented reason). Third write, and §7
promotes on the second. Whether the chevron-wrapped logo becomes a prop on
`<Menu>` or its own component is the design question.

> resolution:

**F13 · `.frame` — already carried forward to the `club-page` area**, recorded
here only so the homepage's shape is on file when that area opens. Home's is the
simplest of the three declarations (`width: 100%`, flex column, `gap: 1rem`) and
the only one bounded by `max-height` rather than `height` — because its body is a
content-sized card, and a fixed height would strand a two-club list at the top of
a full-viewport box.

> resolution: deferred to `club-page` by §7's carried-forward list

### Behavior

**F14 · A failed clubs fetch is displayed as "You haven't joined a club yet."**
The load logs to the console and returns, leaving `clubs` empty, which renders
the empty-state sentence. The comment above that branch says it exists so a fetch
failure or RLS regression "shouldn't render a blank list silently" — but what it
renders instead is a sentence that states something false. The app has a fault
surface (`server-error-keys`, the pill and the fault modal) and this path uses
none of it.

> resolution:

**F15 · `focusListOnLoad` re-runs on every length change, not on load.** Its
dependency is `[ordered.length]`, and the club list is realtime — a friend adding
you to a club re-runs it. It only takes focus when `document.activeElement` is
`null` or `<body>`, so the blast radius is small, but the name promises less than
the effect does.

> resolution:

**F16 · The empty branch tests `clubs`; everything else reads `ordered`.**
`clubs.length === 0` gates the message while the keyboard, the ring and the rows
all index `ordered`. They are the same set — `ordered` is a partition of `clubs`
— so this is one name too many, not a bug.

> resolution:

### Comments and docs

**F17 · Four archaeology blocks**, which CLAUDE.md rules out ("how it used to
work" is not useful): `HomePage.tsx:41-48` (solo clubs "used to be hidden"),
`178-191` (the header "sat INSIDE the card at first", an "even earlier attempt"
hung it off the wordmark), `214-217` (the email that "used to sit under this"),
`292-297` (the row "used to end with" the club's URL). Each block also carries a
live reason for the current arrangement, so this is a trim, not a delete — and
it is Joel's call which sentence in each is the load-bearing one.

> resolution:

**F18 · `docs/common.md:284` describes a homepage that isn't there.** It says a
solo club is "visually distinguished (star icon, accent background tint, 'Solo'
badge)". There is no star and no tint; the badge is the whole treatment.

> resolution:

**F19 · `games.ts:801` names HomePage as a consumer it no longer has.**
`playerCountFits`'s docstring says it is used by "ClubPage (Start button
enable/disable) and HomePage (which solo-game buttons to surface)". HomePage
stopped carrying per-gametype start buttons — its own docstring explains why —
and does not import `games.ts` at all.

> resolution:

**F20 · `useSwallowTab`'s docstring sends the reader to the wrong page.** It ends
"`HomePage` (whose club list is arrow-driven — see docs/ui.md → ClubPage)". The
homepage's own list is documented under another page's heading.

> resolution:

### Tests

**F21 · HomePage has an e2e test and no vitest test, and it should have both.**
The e2e spec (F3) covers the keyboard in a real browser, which is the right tool
for `document.activeElement` and a computed outline — but everything below that
goes unchecked: the solo/regular partition and its ordering, the `Solo` badge
appearing on exactly the `=`-prefixed rows, the empty-state branch, the greeting
with and without a username, the cursor clamping when the list shrinks under it.
All of that is render-and-assert work a jsdom test does in milliseconds, and none
of it needs a browser.

Two things to hold while writing it: CSS modules are proxies under vitest (`css:
false` fabricates any class name asked for), so a test may assert that a class is
APPLIED but never that it EXISTS — F1–F3 are precisely what a render test cannot
catch, and that is the static guard's job (F4). And the page's data arrives
through `useRealtimeRefetch`, so the test needs the club fetch stubbed rather
than a live Supabase.

> resolution:

### Layers

**F22 · The homepage is the first surface to need the z- vocabulary, and it
needs two different things from it.** The page itself sits on `z-page`, and the
menu hanging off the header sits *above* whatever contains it. §20 is blessed
and was not built; the four items under its "Open" are all about layers this
page never reaches.

> **resolution (Joel, 2026-08-22): build the ladder now, move nothing but what
> we meet.** *"we don't have to new z- vocabulary in base, yet the homepage area
> relies on it… i agree that we should build this now (not changing other things
> to it yet; only as we 'meet' them will we move items to the new layer vocab)."*
>
> **The two ladders coexist, and that is §20's Open item 3 answered.** It reads
> there as a big-bang problem — "every value changes" — and it isn't one: the
> new block grows a reader at a time, the old `--z-index-*` block empties a rung
> at a time, and the sprint ends when it is empty. Moving a component alone
> would rank it against neighbors that have not moved, which is precisely how a
> menu ends up under a panel.
>
> **`z-page` is said out loud on `body`**, which is Joel's call and worth
> recording because the declaration deliberately does nothing: `body` is
> `position: static`, and z-index does not apply to a static box, so it cannot
> reorder anything or create a stacking context. It is documentation that the
> dead-token guard can see. Two things NOT to do with it are written at the
> declaration: don't add `position: relative` to "make it work" (that changes
> the containing block for every absolutely-positioned descendant), and don't
> repeat it on page-level components (on a POSITIONED element `z-index: 0` DOES
> create a stacking context, which traps a menu inside its host).
>
> **`z-pause-gate` stays a commented line**, and now for its own reason rather
> than to dodge a guard: it is a render gate, not a z-index. Everything else
> landed live, because `DECLARED_AHEAD` (F5) retired the workaround §20 was
> written around.
>
> **The menu did NOT move, and that is the point.** `<Menu>` is shared with
> ClubPage and GamePage; today it sits at `--z-index-popover` (1500), above the
> panel tier. As a satellite it would sit just above its HOST, which on a page
> is `z-page` — so converting it alone would put it under any `FloatingPanel`
> still at 500. It moves when the panels do.

**F22.1 · How a satellite names its host — decided, not built.** §20 says a
dropdown "sits just above its host" and never says how that is written. Two
shapes: the component names the host token (`calc(var(--z-modal-normal) + 1)`),
or the host fills a contract slot the satellite reads.

> **resolution (Joel handed the call to Claude, 2026-08-22): a contract slot,
> `--z-host`.** The satellite writes one rule everywhere —
> `z-index: calc(var(--z-host, var(--z-page)) + 1)` — and a host that is not the
> page sets `--z-host` on itself. Custom properties inherit, so a menu opened
> inside a modal picks the modal up and the same menu on a page falls through to
> the default.
>
> The alternative makes the component name its host, which is the one thing the
> satellite rule exists to avoid: `<Menu>` is on three pages today and §20
> already anticipates it inside a modal, so the hard-coded form needs a prop
> threading the right token down, and that prop is wrong by default somewhere.
>
> Two facts checked rather than assumed. **Inheritance reaches our satellites**:
> `Menu`, `FilterSelect` and `DefinitionPopover` all render in place, under their
> host. `TooltipHost` is the only one that portals — and it is the one satellite
> that wants no host, since §20 sends it to the absolute top. **And `+1` behaves
> either way**: if the host makes its own stacking context the satellite rides
> above the host's content and cannot escape it, which is correct; if it doesn't,
> the satellite genuinely outranks the host, which is also correct.
>
> **Not built, deliberately.** `--z-host` has no consumer until a satellite
> converts, and a token nothing reads is a token the dead-token guard should
> fail on. It lands with the first satellite — which, per F22, is not the menu
> and not this area.

## Dependencies — found, listed, and LEFT

Reached by reading the three files above and stamped `cs-found`. §21: being found
is not a claim on attention; none of these is audited here, and whether any
becomes its own area is Joel's call.

**React**, all under `src/common/`

- `lib/routing/Link.tsx`
- `lib/routing/router.ts`
- `lib/util/cls.ts`
- `db.ts`
- `hooks/session/useProfile.ts`
- `hooks/realtime/useRealtimeRefetch.ts`
- `hooks/input/useSwallowTab.ts`
- `hooks/input/useAppShortcuts.tsx`
- `hooks/account/useAccountMenuSection.ts`
- `components/text/Dot.tsx`
- `components/text/Dot.module.css`
- `components/branding/PuzpuzpuzWordmark.tsx`
- `components/branding/PuzpuzpuzWordmark.module.css`
- `components/branding/PuzpuzpuzLogo.tsx`
- `components/branding/PuzpuzpuzLogo.module.css`
- `components/panels/Menu.tsx`
- `components/panels/Menu.module.css`
- `components/panels/TriggerWithChevron.tsx`
- `components/panels/TriggerWithChevron.module.css`
- `components/chrome/PageHeader.tsx`
- `components/chrome/PageHeader.module.css`

**Stylesheets, reached through the global class names the page writes**

| file | what the page takes from it |
|---|---|
| `common/utilities.css` | `.card`, `.muted` |
| `common/patterns/list.css` | `.item-list`, `.item-row` |
| `common/patterns/button.css` | `.button`, `.secondary`, `.button-small` |
| `common/patterns/badge.css` | `.badge` |
| `common/patterns/heading.css` | `.heading-with-controls` |
| `common/patterns/focus-ring.css` | `.kb-cursor` |
| `common/base.css` | `h1` / `h3`, `--page-padding-y` |
| `common/themes/daylight.css` · `midnight.css` | `--chrome-badge-color` |

**e2e**

- `e2e/helpers/fixtures.ts` — `createClubWithMembers`
- `e2e/helpers/session.ts` — `signIn`

Two dependencies are worth a sentence each, and neither is a finding against
them:

- **`<Dot>`'s `--dot-size` is set by fifteen callers** across ten values
  (`0.6em` `0.6rem` `0.65em` default `0.7em` ×2 `0.7rem` `0.85rem` ×3 `1.1rem`
  `10px`, plus a psychicnum `clamp()`). That is a spread for whichever area owns
  `<Dot>`, not for this one. The homepage already uses the qualified
  `.greetingDot` form §7's carried-forward list wants everywhere.
- **`homeTitle.png` is a raster master** — 840px, drop shadow and hand-drawn
  outlines that don't survive a trace, opaque near-white ground. Step 11 already
  records that the wordmark's near-whites fail on a dark page.

## Predicted test breaks

Written before any change, so the diff against it is the signal (§21).

- **`e2e/home-keyboard.e2e.ts` is ALREADY red** and F3 owns it. It is not a break
  this area caused, and it is the one spec that must be green before the area
  closes.
- **No unit test renders HomePage.** Grepped: the only mentions outside the page
  are `App.tsx`'s route and three comments. So the vitest baseline should not
  move except by tests this area adds — F21 says it should add some, and F4's
  guard already moved it from 1956 in 200 files to **1960 in 201**.
- **`cssTokens.test.ts` → `no dead tokens`** fires the moment a vocabulary token
  lands with no reader, which F5 says will be most of them. It gets the allowlist
  in the same commit as the tokens, so this is a break we cause and close
  together rather than one we leave.
  **Happened as predicted**, and the allowlist landed with it.
- **`vocabularies.test.ts`** gets a new entry per vocabulary this area ships,
  and `HomePage.module.css` must NOT be on its pending list afterwards (the list
  shrinks, and a path that no longer offends has to leave it). F8's font-weight
  entry lands here too, with letterboxed's two files on `pending`.
  **Half wrong, and the wrong half is the useful one: `HomePage.module.css` IS
  on the spacer pending list**, because F7 is open. Its gap converted; its
  `0.45em` did not, and a file leaves the list only when it stops offending
  entirely. So this area cannot clear its own row until F7 is answered — which
  is the prediction earning its keep, since the plan to write the row off was
  made before anyone noticed the two numbers had different fates.
- **Actual suite movement**: 1960 → **1968 in 201 files**. One new `it` per
  vocabulary entry: spacer, font-weight, font-size, line-height, opacity,
  letter-spacing, transition-duration, border-width. No test's assertions
  changed, and nothing went red on the way.
- **`csStamps.test.ts`** fails on any new file without a stamp — including a new
  hook from F11 or F12, and this file's own siblings if `plans/areas/` ever grows
  a `.ts`.
