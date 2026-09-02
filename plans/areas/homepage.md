# Area: homepage

The first area of the CSS sprint's step 7. The process is
[app-audit.md](../app-audit.md) §21; the plan holds the order, this file
holds everything else.

**Status: PAUSED 2026-08-26 behind the error/fault redesign**
(the error/envelope sprint) — and the whole sprint with
it (app-audit.md's header). What is left here is F21
(`homepage-no-vitest`), plus the ten dependency findings F45–F54, which belong
to the areas that own those files.

Before the pause: **F36 and F44 closed, and F55 fixed.** `floating-panels` and `forms` both landed, which is what the
2026-08-24 pause was waiting for:

- **F44 (`action-button-text-only`)** was answered by `forms` — `icon` is
  optional on `<StandardButton>`, and the seven hand-written Cancels are one
  `<CancelButton>`.
- **F36 (`createclub-modal`)** is built: `CreateClubModal` is a `<NormalModal>`
  HomePage mounts, `/c/new` is gone, and "+ New club" is a real button.
- **F21 (`homepage-no-vitest`) is deliberately LAST**, not carried: there is no
  point pinning the page's shape while anything else can still move it — and the
  same holds for `<SelectionList>`, which may yet earn a frameless variant for
  scrabble and whose "select" kind has one consumer.

`simple-page` and `club-page` are still ahead (plan §7 → The areas, in order),
and `simple-page`'s roster lost `CreateClubPage` when F36 took it.

**Three subjects, plus the 2026-08-26 dependency audit (F45–F55).** Fifty-five findings, FORTY-THREE
resolved (F1, F2, F3, F4, F5, F6, F6.1, F7, F8, F9, F10, F11, F12, F14, F15,
F16, F17, F18, F19, F20, F22, F23, F24, F25, F26, F27, F28, F29, F30, F31, F32,
F33, F34, F35, F36, F37, F38, F39, F40, F41, F42, F43, F44) — where "resolved" includes
the ones FOLDED into a later finding, or MOVED to the area that can settle them,
rather than fixed here. The sub-findings (F5.1, F6.1, F22.1, F35.1) carry their
own status in their headings and are not counted above.

**Every heading says its status**, because this file is read by skimming and by
grep, and its resolutions sit twenty to forty lines below the line that names
the finding. Twice in one day a heading was mistaken for the current state —
F24's cost a wrong empty-state shipped to the homepage, F33's cost a wrong
answer about what was still deferred. A heading with no status prefix now means
OPEN, and there are eleven.

**Eleven open: F21 (`homepage-no-vitest`), and F45–F54 — the 2026-08-26 audit of
the dependency lib + hooks, which is its own section below. F55 was the one of
those eleven against an OWN file, and it is fixed.**

Closed 2026-08-24: **F3** (`home-keyboard-spec`), when F38 dissolved its
blocking question rather than answering it; **F38** (`selection-lists`), whose
one unfitting site left for `scrabble`; **F41** (`header-literals`), three
values converted and the fourth kept bespoke with its reason; and **F12 +
F42** together, which is what made F42 free — folding the logo into `<Menu>`
deleted the file that held the hand-inlined chevron.

**F43 leaves this area** (Joel, 2026-08-24) and is on §7's carried-forward
checklist against `crosswords` — the page where every header mark can appear at
once. The homepage has ONE, so it has no separation to judge.

Shipped so far: the two dead-reference fixes, the class guard, the vocabularies,
the font-weight rule, the z- ladder, the greeting's word space, the comment/doc
trim, the badge's shape + color, the empty-clubs fault, and `clubs.is_solo`.

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

**Re-agreed 2026-08-26**, when the area reopened onto a great deal of new common
machinery. Two membership calls, both Joel's:

- **`CreateClubModal.tsx` + `.module.css` are OWN FILES**, not dependencies —
  the area built them (F36), so the area reads them. This supersedes the line
  filing them under Dependencies in the F36 commit.
- **`e2e/faults.e2e.ts` is NOT in this area**, though the area wrote it (F23).
  It is named for the fault modal on purpose, and its own docstring says so:
  *"this is about faults, not about the homepage"*.

So the own-file list is five:

| file | |
|---|---|
| `src/common/components/home/HomePage.tsx` | 245 lines |
| `src/common/components/home/HomePage.module.css` | 6 rules |
| `e2e/home-keyboard.e2e.ts` | green since F3 closed |
| `src/common/components/club/CreateClubModal.tsx` | added 2026-08-26 by F36 |
| `src/common/components/club/CreateClubModal.module.css` | " |

Two subjects were added later, each bringing its own files:

| added | file | |
|---|---|---|
| 2026-08-22, basic page structure | `src/common/base.css` | its page-level half |
| 2026-08-23, the page header | `src/common/components/page-header/PageHeader.tsx` + `.module.css` | |
| " | ~~`src/common/components/menu/MenuTrigger.tsx` + `.module.css`~~ | the trigger's standard content — **deleted by F12**; the logo is a `<Menu>` prop and the chevron is `IconMenuChevron` |

`ClubPage` and `GamePage` were read as EVIDENCE for both, and are neither
`cs-found` nor `cs-audited` by that — see §21's note on what "found" means.

**`src/common/components/branding/homeTitle.png`** is in the area but carries no
stamp: a PNG has nowhere to put a comment. Joel reviews it himself and this file
records the date he says he has.

- reviewed by Joel: *(not yet)*

## Findings

**Numbered `F1` … `F44`, and sub-numbered `F6.1` where one finding grows its own
list** (Joel, 2026-08-22). The prefix is the point: an hour into an area, "2" is
whatever list was last on screen and `F2` is only ever this finding. Refer to
them by their F-number everywhere — in this file, in conversation, in a commit
message.

**And every finding carries a SLUG beside its number** (Joel, 2026-08-23) — see
the plan's §21. The number is the address; the slug is the hook, so a list of
numbers does not cost him a trip back to the audit to remember which is which.

The first audit stopped at F22. F23, F24 and F25 were raised later — one while
resolving another finding, one from Joel looking at the page, one from a
question he asked about it — and each took the next free number rather than a
sub-number. A finding is not required to have come from the audit.

**F26-F39 are the second subject, basic page structure** (added 2026-08-22),
and they share the same numbering deliberately: they are findings against this
area, not a separate list with its own "F1".

Each finding is what was measured; the resolution goes in the quoted block under
it, and an empty one means the finding is still open.

### Dead references — three of them on a 71-line page

**F1 · `dead-clubslist-class` · DONE · `styles.clubsList` is undefined.** `HomePage.tsx:255` writes
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

**F2 · `soloitem-never-existed` · DONE · `.soloItem` never existed.** The component docstring (`HomePage.tsx:44`)
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

**F3 · `home-keyboard-spec` · RESOLVED 2026-08-24 by F38 (`selection-lists`).**
The blocking question — whether the ring rides the row's `<a>` or its `<li>` —
is dissolved: a SelectionList row is a plain `<div>`, so there is one element
and nothing to disagree about. The spec is rewritten and green, and now also
covers Home/End and "Space does nothing".

The original finding follows.

**`e2e/home-keyboard.e2e.ts` had been failing since 2026-08-21.** It locates
rows with `[class*="_clubItem"]`. `.clubItem` was deleted in `89122fc7` ("the
homepage stops describing a button and a list, and just uses them") — the commit
that made the list `.item-list` / `.item-row` — and that commit did not touch the
spec. The locator now matches nothing, so the spec dies at line 29 waiting for
the first row. **Verified by running it**, not by reading: `npx playwright test
e2e/home-keyboard.e2e.ts` fails on `expect(rows.first()).toBeVisible()`.

Rewriting it means choosing what the ring is *on*: `kb-cursor` rides the `<a
class="item-row">`, while the `scrollIntoView` ref rides the `<li>`.

> resolution:

**F4 · `class-exists-guard` · DONE · The "class defined ≠ referenced" guard (§10) has two live cases here** —
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
> - `codenamesduet/CodenamesduetAISuggestModal.module.css` `.clueLabel`, `setgame/PlayArea.module.
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

**F5 · `the-eight-vocabularies` · DONE — the vocabularies shipped · None of the eight vocabularies exist yet** (grepped: no `--spacer-`,
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

**F5.1 · `guard-per-vocabulary` · DONE — built · Every vocabulary got a guard entry, not just spacer's** (Joel,
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

**F6 · `spacer-spans-3-properties` · DONE · The spacer vocabulary spans three properties; the guard takes one.**
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

**F6.1 · `padding-parked` · DONE · Padding needs an explicit ruling, because two records already disagree
about it.** §6.6 names the vocabulary "spacer" precisely to mean *the space
BETWEEN things*, and rejects "space" partly because "casually it also means the
room INSIDE a button between its border and its label" — which is padding. And
`list.css:129` carries a decision written in exactly those terms: `.item-row`'s
`padding: 0.5rem 0.9rem` is annotated *"Tuned to the box, not taken from a ramp
(plans/app-audit.md §7)"*, echoing §7's "much of it is a tuple tuned to a
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

**F7 · `greeting-dot-gap` · DONE · `0.45em` and `0.7em` are em-relative; the spacer scale is rem.** Both are
on the greeting disc and both are em on purpose — the disc and its gap track the
h1's font size, which is what keeps it from reading as a bullet point. A rem
token cannot express that, so this is an a/b/c call: (a) the vocabulary grows an
em arm, (b) they become rem and stop tracking, or (c) they stay bespoke with the
reason written in the file. `0.7em` also has a second reader — `Menu.module.css`
sets exactly the same `--dot-size` — which is the only place two dot sizes in the
app agree.

> **resolution (Joel, 2026-08-22): F7.3 — the margin becomes a word space, and
> F7 is CLOSED.** `margin-right: 0.45em` is gone; the JSX writes `&nbsp;` before
> the username. A space is em-relative and font-relative for free, so it tracks
> the h1 exactly as the margin did, with no token, no vocabulary arm and no
> guard exception — and `HomePage.module.css` leaves the spacer pending list
> entirely, since `0.45em` was the only value on its row.
>
> It suits what the vocabulary is for. §6.6 defines "spacer" as the space
> BETWEEN things; disc-to-username is one line of type, and a word gap takes the
> font's word space.
>
> **It is a real visual change, measured in Roboto Flex at the h1's 1.5rem:
> 10.8px → 6px** (a space is exactly `0.25em`; two would give 12px). Joel looked
> at the running app: *"a nbsp look fine"*.
>
> `--dot-size: 0.7em` is untouched, and was never in scope — it is a custom
> property, and the spacer guard reads `gap` and `margin*` only. F5's table
> already had it as a contract slot rather than a decision.
>
> **Two things this raised are NOT homepage work and went to the plan's §18**,
> on Joel's instruction: whether there should be an em vocabulary (with the
> measured inventory, which forks into em-spacing and em-sizing), and that a
> guard must distinguish bespoke-by-intent from bespoke-by-laziness rather than
> making bespoke expensive.

**F8 · `font-weight-multiples-of-100` · DONE · `font-weight` is not one of the eight, and the app writes six values.**
Counted across `src/`: `600` ×54, `700` ×40, `500` ×14, `800` ×9, `400` ×3,
`650` ×2. The `650`s are both letterboxed. `500` is the "slightly-emphasized
name" weight and it is shared — `.clubName` here, plus `Menu`, `PageHeaderPlayersStrip`,
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

**F9 · `badge-vs-pill-shape` · DONE · The radius guard has already assigned a decision to this area.**
`vocabularies.test.ts` says, in its own comment: *"The pill gets a name when
badges are settled in the homepage area."* `999px` is spelled out in the
`allowed` list rather than pretended into the scale. HomePage itself writes no
radius, but it is the app's only `.badge` consumer outside the mode pills, so the
badge-vs-pill shape question is answerable here.

> **resolution (Joel, 2026-08-22): two roles, two shapes — and the premise the
> guard was waiting on turned out to be false in both directions.**
>
> The roles first, in Joel's words. A **pill** is the feedback box that
> `useLocalFeedback` / `useGlobalFeedback` put on screen — those two are its
> only users and probably always will be, they are styled the same, and they
> always take a SEMANTIC color (won, lost — the outcome vocabulary). A **badge**
> is the one-word category label: Solo on the homepage, Co-op / Compete /
> AI-compete on the club page. Its color carries no meaning, which is why it
> takes the flexible pair.
>
> The shapes: **a badge is "curved, look like a circle but with a flat middle"**
> — a lozenge — and **a pill is a rounded rectangle.**
>
> **Measured, and this is why the finding could not just be answered:** the
> feedback pill has never been fully round. `GenericFeedbackPill.module.css` is
> `border-radius: 0.5rem`, deliberately, with the reason at the declaration —
> its thick left accent bar *"would curve into a crescent on a 999px pill"*. So
> `badge.css`'s stated reason for `--radius-sm` (*"not a full 999px round — the
> fully-round shape belongs to the feedback pill"*) was false, and the guard's
> *"the pill gets a name when badges are settled"* was written expecting a
> `999px` the pill never had. The two shapes were 4px and 8px, which is not a
> distinction anyone can see.
>
> **What shipped:**
>
> - **`--radius-round: 999px`** in `base.css`, `@@`, documented as a SHAPE and
>   not a fourth step: past half the box's height the ends cap into semicircles,
>   so a wide box becomes a stadium and a square one a circle. Distinct from
>   `50%`, which is half of each axis and ellipses a wide box instead.
> - **`.badge` takes it** (was `--radius-sm`). This is a visible change on every
>   badge in the app — Solo, and the mode badges on the club page.
> - **The pill is untouched.** Its `0.5rem` stays, and `badge.css`'s comment now
>   says what actually separates them.
> - **9b — the guard, which Joel handed to Claude:** `999px` comes OFF the
>   `allowed` list. Leaving it there would make the token a suggestion, and a
>   token nobody is made to use is the one that rots — `--radius-md` did exactly
>   that for months. Verified by planting a literal `999px` in `badge.css`:
>   red, with the right message, and green again on restore.
> - The two `999px` writers left in `common/` go on `pending` rather than being
>   swept: `ChatButton`'s counter chip and `ShuffleButton`. Both are square
>   boxes that may want `50%` instead, which is their own areas' call.
>   letterboxed's two are a game's own surface and the vocabulary does not look
>   there.
>
> **Blessed on sight (Joel, 2026-08-22): *"it's fine"*** — so `--radius-round`
> ships without `@@`, and `.badge`'s `0.4rem` side padding stays as it is
> against the new ~9.6px end caps.

### Color

**F10 · `solo-badge-color` · DONE · `--chrome-badge-color` has exactly one reader in the app**, and it is
`.soloBadge`. §7's rule is that a value with one reader belongs inside its class
as a number — except this one is themed (`#1976d2` daylight, `#64b5f6` midnight),
which is the one thing a class cannot hold. So the question is whether it is a
badge *family* token that only one badge has claimed, or a homepage value wearing
a general name. Related: `badge.css` describes the result as "a gray Solo badge"
and it is blue in both themes.

> **resolution (Joel, 2026-08-22): three color tokens become two, named
> `--flex-color-1` and `--flex-color-2`, and Solo takes 1 — the same one Co-op
> takes.** `--chrome-badge-color` is deleted.
>
> Badge colors come from the app's two FLEXIBLE colors, which have no meaning of
> their own: *"we don't use 'teal means coop' through the app in other ways; we
> just need to pick two colors that are different."* A third isn't needed
> because the two never share a screen — Solo is the homepage's, the mode badges
> are the club page's.
>
> **The naming is the finding, and it went further than F10 asked.** The first
> attempt aliased `--chrome-badge-color: var(--gamemode-coop-ink-color)`, which
> Joel rejected twice over: *"there is no one 'chrome badge color'; this
> suggests there is"*, and a mode-named token would make an arbitrary choice
> look decided — *"we'd be making something arbitrary into a 'considered'
> thing"*. Both old names claimed a meaning the app relies on nowhere. The
> numbered names are what keeps that true; the rule they carry is that a
> consumer picks a NUMBER, and which number is arbitrary.
>
> Checked before touching anything, at Joel's instruction: **badges are the only
> readers.** `--gamemode-*-ink-color` had exactly two, `ModePill`'s `.coop` and
> `.compete` — and ModePill IS the shared `.badge` — while
> `--chrome-badge-color` had exactly one, `.soloBadge`. Three consumer lines in
> two files, so the rename was small and total.
>
> The old blue (`#1976d2` daylight, `#64b5f6` midnight) is gone with the token.
> It was the app's link blue, which made a category label look clickable.
>
> **Both flexible colors were already in BOTH themes**, so nothing was owed
> there: daylight runs them at 800 (`#00695c` / `#6a1b9a`), midnight lifts both
> to the 300s (`#4db6ac` / `#ce93d8`), with the reason at the declaration — the
> 800s are unreadable on dark.
>
> **Two docs updated with the work** (§13's 6c exception — a doc already
> recording this decision): `ui.md`'s token-family table row, and its Mode pills
> → Look bullet, which said "co-op = teal, compete = purple" as though the
> pairing meant something.
>
> **Owed: `scripts/css-token-baseline.json` still holds all three old names**,
> including `--chrome-badge-color` at its pre-change blue. It is the sprint's
> hand-captured "before" snapshot, not a test, so it was left alone rather than
> quietly rewritten — a rename shows up there as removed + added, which is what
> it is for.

### Patterns and duplication — the React pass

**F11 · `list-cursor-written-twice` · DONE — folded into F38 (`selection-lists`), then built 2026-08-24 · The list-cursor logic is written twice, for three lists.** Clamp with no
wrap, Enter opens the row under the cursor, the ring hides unless the container
proper holds focus, `scrollIntoView({ block: 'nearest' })` on the cursor row.
`HomePage.tsx:145-174` is one; `ClubPage.tsx:837-868` is the other, parameterized
over its two lists. A `useListCursor` would sit beside the existing 2-D
`useBoardCursorKeys` in `hooks/input/`. The fix spans this area and `club-page`.

> **resolution: folded into F38 (SelectionLists), 2026-08-22.** Not fixed —
> reclassified. This finding proposed a shared HOOK for the cursor arithmetic;
> the duplication is a symptom and the missing thing is bigger than a hook.
> Nothing measured here is lost: clamp with no wrap, Enter opens the row under
> the cursor, the ring hides unless the container proper holds focus, and
> `scrollIntoView({ block: 'nearest' })` are four of the behaviors F38's
> component has to get right.

**F12 · `page-header-trio` · DONE 2026-08-24, with F42 · The page-header trio is written three times.** Identical apart from the
logo, the sections and the label:

```tsx
<PageHeader>
  <Menu ref={menuRef} trigger={<MenuTrigger><Logo /></MenuTrigger>}
        sections={…} triggerLabel="…" />
```

`HomePage.tsx:192`, `ClubPage.tsx:920`, `GamePage.tsx:511` (which also passes
`returnFocusOnClose={false}`, for a documented reason). Third write, and §7
promotes on the second. Whether the chevron-wrapped logo becomes a prop on
`<Menu>` or its own component is the design question.

> **resolution: `<PageHeaderMenu>` (2026-08-24), and it took the ref with it.**
> The design question is answered BOTH ways, because the block held two
> different duplications:
>
> - **The chevron-wrapped logo is a prop on `<Menu>`.** No caller was choosing
>   that wrapper — it is what a header menu IS — and the `trigger` slot's only
>   non-logo users were three tests passing `"☰"`. Generality with no production
>   reader is a flaw, not headroom. It also closes a hole: a fourth caller could
>   have passed a bare logo with no chevron and nothing would have noticed.
>   `MenuTrigger` is deleted and its row moves into `Menu.module.css`.
> - **The `?` wiring is a store, not a ref.** Each page declared a
>   `useRef<MenuHandle>`, passed it down, and handed
>   `() => ref.current?.open()` to `useAppShortcuts` — four lines, three times,
>   for one app-level key. `<PageHeaderMenu>` owns the ref and registers itself
>   in `common/lib/menu/pageMenuStore`; **`useAppShortcuts` loses its first
>   parameter**, which is the real measure of the change.
>
> A component could not own the ref privately, which is what forced the store:
> `useAppShortcuts` takes the opener as an argument AND returns the lookup
> dialog the page must render, so the page could only get the opener back out
> through a ref by another name.
>
> **A missing menu stays a no-op.** GamePage drops its menu while paused, and
> `?` then found `ref.current === null`; it now finds nothing registered. Same
> behavior, and now covered by a test that says so.
>
> NOT folded into `<PageHeader>`, which takes children: the club page and a game
> put their own marks beside the menu, and a game fills the `right` slot too.

**F13 · `frame-to-clubpage` · `.frame` — already carried forward to the `club-page` area**, recorded
here only so the homepage's shape is on file when that area opens. Home's is the
simplest of the three declarations (`width: 100%`, flex column, `gap: 1rem`) and
the only one bounded by `max-height` rather than `height` — because its body is a
content-sized card, and a fixed height would strand a two-club list at the top of
a full-viewport box.

> resolution: deferred to `club-page` by §7's carried-forward list

### Behavior

**F14 · `empty-clubs-is-a-fault` · DONE · A failed clubs fetch is displayed as "You haven't joined a club yet."**
The load logs to the console and returns, leaving `clubs` empty, which renders
the empty-state sentence. The comment above that branch says it exists so a fetch
failure or RLS regression "shouldn't render a blank list silently" — but what it
renders instead is a sentence that states something false. The app has a fault
surface (`server-error-keys`, the pill and the fault modal) and this path uses
none of it.

> **resolution (Joel, 2026-08-22): both empty cases are FAULTS.** *"It is a
> site-invariant that every member has a solo club; we need no flexibility in
> the app for that: if you have no clubs, something is very wrong. The load
> failed or the database deleted your solo club. Both are faults."*
>
> Built as seven decisions, in the order they were agreed:
>
> 1. **The failed fetch** goes through the existing path — `faultMessage(error,
>    'clubs')` then `presentFault(...)` — which also writes the `[db]` line the
>    modal's diagnostics repeat. No new `ERROR_COPY` key: a transport failure
>    already classifies as a fault, and the table is frozen behind
>    `plans/error-system.md`.
> 2. **Zero rows after a SUCCESSFUL fetch** has no server error to classify, so
>    it is a hand-raised `presentFault`, with a diagnostics line in the house
>    shape (`clubs — key=no-clubs detail="…" — <stamp>`) built from the shared
>    `logStamp`.
> 3. **Its words**, proposed by Claude and approved by Joel: *"Something's
>    wrong with your account — you should always have at least your own solo
>    club."*
> 4. **The page keeps a line behind the modal, and its only job is to be true**
>    — "Your clubs couldn't be loaded." when the fetch errored, "No clubs found
>    for your account." when it succeeded and returned nothing.
> 5. **The check lives in the load callback, not in render.** `clubs` is `[]`
>    before the first fetch answers, so a render-time test would fault on every
>    page load.
> 6. **It fires on EVERY load, not once per mount.** Joel: *"their account is
>    hopelessly fucked. showing it every time is simplest."*
> 7. **A vitest test is the natural first case for F21**, since this is all
>    stub-the-fetch-and-assert work.
>
> **A third state had to exist, and finding that out is what point 5 is really
> about.** The page tracked only `clubs`, so "no clubs" and "not asked yet" were
> the same value — which is why the old sentence was wrong in TWO moments, not
> one: it also claimed you had joined no clubs during the half-second before the
> first fetch answered. So the component now holds `load: 'loading' | 'loaded' |
> 'failed'`, and the muted line renders a blank while loading rather than
> vanishing, so the answer does not push the list down when it arrives.

**F23 · `fault-modal-reaches-home` · DONE · The fault modal has to reach the homepage, and it already does**
(raised by Joel, 2026-08-22, when F14 was decided: *"faults get a modal, so
we'll need to get the modal-fault set up as part of this"*). Worth its own
number because the homepage is a SHELL page, and shell pages have twice been
caught missing something the game pages load — `theme.css` ships in PlayArea's
lazy chunk, so `SetupForm` and Help had to import their own or every token
resolved to nothing, silently.

> **resolution: nothing to build — verified, not assumed.** Two halves, both
> checked by reading the code rather than by trusting the mount:
>
> - **The host renders on `/`.** `<FaultModal />` sits in `App.tsx` after the
>   auth + claim-handle gates and outside the route switch, so it is on every
>   real page.
> - **Its styling is not in a lazy chunk.** `FaultModal.module.css` reads
>   exactly two tokens, `--chrome-fault-color` and `--page-text-muted-color`,
>   and both are declared in `themes/daylight.css`, which `loadTheme()` imports
>   eagerly at startup — the theme chain is global, unlike a game's brand
>   anchors.
>
> So the homepage calls `presentFault` and nothing else is wired.
>
> **And then it was tested for real, which is Joel's call and the reason this
> finding was worth a number:** *"'faults show up in real browsers' is a
> critical test and we can only be certain as an e2e test. I'd give it a name
> that says that it's more about faults than the homepage; it's just here that
> we're hitting it."*
>
> **`e2e/faults.e2e.ts`**, named for the fault modal rather than for this page,
> two cases:
>
> 1. **The wiring**, via `window.pupfault()` — the console trigger `FaultModal`
>    installs, since a real fault is a bug or a dead network and there is no
>    honest UI path to one on demand. Asserts no modal BEFORE (a modal that were
>    always up would pass everything after it), then the canned text and its
>    diagnostics line on screen, then Close dismissing it with the page usable
>    behind.
> 2. **A real fault the app raises itself** — F14's empty club list. Reaching it
>    means breaking the site invariant from outside the app, so
>    `removeAllClubMemberships` (new fixture, psql like `deleteUser`) strips the
>    user's memberships and leaves the profile: they sign in fine and the clubs
>    query comes back empty. Asserts the fault text, its `key=no-clubs`
>    diagnostics, and — behind the dismissed modal — that the page says "No
>    clubs found for your account." and never the old sentence.
>
> **Both were verified by planting.** Rendering `<FaultModal>` conditionally
> false in `App.tsx` reddens BOTH cases, which is what proves the browser half
> rather than the store half; disabling the zero-clubs `presentFault` reddens
> only the second. Restored, and green after.
>
> One locator note worth keeping, since it cost a run: the panel's `×` and the
> modal's button carry the SAME accessible name, so `getByRole('button', {name:
> 'Close'})` is ambiguous. The spec takes `button.primary` — a global class from
> `patterns/button.css`, not a module hash, so it cannot rot the way F3 did.

**F15 · `focus-on-every-refetch` · DONE — folded into F38 (`selection-lists`), then built 2026-08-24 · `focusListOnLoad` re-runs on every length change, not on load.** Its
dependency is `[ordered.length]`, and the club list is realtime — a friend adding
you to a club re-runs it. It only takes focus when `document.activeElement` is
`null` or `<body>`, so the blast radius is small, but the name promises less than
the effect does.

> **resolution: folded into F38 (SelectionLists), 2026-08-22.** WHEN a list
> takes focus, and on what, is the component's decision — not something each
> page re-derives with its own effect and its own dependency array. The bug
> stands; it just gets fixed once, somewhere else.

**F25 · `is-solo-column` · DONE — `common.clubs.is_solo` ships · The `=` convention is a database convention, so the database should
own it** (Joel, 2026-08-22, on being asked whether the ordering belonged in the
DB or the component: *"it removes 'FE needs to know the = convention', which is
arguably more of a db thing"*).

The page did the date ordering in SQL and the solo-first partition in a
`useMemo` afterwards, which is two sort orders in two languages — and it is
what created F16, since partitioning produces a SECOND array and therefore a
second name for one list.

> **resolution: built — `common.clubs.is_solo`, a stored generated column
> (`handle like '=%'`).**
>
> The alternatives were considered and named: PostgREST cannot `order` by an
> expression, so the DB half needed either this column, a view/RPC (more
> machinery than one list is worth), or ordering by `handle` and hoping `=`
> sorted first — which is wrong under the default collation, where punctuation
> is largely ignored at the primary level, so `=joel` would sort among the
> `j`s. Claude's own preference had been to sort in the load callback and keep
> the schema untouched; Joel took the column for the better reason, that the
> convention does not belong in the FE at all.
>
> **What it changed:**
>
> - `20260822000000_clubs_is_solo.sql`, a FORWARD migration — the recent
>   precedent, and an in-place edit would never reach prod. STORED rather than
>   VIRTUAL (PG17 has no virtual, and `handle` is a primary key that is never
>   updated, so it is computed once per club forever).
> - The query is `select handle, name, is_solo` +
>   `order=is_solo.desc,created_at.desc`. Postgres sorts `false` before `true`,
>   so descending puts solo on top.
> - **The `useMemo` is gone, and with it F16** — one array, one name, one
>   order. The keyboard cursor, the ring, the Enter target and the rows all
>   index `clubs`, which now arrives in display order.
> - The badge reads `c.is_solo`. The homepage no longer contains the string
>   `'='` anywhere.
> - `src/types/db.ts` regenerated (`npm run types:gen`).
>
> **Three pgTAP assertions**, plan 23 → 26: an EQUIVALENCE over every club in
> both directions (a generation expression that just said `true` would pass a
> one-sided check), the count for the three fixture users, and that a caller
> cannot write it. The last one corrected a guess — the SQLSTATE is `428C9`
> (`generated_always`), not the `42601` first written, and the test is how that
> was found rather than the docs. The equivalence arm was verified by planting:
> swapping the expression to `handle like '#%'` inside a rolled-back
> transaction makes it report 3 disagreements where the real one reports 0.
>
> **Local was reset rather than patched by hand** — Joel: *"local can be reset
> whenever we want (please read this carefully, this only applies to local, NOT
> production. production data is precious)."* `gmake db ENV=local` then
> `gmake db-seed ENV=local`.
>
> **Left for their own areas, and Joel agrees it should not stay that way:**
> `ClubPage.tsx:115` and `SetupGameModal.tsx:208` still test
> `handle.startsWith('=')`, and `common.sql` + the setgame migration write
> `like '=%'` in SQL. *"Fine for now, but we should get '=' stuff out of FE
> when we get to them."* Filed on the plan's carried-forward list.

**F16 · `clubs-vs-ordered` · DONE · The empty branch tests `clubs`; everything else reads `ordered`.**
`clubs.length === 0` gates the message while the keyboard, the ring and the rows
all index `ordered`. They are the same set — `ordered` is a partition of `clubs`
— so this is one name too many, not a bug.

> **resolution: dissolved by F25, not fixed.** `ordered` existed only to move
> solo clubs to the front; once the database sorts them there, the second array
> has no reason to exist and there is one name again. Nothing was renamed —
> the thing that needed two names stopped happening.

### Comments and docs

**F17 · `archaeology-comments` · DONE · Four archaeology blocks**, which CLAUDE.md rules out ("how it used to
work" is not useful): `HomePage.tsx:41-48` (solo clubs "used to be hidden"),
`178-191` (the header "sat INSIDE the card at first", an "even earlier attempt"
hung it off the wordmark), `214-217` (the email that "used to sit under this"),
`292-297` (the row "used to end with" the club's URL). Each block also carries a
live reason for the current arrangement, so this is a trim, not a delete — and
it is Joel's call which sentence in each is the load-bearing one.

> **resolution (Joel, 2026-08-22): *"all these examples are junk; remove"*.**
>
> The first attempt only changed the TENSE — "the row used to end with the URL"
> became "no URL on the row" — and Joel rejected it with the rule that makes
> this finding decidable: **a comment explains the code that is THERE.** *"The
> right comment for this is NO COMMENT AT ALL. Comments are for 'explain this
> code' and there's LITERALLY NO CODE HERE for a URL."* Same for the missing
> email, and same for the menu not hanging off the wordmark — *"we don't hang
> the menu off the wordmark, why should we explain why we don't."*
>
> So an absence is not a subject, whatever tense it's written in. What each
> block kept is only what points at code on the screen:
>
> - **the docstring** states that solo clubs are listed alongside regular ones,
>   badged and sorted to the top — which is what `ordered` and the badge do;
> - **the header comment** keeps that this is page chrome and that it is a
>   SIBLING of the card, which is why `<PageHeader>` sits where it does in the
>   tree. The menu paragraph is gone entirely;
> - **the greeting comment** keeps why the disc leads and the name precedes the
>   salutation, which is the order of the JSX. The email paragraph is gone, and
>   so is the "where 'Welcome, joel' buried it" clause — that compared against a
>   version that does not exist;
> - **the row comment is gone**, all of it. `<span>{c.name}</span>` plus a
>   conditional badge needs no gloss.
>
> **Two more went, by Joel's own hand, and they widen the rule past absences.**
>
> - The badge's "small and outlined, never the fully-round feedback pill" is
>   gone: *"we don't need to describe what a badge looks like; that becomes
>   stale."* So a comment does not restate what a stylesheet says either —
>   `badge.css` owns the shape, and a second copy in a docstring is a copy that
>   rots. This reverses part of F2's resolution from earlier the same day; what
>   survives of it is that the row is marked by a BADGE and what a badge is FOR
>   (a one-word label saying what kind of thing this is), which is the part
>   `.badge` cannot say for itself.
> - The docstring's whole first-paragraph tail — "Per-gametype 'Start X'
>   affordances live on each club's own page … so this page doesn't carry those
>   buttons" — is gone. Same shape as the others: buttons that are not here.
>   (It was also the sentence F19's stale docstring in `games.ts` echoed.)

**F18 · `stale-solo-club-doc` · DONE · `docs/common.md:284` describes a homepage that isn't there.** It says a
solo club is "visually distinguished (star icon, accent background tint, 'Solo'
badge)". There is no star and no tint; the badge is the whole treatment.

> **resolution (Joel, 2026-08-22): fixed.** The sentence now reads "marked by a
> 'Solo' badge on the row and always sorted to the top" — the star and the tint
> are gone, since neither was ever built.

**F19 · `stale-playercountfits-doc` · DONE · `games.ts:801` names HomePage as a consumer it no longer has.**
`playerCountFits`'s docstring says it is used by "ClubPage (Start button
enable/disable) and HomePage (which solo-game buttons to surface)". HomePage
stopped carrying per-gametype start buttons — its own docstring explains why —
and does not import `games.ts` at all.

> **resolution (Joel, 2026-08-22): fixed, and it names both REAL callers rather
> than one.** Grepped: `StartGameButtons` (disables the gametypes that don't fit
> the club's member count) and `ClubPage`'s Enter handler (re-checks before
> starting, so the keyboard no-ops on a disabled button exactly as a click
> does). The docstring had ClubPage but not the component that actually paints
> the buttons.

**F20 · `stale-swallowtab-link` · DONE · `useSwallowTab`'s docstring sends the reader to the wrong page.** It ends
"`HomePage` (whose club list is arrow-driven — see docs/ui.md → ClubPage)". The
homepage's own list is documented under another page's heading.

> **resolution (Joel, 2026-08-22): fixed — it points at
> `docs/keyboard-shortcuts.md` → "Club page and home page" now.** That file has
> a row for the home club list's arrow keys, which is what the sentence is
> about; `ui.md`'s treatment of the list is "Lists of things you can go into"
> and is about the shared `.item-list` LOOK, not its keyboard.

### Tests

**F21 · `homepage-no-vitest` · HomePage has an e2e test and no vitest test, and it should have both.**
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

### Lists

**F24 · `empty-list-keeps-box` · DONE 2026-08-24, on the second pass · An empty list keeps its BOX, and says so inside it — the homepage is
the one place that doesn't** (Joel, 2026-08-22). *"We should be consistent and I
think 'keep the box, show the empty message inside' is clearer."*

The two shapes ship side by side today, and the pattern file already knows:

- **ClubPage does it inside**, in both lists. `.item-list` stays, and the
  message is a `<p class="muted item-list-empty">` within it — "No games yet.",
  "No games available in this club.". `list.css` gives `.item-list-empty` its
  own padding for exactly this.
- **HomePage replaces the whole list** with a bare `<p class="muted">` sibling —
  no frame at all. `list.css:80` records that as a deliberate alternative: *"A
  list may instead be replaced wholesale by a sentence outside the frame, which
  is what the homepage does … That is a different choice — no empty box."*

So this is not drift that crept in; it is two answers, one of which Joel has now
picked. **Fix it when this area takes the list work, not before.**

Three things to carry into that sitting:

1. **F14's two sentences move inside the box** — "Your clubs couldn't be
   loaded." and "No clubs found for your account." are the text this finding
   relocates. They were written into the existing `<p>` and stay as they are.
2. **The homepage's container is a `<ul>`, ClubPage's is a `<div>`.** A `<p>`
   inside a `<ul>` is not valid markup, so the empty message becomes an `<li>`
   or the container stops being a list element. ClubPage never had to answer
   this.
3. **`list.css`'s comment blesses the exception** and has to go with it, or the
   pattern file will still be describing the choice we just dropped.

> **resolution: the RULE stands — keep the box, put the message inside — and
> the WORK folds into F38 (SelectionLists), 2026-08-22.** An empty list still
> showing its frame is something a SelectionList does, not something three pages
> each remember to do. The three notes above survive as requirements on it.
>
> **Done 2026-08-24, on the second pass.** F38's first pass shipped the frame
> but left the homepage's `clubs.length === 0 ?` branch standing, so the page
> still replaced its list with a bare sentence — note 1 above, missed. Joel
> caught it. All three notes are now satisfied: the two sentences moved inside
> as the `empty` prop (and the loading blank with them, so all three no-rows
> states are one shape), the container is a `<div>` so the `<p>` is valid
> markup, and `list.css` is deleted rather than needing its comment amended.
>
> The heading of this finding is worth reading literally: "the homepage is the
> one place that doesn't" describes what SHIPPED, never what was wanted. It
> reads as a rule if you skim it, which is how the exception got carried
> forward into F38's plan as though it were the decision.

### Layers

**F22 · `z-ladder` · DONE — the ladder is built · The homepage is the first surface to need the z- vocabulary, and it
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

**F22.1 · `satellite-host-slot` · DECIDED, NOT BUILT · How a satellite names its host.** §20 says a
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

### Basic page structure — the second subject, added 2026-08-22

Joel added this to the area after the first pass: *"the stuff that is shared
across all pages (or SHOULD be shared, but it is copied or
different-without-distinction), like 'no scrolling', page-height, etc."*

**Scope, as he bounded it:**

- **The header is a BLACK BOX.** *"There *is* one, but we've got enough in this
  list without going into stuff like where the logo is in it. For now, we only
  care where the header is (if there is one)."*
- **ClubPage and GamePage are INVESTIGATED, and investigating is not
  FINDING.** Their stamps do not move. `cs-found` means *"we came across this
  organically while exploring that area"* — it is the mechanism that makes sure
  a page gets audited by SOME area, so it has to mean something. Neither page is
  used to make the homepage; they are read here as evidence, which is a
  different act. And if a finding suggests a rename worth rolling forward onto
  them, *"we always discuss that explicitly."*
- **Answering a question `club-page` was carrying is fine.** *"Changing these
  now will change how club-page works — that's not a problem. club-page is not
  retro."* So the four rows on the plan's carried-forward list that this subject
  covers (the page shell, the viewport-fit chain, `.frame` → `.page`) get
  ANSWERED here, and that area inherits the answers.
- **`/palette` and `/font` are OFF-TABLE** (Joel, 2026-08-22): they *"have no
  relationship to the real pages in the app"*, so nothing they do is evidence
  about how the app looks or works. They appear in the table below because they
  are routes; they do not get a vote.
- **GamePage is FRAGILE, and that is a standing caution, not a finding.** Joel:
  *"it needs to handle complex layouts and has very specific stuff for mobile,
  far more than we worry about for homepage/clubpage. It may be that this keeps
  gamepage from using things from the other two. We need to be extra careful and
  thoughtful; we've spent a lot of time getting gamepage layouts tuned."* So
  where a finding below says GamePage differs, "differs" is the measurement and
  NOT the recommendation — the question is always whether the difference is
  earned, and the default answer for a tuned surface is yes.
- **Out of bounds:** the play surface's own sizing, the InfoSheet, dialogs,
  panels, chat — anything below page → body → card.

**The eight pages, measured.** Every route's outermost element:

| page | outer element | width | viewport bound | header | |
|---|---|---|---|---|---|
| HomePage | `styles.frame` | `width: 100%` | **max-height** `calc(100svh - 2 * var(--page-padding-y))` | yes |
| ClubPage | `styles.frame` | `width: 100%` | **height**, same expression | yes |
| GamePage | `styles.frame` | *(none)* | **none — see F29** | yes |
| CreateClubPage | bare `.card` | 480px | none | no |
| LoginScreen | bare `.card` | 480px | none | no |
| ClaimHandleScreen | bare `.card` | 480px | none | no |
| PalettePage | `.card` + `.page` | 72rem | none | no | *(dev page — off-table)* |
| FontPage | `.card` + `.page` | 60rem | none | no | *(dev page — off-table)* |

**F26 · `three-wrappers` · DONE 2026-08-23, with F33 · Three `.frame` rules, and only one of the differences is a decision.**

| | home | club | game |
|---|---|---|---|
| `width: 100%` | yes | yes | **no** |
| flex column | yes | yes | yes |
| `gap` | `var(--spacer-2)` | `1rem` | `1rem` |
| bound | `max-height: calc(…)` | `height: calc(…)` | none |

The bound's `max-` vs bare is a real distinction and is already written down
(`ui.md` → Page-height fits the viewport): home's body is a content-sized card,
so a fixed height would stretch it and strand a two-club list at the top of an
empty box. The other two rows are not distinctions. The gap is the same value
said two ways — home converted to the spacer vocabulary, the others did not —
and `width: 100%` is load-bearing (F27), so its absence on GamePage is either a
bug or an undocumented dependency.

**Not discussable until F35 settles the NAME** (Joel, 2026-08-22: *"before we
even discuss this, 'frame' needs a clear name. 'frame' around what?"*). Three
rules that share a bad name look like three copies of one thing; whether they
ARE is the question, and it cannot be asked in a word that means nothing.

> **resolution (Joel, 2026-08-23): BUILT — one pattern, in
> `common/patterns/page.css`, and it turned out to cover six pages rather than
> the three that had a wrapper.**
>
> Once F33 (`wrapper-name`) settled the word, the question could be asked, and
> the answer was that the three rules WERE three copies: `width: 100%` did
> nothing (F27 `width-100-undeclared`), the gap was the same value written two
> ways, and the bound differed only in `max-height` vs `height` — a difference
> Joel then removed by ruling that the homepage may fill like the club page and
> looking at it (*"it looks fine"*).
>
> **The pattern, three classes:**
>
> - `.pageHeaderAndMainArea` — the wrapper. The bound lives here:
>   `height: calc(100svh - 2 * var(--page-padding-y))`.
> - `.pageMain` — `min-height: 0`, the width, the centering.
> - `.pageMain-fills` — `flex: 1` plus the flex column.
>
> **THE RULE:** the page is bounded and a designated part inside it scrolls,
> never the document. **And one conditional, which is mechanical rather than a
> taste:** a pageMain FILLS when it contains a scroller and HUGS when it does
> not — a scroller needs a definite height to scroll against, and a short form
> should not sit in a viewport-tall box. The flex column rides with `fills` for
> the same reason: filling is only ever done to hand height downward.
>
> **The three card-only pages gained the wrapper they never had**, which is what
> makes them ordinary rather than special. Measured before deciding: at 375×667
> and 360×640 every non-game page fits, the tallest being ClaimHandleScreen at
> 541 of 640 — so they need no bound of their own and no scroller.
>
> **The club page then needed a second pass, and it is the more interesting
> half.** Its first conversion gave `.pageMain` to four sibling elements — the
> club name, the tab bar, the mobile filter row, the columns — on the grounds
> that they shared a well. Joel: *"that is a completely wrong structure. There
> is one pageMain; this goes around the 'main part of the page'. It is nonsense
> otherwise."* He is right in a way worth keeping: **sharing a width is not
> being the same thing**, and four elements each claiming to be the main part
> means the page has no main part — the class degenerates into "an element that
> happens to be 1000px wide". There is now one `<main>` holding all four, and
> the old `<main>` (the two-column body) went back to being a div: it was never
> the main part of the page, only the biggest piece of it.
>
> **GamePage takes none of this**, per F28 (`gamepage-bounds-itself`).
>
> Verified at each step rather than at the end: the club well is 1000@140 at
> 1280×900 and 367@4 at 375×667 with its children full width inside it, the
> games list 717 tall holding 715 of content, and neither size scrolls.

**F27 · `width-100-undeclared` · DONE · `width: 100%` is load-bearing, and only two of the three frames say
it.** `body` is `display: grid; place-items: start center`, so `justify-items`
is `center` and a grid item is sized to its CONTENT, not stretched. Home and
club therefore need `width: 100%` to fill the page's column; GamePage does not
declare it, so its width is whatever its content happens to be. It looks right
today only because a play surface is wide. Whichever way this is settled, it
should be settled once, where the centering is declared.

**Read against the GamePage caution above** (Joel: *"probably related to my
point about gamepage is fragile"*). Content-width may be exactly what a play
surface wants — a board that sizes itself and a page that shrink-wraps it is a
coherent design. What is not defensible is that it is nowhere written down, so
nobody can tell the design from the omission.

> **resolution (2026-08-23): the FINDING was wrong. `width: 100%` is redundant
> on all three, and GamePage is the only one not writing something that does
> nothing.**
>
> The reasoning behind the finding skipped an element. `body` does center its
> grid item — but its child is `#root`, which is `width: 100%` itself, and a
> block-level flex container fills its containing block regardless. **Measured
> rather than argued, after getting it wrong once**: a frame with `width: 100%`
> and one without are both 1248px in a 1280px viewport, at the same x.
>
> So there is no undocumented dependency to write down, and nothing to add to
> GamePage. What shipped instead is a subtraction: **the homepage's frame drops
> the declaration**, with the measurement recorded at the rule so the next
> reader does not re-derive the same wrong conclusion. ClubPage's copy is
> described, not touched — not this area's file.
>
> Worth keeping for its own sake: the finding was stated with confidence and
> was false, and the thing that caught it was measuring a claim about layout in
> a browser rather than reasoning about the cascade.

**F28 · `gamepage-bounds-itself` · DONE · GamePage skips the page-level bound entirely, and pays for it with a
hand-measured lump.** Home and club COMPOSE their bound from the page's own
parts — `100svh` minus twice `--page-padding-y`. GamePage's frame has no bound;
the fit happens one level down, in `PlayArea.module.css:36`:
`height: calc(100svh - var(--game-chrome-height))`, where
`--game-chrome-height: 5rem` is a single number that bundles the header, the gap
below it AND the body's bottom padding, described in `base.css` as "≈ 4.8rem,
set a hair higher to stay off the bottom edge".

So the same question has two answers, one composed and one measured — and the
measured one silently desyncs if `--page-padding-y` ever changes, since nothing
connects the 5rem to it. (`--game-chrome-height` is also on the list of
constants owed a re-measure after the font switch.) The play surface's own
sizing is out of bounds here; where the page's bound LIVES is not.

**Same caution, and it bites harder here** (Joel: *"same"*). `--game-chrome-
height` is a number that was TUNED, over a long time, against real game layouts
on real phones. The finding is not "compose it like the other two" — it is that
one number silently stands in for three, so a change to any of the three moves
home and club and leaves the game page wrong. A composed expression that
evaluates to today's 5rem would be a fix; a re-derivation that moves a game
board by 3px would be a regression.

> **resolution (Joel, 2026-08-23): GamePage keeps bounding itself, and the
> difference is deliberate — but the token owes an honest derivation.**
>
> **Why it is not drift.** Home and club bound the page, so their pageMain takes
> what flex leaves it. The game route cannot work that way, because the boards
> do not size themselves from their parent — they compute from the VIEWPORT: 20
> declarations across eleven games, all shaped `calc(100svh -
> var(--game-chrome-height) - <tuned rem>)`. CSS `calc()` cannot reference a
> parent's computed height, so bounding the page and giving the play area
> `flex: 1` would produce a correctly sized BOX with nothing for those twenty
> formulas to compute from. That is not a rename; it is re-tuning eleven games'
> board math.
>
> **What should still change, without moving a pixel.** `--game-chrome-height`
> is a hand-measured `5rem` standing in for parts that all have names:
> `--page-header-height` (2.5rem) + the wrapper's gap (1rem) + twice
> `--page-padding-y` (1rem) = **4.5rem**. Its own comment says the measurement
> was "≈4.8rem, set a hair higher to stay off the bottom edge". So about half a
> rem is unaccounted for by the names, and until it is composed, a change to
> `--page-padding-y` silently moves home and club and leaves eleven boards
> wrong. Compose it only after measuring where the residue comes from, so the
> number stays exactly what it is today.
>
> **And the standing condition, in Joel's words (2026-08-23):** *"we need to
> quadruple check the gamepage layout; it's the most sensitive part of the
> codebase. Sneeze wrong and the page starts scrolling."*

**F29 · `which-pages-never-scroll` · DONE · The never-scroll invariant binds on two pages out of eight, and nothing
enforces it.** There is no `overflow: hidden` anywhere — deliberately, per
`ui.md` → Rolling out ("not a global `body { overflow: hidden }` bomb"), so a
page that stops fitting simply scrolls, and nothing says so. Five of the eight
pages declare no bound at all. Some of those are fine (a login card is short),
and at least one is not: `/palette` is long and scrolls today. The finding is
not "make every page fit" — it is that the invariant currently has no way to be
checked, and no way for a page to declare that it opts out.

**And the finding has to answer WHICH pages should get it** (Joel, 2026-08-22),
because "all of them" is not obviously right and neither is the status quo. The
eight, with what each one is:

| page | fits today | should it never scroll? |
|---|---|---|
| HomePage | bounded (max-height) | yes — it is bounded |
| ClubPage | bounded (height) | yes |
| GamePage | via the play surface | yes, and it is the page the rule exists FOR |
| CreateClubPage | short form, no bound | ? — a real app page with no bound |
| LoginScreen | short form, no bound | ? — pre-auth |
| ClaimHandleScreen | short form, no bound | ? — pre-auth |
| PalettePage · FontPage | long, scrolls | off-table (dev pages) |

The three question marks are the actual decision, and they are the same three
pages F32 is about — a form that is short today has no bound, which means
nothing tells anyone what happens when a validation message or a longer roster
makes it tall.

> **resolution (Joel, 2026-08-22): the three question marks are answered by
> answering what those pages ARE, not by giving each a bound.**
>
> - **CreateClubPage stops being a page** — it becomes a modal (F36), and a
>   dialog owns its own height rules, so the question does not arise.
> - **The two pre-auth screens are `CardOnlyPage`s** (F37), and whether that
>   type has a viewport bound is one decision made once, in the type, rather
>   than a per-page omission.
> - **Home, Club and Game** stay as measured: bounded, bounded, and bounded one
>   level down (F28). Game is the page the rule exists for.
> - **`/palette` and `/font`** are off-table.
>
> What is left of this finding is the enforcement half, which moves to F37 and
> F33: there is still no way for a page to DECLARE that it fits, and nothing
> notices when one stops fitting.

**F30 · `pagemain-widths` · DONE · Four widths for "how wide is a page's body", with no relationship
between them.** `.card` is `480px` — the only one in px, in a rem app —
ClubPage's content well is `62.5rem`, PalettePage is `72rem`, FontPage is
`60rem`. Two of those exist only to override `.card`: both pages write
`cls('card', styles.page)` where `styles.page` is nothing but a `max-width`,
because `.card` bundles a LOOK (surface, border, radius, padding) with a WIDTH,
and they want the look at a different width.

**Discount the two dev pages** (per the scope note): their widths are not
evidence about the app. What is left is still a finding — `.card` at `480px`
against ClubPage's `62.5rem`, one in px and one in rem, with nothing saying they
are the two answers to the same question — and the OVERRIDE pattern the dev
pages use is evidence about `.card`'s shape even though their numbers are not:
wanting the look at another width is apparently normal, and `.card` cannot
express it.

> **resolution (Joel, 2026-08-23): ONE token, not two — and the finding's
> "four widths" was really one width, one bespoke number, and one page that
> caps nothing.**
>
> Measured at 1280 and 1600 before deciding: LoginScreen, ClaimHandleScreen,
> CreateClubPage and HomePage are **all 480px**, at both sizes. They looked like
> four separate decisions because they are four separate pages with four module
> files — but the width had only ever been declared once, on `.card`. Joel had
> expected them to differ; they do not.
>
> - **`--pageMain-width: 480px`** is the DEFAULT — *"the width when we don't
>   need a custom width; if we had a new page, it would probably be there"*.
> - **The club page's 1000px is BESPOKE** — *"it's not 'wide' in a named way, it
>   was particularly chosen for clubpage"* — so it sets the token on itself and
>   the rules below it read one number. There is deliberately no second tier
>   called "wide", which would be a category invented for one member.
> - **GamePage caps nothing.** Its content width IS the page's.
>
> **And the width left `.card` entirely**, with the centering, because they are
> one decision: a capped block sits LEFT unless it also has auto margins, which
> is why `.card` was carrying both. `.card` now carries only the surface — the
> bundle of look-plus-width is what let one class stand in for a page on five
> screens (F35 `card-and-frame-names`).
>
> **On a phone none of this exists.** Measured: every page is 367@4 at 375 wide
> and 352@4 at 360 — full-bleed to within the body's 4px — so both caps are
> inert below ~488px of viewport.

**F31 · `centering-said-4x` · DONE · Centering is declared three or four times over.** `body` centers its
grid item (`place-items: start center`); `.card` also says `margin: 0 auto`;
FontPage's `.page` says `margin: 0 auto` again; ClubPage's content well says
`margin-inline: auto`. At most one of these is doing work at any given moment,
and which one is not obvious from any of them.

> **resolution (2026-08-23): only ONE of the four was redundant, so the
> finding's premise — "at most one is doing work" — was backwards.** Checked one
> at a time:
>
> - **`body`'s `place-items: start center`** — a no-op in Chromium, since the
>   child it centers is `#root` at `width: 100%`. **Left alone anyway.**
>   `PlayArea.module.css` documents a WebKit-only bug whose mechanism is this
>   exact declaration: `justify-items: center` sizes the grid item to its
>   content's MAX-CONTENT width, and a WordList's column-major grid leaked
>   ~9500px through it and dragged the board off-screen in Safari — which is why
>   `.layout` pins its own width. A Chromium measurement is not evidence about
>   that, so removing it needs a real Safari. The rule now says so at the
>   declaration.
> - **`.card`'s `margin: 0 auto`** — load-bearing. On the homepage the card is a
>   flex item under `align-items: stretch` capped by `max-width`, and without
>   the auto margins it sits left.
> - **ClubPage's `margin-inline: auto`** — load-bearing, same shape.
> - **FontPage's `margin: 0 auto`** — the only genuine duplicate: that page
>   writes `cls('card', styles.page)`, so it was restating what `.card` already
>   said. **Removed**, along with a `width: 100%` beside it that F27
>   (`width-100-undeclared`) showed does nothing.
>
> So the one rule Joel asked for is already the arrangement: **the pageMain
> centers itself**, because it is the thing with a max-width and therefore the
> thing with room to be centered in. What was wrong was not four rules fighting
> — it was one page repeating a shared class, and a fourth declaration that
> looks dead and is a Safari landmine.

**F32 · `pages-that-are-just-a-card` · DONE · Five of the eight pages have no page structure at all — they ARE a
card.** So the contract this subject is about ("an optional header above a
centered, width-bounded body") is expressed nowhere: on three pages it is three
near-copies of a module class, and on five it is absent, with the card standing
in for the page. Adding a header to any of those five today means writing a
fourth copy of `.frame`.

**Joel's suspicion — "these are mostly either error pages or not-yet-
authenticated pages, right?" — is right about four of the five, and the fifth
is the interesting one.** Checked:

| page | what it is |
|---|---|
| `LoginScreen` | pre-auth |
| `ClaimHandleScreen` | pre-auth (signed in, no profile yet) |
| `PalettePage` · `FontPage` | dev pages, off-table |
| **`CreateClubPage`** | **a real, authenticated, everyday app page** — you reach it from the homepage's "+ New club" |

So there IS a fully in-app page with no header and no bound, and it is one click
from the page this area is auditing.

**And the same shape has a fourth job nobody named: transient states.** `.card`
is also what every loading and error screen renders as — `App.tsx:90` "Loading…",
`ClubPage:758` "Loading club…", `GamePage:428` "Loading game…", `GamePage:450`
"Unknown game type.", plus `PlayAreaErrorBoundary` and two more. Those are not
pages with a body; they are a sentence in a box where a page will be.

**This may want its own area** (Joel: *"we should still come up with a standard
for these. Depending what we decide, this might introduce a new 'area'"*). The
candidate scope is coherent and it is not the homepage's: the pre-auth pair, the
transient states, and whatever a headerless in-app page like CreateClubPage
turns out to be.

> **resolution (Joel, 2026-08-22): the five split three ways, and each way has a
> name now.**
>
> - **CreateClubPage → a modal** (F36). The one genuinely in-app case, and it
>   was never a design decision — it is one of the first things written in the
>   app.
> - **LoginScreen + ClaimHandleScreen → `CardOnlyPage`** (F37), a named page
>   TYPE rather than five pages missing their structure.
> - **`/palette` + `/font`** — off-table.
>
> So "the contract is expressed nowhere" narrows to one true statement, which
> F33 carries: the page element still has no name of its own. And the transient
> states — the seven loading/error boxes — are none of these three and are F35's.

**F35.1 · `card-is-white` · DONE — recorded, nothing to build · What a card is, and what makes the homepage white** (Joel,
2026-08-22). Settled alongside F37's definition and recorded here because this
page is where it shows:

- **A card has a white background** — the app's default background, now
  `--default-bg-color` (plan §6.6 → Backgrounds).
- **Which is what makes the homepage's pageMain white**: the card IS the
  pageMain there. The pageMain is not white in its own right, and on ClubPage
  and GamePage it paints nothing at all.

That distinction is the correction this whole thread produced. The white was
read first as pageMain's, which would have named the app's most-shared color
after the one page in three where it applies.

> resolution: recorded, nothing to build

**F35 · `card-and-frame-names` · DONE — `card` is Bootstrap's sense · `frame` and `card` are both vague names, and `card` is the worse of
the two.** *(Half answered: `card`'s meaning is settled by F37 — Bootstrap's
sense, a bordered section of a page. `frame`'s name is still open, in F33.)* Raised by Joel, 2026-08-22, on reading the audit: *"you talked about
'frame' and 'card' and those are ridiculously bad names; complete vague. we
discussed these kind of names."*

**Why the audit missed it, since that matters more than the finding.** `frame`
was flagged — but only because the plan's carried-forward list had already
flagged it, so what looks like a naming pass was an inherited one. The same
question was never put to `card`, and `card` was in front of me the whole time:
F30 says it bundles a look with a width and F32 says it stands in for a page,
which are two SYMPTOMS of a name that does not say what the thing is for. I
described both symptoms and did not name the cause.

**`card` measured: fourteen call sites, four different jobs.**

| job | sites |
|---|---|
| the page's whole body | HomePage (inside the frame), CreateClubPage, LoginScreen, ClaimHandleScreen |
| a transient state — a sentence where a page will be | `App.tsx:90`, `ClubPage:758` + `:761`, `GamePage:428` + `:436` + `:450`, `PlayAreaErrorBoundary:41` |
| a dev page's wide surface | PalettePage, FontPage (off-table, but they show the width is fought) |
| an inner box | `App.tsx:137` |

A name earns its keep by ruling something out. `card` rules nothing out: it
describes a LOOK (white, bordered, rounded, padded) and every one of those four
jobs is a different thing that happens to want the look. That is why it also
carries `max-width: 480px` — the width belongs to one of the four jobs and rides
along on the other three.

**`frame` fails differently.** It is not too vague, it is TAKEN: it means "a
rectangle drawn around a board" in four other places, and the page-level thing
it names here draws no rectangle at all. Two meanings, one word, and the page
one is the newcomer.

Both are the naming rule the repo already writes down (`docs/naming.md`,
`code-conventions.md` → self-describing names): a name states the concept, and a
concept is what the thing is FOR, not what it looks like.

> **resolution (Joel, 2026-08-23): both halves are answered, in two other
> findings, and the answers are different in kind.**
>
> **`card` was too vague, and now has a definition** — F37 (`card-only-page`):
> a card is a card in Bootstrap's sense, a bordered section of a page like a
> post-it note, and the app has few of them. HomePage's body is one; ClubPage
> has none. It implies no slot to fill, and — F35.1 (`card-is-white`) — it
> carries the app's default white background but **no width**, which is what
> F30 (`pagemain-widths`) inherits. The four jobs it was doing split up: page
> bodies become pageMain, the five headerless screens become CardOnlyPages, and
> the transient states become F39 (`loading-and-errors`).
>
> **`frame` was not vague but TAKEN**, and it loses the argument rather than the
> meaning: `frame` keeps meaning "a rectangle drawn around a board", and the
> page-level element that borrowed the word gets its own name in F33
> (`wrapper-name`).
>
> The lesson the finding was really about — that the audit inherited someone
> else's flag on `frame` and never put the same question to `card` — needs no
> resolution, only remembering.

**F33 · `wrapper-name` · DONE 2026-08-23, with F26 — and the proposal below
LOST.** Read the resolution, not this paragraph: `.page` was rejected, and the
wrapper survives as `.pageHeaderAndMainArea`.

The finding as raised: the page element's name — a proposal, deferred by Joel.
*"We'll discuss this when we dive in."* Written down so the proposal was on the
record and F26 had something to wait for; F35 is the wider question it sits
inside.

`.frame` is wrong here: it means "a rectangle drawn around a board" in four
other places, and this element draws nothing.

**Proposed: `.page`.** It is the page — one per route, outermost, holding the
header and the body. It is also the word `ui.md`'s own contract sentence
already uses, so the class and the doc would finally say the same thing. The
two bounds become base + modifier rather than two rules:

- **`.page`** — `width: 100%`, flex column, the standard gap, and
  `max-height: calc(100svh - 2 * var(--page-padding-y))`. Max-height is the
  right DEFAULT because it is the safe one: it changes nothing until the page
  would otherwise overflow.
- **`.page-fill`** — swaps that for `height`, for a page whose body must occupy
  the full viewport whatever its content (club, game).

One consequence to settle with it: `PalettePage` and `FontPage` already use
`.page` as a module class meaning "the width override" (F30). Module-scoped, so
there is no technical collision, but two different `.page`s in one codebase is
exactly the confusion this rename exists to end. They would want a name that
says what they are — and F35 says that name has to describe the JOB, which for
those two is "a dev page that needs the room".

> **resolution (Joel, 2026-08-23): the proposal above is NOT what we do.
> `.page` is `<body>`, and the wrapper keeps existing under a name that says
> exactly what it holds.**
>
> **`page` means `<body>`, tip to tail** — the HTML element, the thing
> `--page-bg-color` paints. Which settles a rule beyond this class: *"everything
> called `.page-*` must be about the page itself, not be a default-for-app."*
> That is what disqualified `--page-surface-color` and the rest (plan §6.6 →
> Backgrounds), and it disqualifies `.page` as a name for a div inside the body.
>
> **The wrapper stays, as `.pageHeaderAndMainArea`.** The case for deleting it
> was real — of the four things it does, `width: 100%` exists only because the
> page centers a content-sized child, the viewport bound is the page's own
> business, and only the stacking is genuinely about the pair. But dissolving it
> means the page carries per-route rules, which React cannot write on `<body>`;
> it needs a `data-page` attribute set from outside the tree. Joel: *"if 'b'
> costs nothing, just keep it"* — and it costs nothing. On the name: *"it's a
> highly-specific thing, not easily explained, and rarely used"*, which is what
> a long unglamorous name is for.
>
> **`.page-fill` is withdrawn with the rest of the proposal.** The bound is the
> page's, so "a page that fills" versus "a page bounded by its content" is a
> per-route difference, not a modifier on a wrapper — and `bg` is the word for a
> page's background, not `fill`.
>
> What is left for F26 (`three-wrappers`) is the only question this does not
> answer: whether the three copies become one class.

**F34 · `stale-height-records` · DONE · Two stale records about page height**, both found while measuring:

- `ClubPage.module.css`'s frame comment says *"The body's 2rem padding (in
  theme.css) means we subtract 4rem from 100svh"*. The rule subtracts
  `2 * var(--page-padding-y)` — which is **1rem** total, not 4 — and the body
  rule lives in `base.css`, not `theme.css`.
- `ui.md:373` says ClubPage fits via `height: calc(100vh - body padding)`. It is
  `100svh`, and the difference is the whole mobile-Safari reason `base.css`
  documents at length.

> **resolution (Joel, 2026-08-23: *"very low risk. just do"*): both fixed.**
> `ClubPage.module.css`'s header comment now says the height is 100svh minus
> twice `--page-padding-y`, and names `base.css` as where that lives; `ui.md`
> spells the expression out and says why it is `svh`. A third stale line went
> with them — the same comment described the page as having lost a `.card`
> wrapping it once had, which is F17's archaeology in another file: it now just
> says there is no card on this page.
>
> The class was still called `.frame` when this was written; F26
> (`three-wrappers`) and F33 (`wrapper-name`) renamed it that same day. The only
> `.frame` left in the app is the history viewer's ring around a board — which
> is the word's honest meaning, and the reason it was the wrong one here.

### Loading and errors

**F39 · `loading-and-errors` · DONE · There are nine ways to say "not ready" or "broken", and they should be
two.** Written as a homepage finding at Joel's instruction (2026-08-23): the
work is not on this page, but **this is the first place a person can meet either
state** — you see the app's loading screen on the way here, and this page's own
empty and failed states were the ones F14 had to fix.

**What ships today.**

*Three sites say "loading", identically in meaning and differently in text:*

| where | text |
|---|---|
| `App.tsx:90` | "Loading…" |
| `ClubPage:758` | "Loading club…" |
| `GamePage:428` | "Loading game…" |

All three are a bare sentence inside a `.card`. **And the homepage answers the
same question a fourth way** — while its clubs are in flight it renders a blank
muted line holding the slot (F14), not a card and not a word. So on the path to
one screen there are two different treatments of "not ready yet".

*Five sites are dead ends, and no two look alike:*

| where | shape | way out |
|---|---|---|
| `App.tsx:137` | `h1` + the offending gametype in `<code>` | **none** |
| `GamePage:450` | one bare sentence, "Unknown game type." | none |
| `ClubPage:761` | `h1` + the error | ← Back home |
| `GamePage:436` | `h1` + prose | ← Back home |
| `PlayAreaErrorBoundary:41` | `h1` + `error.message` | Reload button |

**The agreed shape.**

1. **`<Loading />`** — one component, one message, **no card and no border**
   (Joel: *"they're not a card and don't need or want a border"*). A bordered box
   that lives for 200ms and is replaced by a differently shaped one is a flash.
2. **`<ErrorPage />`** — one component, five callers, wearing the FAULT look: the
   dark red "Error", the message, and the diagnostics line smaller and set
   apart, exactly as the fault modal does it. **Always** carries diagnostics.
3. **The rule that decides these and every future case (Joel, 2026-08-23: *"good
   rule"*): the fault MODAL when the page behind survives; a fault PAGE when it
   does not.** A modal is dismissable, and dismissing one of these would strand
   you on a blank page — the failure here IS the whole route.
4. **One exit, the same one:** "← Back home" on all five, plus Reload on the
   error boundary, where reloading is the actual fix.
5. **Both components live in `loading-and-errs/`.**

**One of the five is unreachable and gets deleted rather than restyled.**
`App.tsx:134` looks the gametype up from the URL and only mounts `<GamePage>` in
the branch where it found a manifest — passing the same string it just
validated. `GamePage:426` then repeats the identical lookup and renders
"Unknown game type." at 450 if it misses, which it cannot. The check is partly
load-bearing for TypeScript (`.find()` returns `T | undefined`), so the clean
fix is **App passing the manifest instead of the gametype string** — it already
has it — after which there is nothing to narrow and nothing to check.

**And "unknown game type" is a fault, not a polite empty state** (Joel: *"did we
delete a game type? If we ever do, we can re-think this to be something more
polite. But this is a fault, and not at all transient."*).

> **resolution (Joel, 2026-08-23): BUILT, fix-forward across all eight sites in
> one commit.**
>
> **The fix-forward call, and why it was the only sensible one.** The choice was
> between doing this everywhere now and doing the homepage's share first — and
> the homepage has NO share: of the eight sites, two are the router's, two are
> ClubPage's, three are GamePage's and one is the error boundary's. The
> homepage's own "not ready" is the blank reserved line and its own failure is
> the fault modal, both already built by F14 (`empty-clubs-is-a-fault`). Doing
> "the homepage's part" would have converted the shell's loader and left seven,
> which is worse than not starting: the inconsistency stops looking accidental
> and starts looking decided.
>
> **Joel explicitly allowed the multi-area commit** — §21 says no commit spans
> two areas, and this one touches ClubPage and GamePage before either area
> opens. *"I'm explicitly allowing multiple-areas in commit. This doesn't make
> clubpage or gamepage 'found' or change their sprint-marker, remember."*
> Neither stamp moved.
>
> **What shipped**, in `src/common/components/loading-and-errs/`:
>
> - **`<Loading />`** — one word, no card, no border, muted. Three call sites.
> - **`<ErrorPage />`** — the fault modal's three lines as a page: the red
>   "Error", the message, the small separate diagnostics. Inside a `.card`,
>   which is what all five already were and what a card IS (F37
>   `card-only-page`), so the page still reads white-on-gray like the modal.
>   Diagnostics are REQUIRED by the type, not optional — a page that says
>   "something went wrong" and nothing else leaves nothing to diagnose.
> - **One way out on every one of them**, "← Back home", with Reload passed as
>   an extra action by the error boundary only.
>
> **The unreachable branch is gone, and its removal changed a prop.** App now
> hands `<GamePage>` the MANIFEST it already resolved instead of the gametype
> string, so the second lookup — and the `Unknown game type.` it guarded — has
> nothing left to do. `gametype` is derived from `manifest.gametype` inside.
>
> **Two things the guards caught, both worth keeping:**
>
> - `vocabularies.test.ts` failed the new CSS file immediately, which is the
>   "a new file has no row at all" property doing its job. Its two spacers were
>   exact matches and converted silently; its two FONT SIZES are FaultModal's
>   to the digit and stay bespoke with the reason in the file — matching the
>   modal is the design, so converting one side alone would break it. Both files
>   convert together at `simple-page`.
> - `PlayAreaErrorBoundary.test.tsx` went red on the old copy, which is the test
>   earning its keep. It now asserts the red "Error", the thrown message, the
>   `key=render-crashed` diagnostics, AND both ways out — with a note saying why
>   Reload is asserted beside "← Back home" rather than instead of it.
>
> **Full e2e run: 216 passed, 7 failed, none of them caused by this.** Six are
> the filed club-page and homepage specs (F3 `home-keyboard-spec` and the two
> club specs on the plan's carried-forward list). The seventh is
> `wordle-keyboard.e2e.ts` — see below.

### The page header — the third subject, added 2026-08-23

Joel moved the header into this area (*"I believe we've already decided the
header is in the homepage area — if not, it is now"*), reversing the black-box
scope note above. **He also said in advance that sign-off will be partial:** the
homepage's header holds one thing, so most of what the slots are FOR is not
visible here. *"I won't entirely sign off on everything now, since the homepage
is missing lots of things that got into the slots, so we'll probably re-open in
the clubpage, where we see more stuff."*

**The files:** `components/page-header/PageHeader.tsx` + `.module.css`, and
`components/menu/MenuTrigger.tsx` + `.module.css`.

**What the audit CONFIRMED, so it does not become a finding:**

- **The strip is genuinely one component**, not three that look alike.
  `<PageHeader>` owns the two slots, the rule and the height; its own docstring
  records that home, club and game each used to assemble the skeleton by hand,
  *"which is how the three drifted apart in the first place"*. What is still
  written three times is one level in — the menu trigger — which is F12
  (`page-header-trio`), and is narrower than that finding's name suggests.
- **The height is a real contract and it is COMPOSED**, which is the thing
  `--game-chrome-height` is not (F28 `gamepage-bounds-itself`).
  `--game-header-bottom` is `--page-padding-y + --page-header-height + 0.5rem +
  1px`, and the mobile InfoSheet positions itself from it. Measured: the strip
  is **49px total — 40px of content, 8px padding, 1px rule** — on home and club,
  at 1280×900 and at 375×667. 40px is exactly the declared `2.5rem`, so the
  contract is not merely plausible, it is met on the nose.
- **The strip has no mobile treatment at all** and does not need one: identical
  at both widths. What changes on a phone is what the pages PUT in it.
- **The docstring's "what each page puts in it" table is accurate today**,
  checked against all three call sites.

**F40 · `header-line-belongs-to-header` · DONE · The rule under the header is painted
with a color that belongs to fifteen other things.** `border-bottom: 1px solid
var(--page-divider-color)`, and that token has sixteen non-theme readers: the
play surface's board/info column divider, the turn log's top rule, stackdown's
and strands' board borders, a `<Dot>` ring, wordiply's `text-decoration-color`.

Joel ruled on this on 2026-08-22, before the header was in scope, and it was
never written down: *"let's not couple the color of the line below the
pageheader (which in my mind belongs to the pageheader; no pageheader, no line)
and the divider between boardCol and infoCol. They may be coincidentally the
same today, but they're not the same thing."*

> **resolution (Joel, 2026-08-23): done — `--pageHeader-border-color`, in both
> themes, at today's value.** `#8a8a8a` in daylight and `#7b8391` in midnight,
> so **nothing moves on screen**; the reason is written at the declaration in
> both files, since a token that equals its neighbor needs to say why it is not
> its neighbor.
>
> `--page-divider-color` goes from sixteen readers to fifteen. What that buys is
> narrow and worth stating plainly: changing the play surface's column divider
> can no longer edit the header's rule, and vice versa. What it does NOT buy is
> any sorting of the remaining fifteen, which are still one color doing several
> jobs — board borders, a turn-log rule, a `<Dot>` ring, a
> `text-decoration-color`. That pile belongs to the areas that own its readers.

**F41 · `header-literals` · DONE · Five raw values, and only one of them is a
decision.** `gap: 1rem` between the slots, `.left`'s `gap: 0.375rem`, `.right`'s
`gap: 0.5rem`, `padding-bottom: 0.5rem`, and the rule's `1px`. Four are exact
matches for a vocabulary member — `--spacer-2`, `--spacer-4` twice, and
`--border-width-line` — so they convert silently (§13). **`0.375rem` is the one
that is not on the ramp**, and it is the gap between the marks in the left slot,
which F43 (`unequal-mark-separation`) is about. All five are on the guard's
pending rows for this file today.

> **resolution: converted, and the fifth stays bespoke (Joel, 2026-08-24).**
> `gap: 1rem` → `--spacer-2`, `padding-bottom: 0.5rem` → `--spacer-4`, and the
> rule's `1px` → `--border-width-line`. The finding's fourth exact match —
> "`.right`'s `gap: 0.5rem`" — no longer exists: both slots read `0.375rem`
> today, so there were three conversions, not four.
>
> **`0.375rem` stays a literal by decision, not by omission**, and the file now
> says why: it is the mark gap, and the number you SEE is that gap plus each
> mark's own padding, so no ramp step is right for a number nobody looks at.
> It keeps its pending row with that reason attached. If a second site ever
> wants the value, it earns a ramp step then.
>
> What it can't settle is what the separation SHOULD be — that is F43
> (`unequal-mark-separation`), and it needs a page with more than one mark.

**F42 · `chevron-outside-the-icon-set` · DONE · The menu chevron is a hand-inlined SVG
in a component that is not an icon.** `MenuTrigger.tsx` declares its own
10×10 `<svg>` with a `<path>`, while the app has `components/icons` — which
ClubPage imports from by name (`IconBack`, `IconHelp`). So there is one icon
living outside the icon set, in a file whose job is layout.

Its size is also the only hard-coded pixel dimension in the header
(`width="10" height="10"`), where everything else in the strip is either a
token or an em.

> **resolution: `IconMenuChevron` (2026-08-24), done with F12 in one change.**
> It is `ChevronDown` in `components/icons`, next to `IconBack`'s `ChevronLeft`
> — the same family, and a chevron points at the list about to appear. The
> registry's comment says why an affordance mark belongs in a set otherwise full
> of button icons: the alternative was the app's one hand-inlined `<svg>`, in a
> file whose job is layout.
>
> **Doing it with F12 is what made it free.** F12 folded the logo into `<Menu>`,
> so `MenuTrigger` — the file that held the SVG — stopped existing; the chevron
> had to go somewhere, and the icon set is where.
>
> **The size is an em now**, `.chevron { width: 0.65em; height: 0.65em }`, so
> the mark tracks the type beside it instead of being the strip's one pixel
> dimension — and it now scales with a browser font-size the old `width="10"`
> ignored.
>
> **Nothing visible changed, to within 0.4px**, which is worth recording because
> swapping a hand-drawn glyph for a library one usually does change something:
>
> - the PATH is identical in proportion — `M4 6l4 4 4-4` on a 16 viewBox and
>   Lucide's `m6 9 6 6 6-6` on 24 both normalize to x 0.25→0.75, y 0.375→0.625;
> - `strokeWidth={3}` is an IDENTITY, not a tuned number: 3/24 == 2/16;
> - round caps and joins both ways — the old SVG set them, Lucide defaults to
>   them;
> - the size goes 10px → 10.4px, because `base.css:768` gives buttons
>   `font: inherit` so `0.65em` resolves against 1rem.

**F43 · `unequal-mark-separation` · DONE · The marks in the left slot are not evenly
spaced, and the CSS says they are.** The slot sets one `gap: 0.375rem` for
everything in it, and each mark then carries its own hover padding on top — the
menu trigger `0.25rem`, the chat bubble `0.3rem`, the status slot none. So the
VISIBLE separations differ: about 14.8px between the trigger and the chat
bubble, about 10.8px between the chat bubble and the status slot.

Measured on the club page (three marks): box-to-box gaps of 6px and 5px, the
second being the fractional `0.3rem` rounding. The homepage cannot show this at
all — it has ONE mark — which is exactly why it cannot settle this.

The comment in the file already computes the answer in prose — *"the visible
separation is about 0.925rem, not 0.375rem"* — which is correct arithmetic
today and is the kind of derived number that rots the moment a mark's padding
changes.

> **resolution: MOVED to the `crosswords` area (Joel, 2026-08-24)**, on §7's
> carried-forward checklist. Not deferred for want of time: this needs a page
> where **every** header mark is on the strip at once, and crosswords is that
> page. The homepage has one mark and the club page three, so neither can see
> the full set of unequal gaps, let alone judge what they should be.
>
> Two things go with it. The file's prose arithmetic has already been replaced
> (F41) with a statement of the RELATIONSHIP — gap plus each mark's own padding
> — because the number it quoted had gone stale exactly as predicted, the chat
> bubble having moved to `PageHeaderButton`. And `0.375rem` stays bespoke until
> this lands, since a ramp step cannot be chosen for a number nobody looks at.

**F44 · `action-button-text-only` · DONE 2026-08-26 — answered by the `forms`
area, and its last instance converted here · An action button cannot be text, so the
app's plainest buttons are all written by hand.** Raised 2026-08-24 while
working out what "+ New club" becomes when `CreateClubPage` turns into a modal
(F36 `createclub-modal`).

**`<ActionButton>` requires a glyph.** `icon` and `label` are both non-optional
on it; what IS optional is one level up, in `PurposeButtonProps` — `label?`,
`iconOnly?`, `tooltip?` — because each purpose wrapper supplies its own
defaults. So the component has an `iconOnly` and no `labelOnly`: there is no way
to render one as text with no mark.

**Which is why the plainest buttons in the app are outside it.** 21 of the 23
files in `components/buttons/` go through `ActionButton`; the exceptions are
`ShuffleButton` (the board's round pill) and `PauseButton` (now a
`PageHeaderButton`). But a Cancel is written by hand seven times —

```tsx
<button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
```

— in `ConfirmationBlockingModal`, `SetupGameModal`, `EditClubModal`, `EditProfileModal`,
`ClaimHandleScreen`, `CreateClubPage` and scrabble's `ScrabbleBlankPickerBlockingModal`. Plus
HomePage's "+ New club", which is the same markup on a `<Link>`, and whose `+`
is a typed character rather than a glyph.

`ActionButton`'s docstring frames this as a taxonomy decision — *"the cancels
don't come through here at all; they are dialog buttons wearing the bare
`secondary` class"* — but it reads more like a description of the constraint
than an argument for it. **The component cannot express a text-only button, so
they went elsewhere, and seven copies of one line is the shape this sprint keeps
finding.**

**What the finding asks for:** make the idea consistent — an action button may
be icon + text, icon only, or **text only** — and bring the plain ones inside.
Two things fall out of that, both small and both decisions rather than typing:

1. `icon` becomes optional, and a glyph-less button's shape gets checked —
   `.icon-button`'s `gap: 0.4em` between an absent icon and a label should be
   harmless, but "should be" is not measured.
2. It gives `tone="quiet"` its first caller. Nothing passes it today: every
   quiet-colored control in the app reaches quiet through the theme's
   `--button-slot-secondary-*` defaults instead, by three different routes — a
   bare `<button>`, a `<Link>` wearing the classes, and (until today) an
   `ActionButton`.

> **resolution: the `forms` area answered it, and F36 spent the answer.** Both
> halves the finding asked for shipped there without this file being touched:
> `<ActionButton>` is gone, replaced by `<StandardButton>`, whose `icon` is
> optional — so an action button may now be icon + text, icon only, **or text
> only** — and the seven hand-written Cancels are one `<CancelButton>`. Grepped
> 2026-08-26: `className="button secondary"` appears nowhere in `src/` outside a
> comment.
>
> **Its last live instance was this page's**, and F36 converted it: "+ New club"
> is a `<StandardButton weight="secondary" tone="quiet" small>` now, which also
> gives `tone="quiet"` the first caller point 2 was waiting for.
>
> Point 1's measurement is owed by whoever wants it: a glyph-less button's
> `gap: 0.4em` between an absent icon and a label is presumed harmless and was
> not measured.

### The three names this area produced

Each of these came out of the page-structure audit rather than out of the
homepage, and each is a THING to build rather than a line to change. They keep
this area's numbering (§ "Findings") because they were found here.

**F36 · `createclub-modal` · DONE 2026-08-26 — built · CreateClubPage should be a modal, not a page** (Joel, 2026-08-22:
*"CreateClubPage is a separate page, and that's probably pure-history: it was
one of the very first things we ever wrote in the app, and had thought out none
of the UI. I argue that it should be a modal — just like Setup and EditProfile
are."*).

The evidence agrees. It is already dialog-sized — an `h1`, one input, one
textarea, an error line, Cancel + Create — which is SMALLER than
`EditClubModal`, and that dialog is its exact sibling: create and edit of the
same object. `SetupGameModal` and `EditProfileModal` are the same shape again.

The argument that convinced, though, is not consistency. The act is **add to
this list**: a modal keeps the club list behind it, where the page makes you
leave the list in order to add to it and then puts you back. The homepage's
"+ New club" stops being navigation and becomes what it always was.

What it dissolves: the only genuinely in-app headerless page (F32), the hardest
of F29's three question marks, one route, and one more `.card` standing in for a
page. The remaining headerless screens are then all pre-auth — a category with
one answer (F37).

Nothing blocks it. `/c/new` rotting is fine. The one design question is where the
trigger lives if a club is ever created from somewhere other than home; today
home is the only entry, so it can be home's modal until that changes.

> **resolution: built 2026-08-26 — `CreateClubModal`, and the route is gone.**
>
> `CreateClubPage.tsx` → `club/CreateClubModal.tsx`, a `<NormalModal>` mounted
> by HomePage exactly as ClubPage mounts `EditClubModal`: the opener holds a
> `creating` flag, the dialog holds no open/shut state of its own.
>
> **The shell absorbed four things the page had written by hand**, which is the
> measure of the change rather than the modal itself:
>
> - the page wrappers (`pageHeaderAndMainArea` + `cls('card','pageMain')`) and
>   the `<h1>`, which is the panel's `title` now;
> - **eleven lines of window-level Escape handling**, whose own comment said it
>   existed only because "this is a routed PAGE, so it wires its own". The
>   `modal-normal` family closes on Escape and traps focus, both from the FAMILY
>   table;
> - `.buttonRow` and its `min-width: 6rem` twin — the same two rules
>   `modalActions.module.css` already holds. The module keeps only `.labelRow`
>   and `.handleHint`, the handle preview nothing else has;
> - the `session` prop, taken so App could pass it uniformly to every
>   page-level component, and carrying an `eslint-disable` to stay unused. The
>   RPC reads `auth.uid()`; the prop and the disable both go.
>
> **The action row stays INSIDE the form** (where the page had it), because
> implicit submission needs the submit button in the form — typing a name and
> pressing Enter is the fast path this dialog is for.
>
> **On success it goes into the new club** (Joel, 2026-08-26), which is what you
> made it for. The panel reports and the opener navigates — `onCreated(handle)`
> / `onCancel`, the shape `SetupGameModal` and `EditClubModal` already use.
>
> **"+ New club" stops being a `<Link>` wearing button classes** and becomes a
> real `<StandardButton weight="secondary" tone="quiet" small>`, which is
> exactly what the stopgap comment on it said would happen here. **The typed `+`
> stays** (Joel, 2026-08-26: *"keep typed-plus for now"*) — `icon` is available
> and deliberately unused.
>
> **`/c/new` is gone from `App.tsx`**, and with it the outer `if` the route
> needed: the club match is now the first branch. A stale `/c/new` link falls
> into `/^\/c\/([^/]+)\/?$/` and asks ClubPage for a club called "new" — rot
> with an error screen rather than a bounce home. Left alone deliberately
> (Joel, 2026-08-26); it is `club-page`'s to answer if it is anyone's.
>
> **Three docs carried a fact that stopped being true**, so they were corrected
> with the change rather than at step 12 — this moves no decision, it deletes a
> route that no longer exists: `docs/common.md`'s route table (the `/c/new` row),
> `docs/common-folders.md`'s `club/` listing, and `docs/ui.md`'s shell-level
> page list.
>
> **The guard's rows followed the rename**, which is the half that would have
> rotted silently: `vocabularies.test.ts` had `CreateClubPage.module.css` on
> both the spacer and font-size pending lists. The spacer row also SHRANK —
> `0.75rem` and `0.5rem` left with `.buttonRow`, leaving `0.4rem`.
>
> Suite unchanged at **1996 of 1997**, the one failure being the dead-token
> guard that is expected to stay red for the sprint.

**F37 · `card-only-page` · DONE — the type is a NAME, not a thing to build · `CardOnlyPage` — a page whose whole body is one card** (Joel,
2026-08-22: *"a page that is 'just a card' (LoginPage): let's call that a
'CardOnlyPage'; we can use different CSS for that, if needed, and the
understanding that it will fix a width makes sense. They're not `.card`s."*).

Today: `LoginScreen` and `ClaimHandleScreen` are a bare `<div className="card">`
and nothing else, which is why F32 read them as pages missing their structure.
They are not missing anything — they are a page TYPE nobody had named.

The rule it settles: **a `.card` is a card in Bootstrap's sense** — a bordered
section of a page, like a post-it note — and the app has few of them. HomePage's
body is one. ClubPage has none. A card does not imply a slot to fill (something
that lazy-loads its content can still be a card). A CardOnlyPage LOOKS like a
card and is not one; it is a page, and it may take its own CSS.

Two things to decide when it is built, both of which other findings hand to it:

1. **Its width.** F30's `480px` is really this type's width — plus HomePage's,
   which is a headed page whose card takes the same measure. So the number
   belongs to a page vocabulary ("the narrow page body"), not to `.card`.
2. **Whether it has a viewport bound.** F29's remaining question, and the point
   of naming the type is that this gets decided once instead of being absent
   twice.

> **resolution (2026-08-23): named, and both decisions handed to it are now
> answered by the pattern (F26 `three-wrappers`).** Its width is the default
> `--pageMain-width`; it has no bound of its own, because a bound needs a
> scroller to absorb into and these pages have none — measured at 541 of 640 in
> the worst case.
>
> What is left of the type is a NAME rather than a thing to build: a
> CardOnlyPage is a page that renders no header and whose pageMain happens to be
> a card. That is exactly what LoginScreen, ClaimHandleScreen and CreateClubPage
> now are, in the same three classes every other page uses — and CreateClubPage
> is due to stop being one at all (F36 `createclub-modal`).

**F38 · `selection-lists` · DONE for this area 2026-08-24 — the scrabble site left for `scrabble` · `SelectionLists` — the keyboard-navigable list wants a real component**
(Joel, 2026-08-22: *"we have several findings about the keyboard navigable lists
like we use in the homepage and createclub (and also places like the
pick-a-crossword puzzle in the setup). There are lots of problems with them;
let's not keep listing them as unresolved right now. Instead, add a new finding:
we need a sharper reusable thing (most likely is a react component, not merely a
css-pattern)."*)

**The name is deliberate and provisional** — "list" alone is too vague, since it
also means a plain bulleted list of text. A SelectionList is a list you move a
cursor through and choose from.

Known sites: the homepage's clubs, ClubPage's two lists (start a game, your
games), the crossword-puzzle picker in setup — and CreateClubPage, which is
about to become a modal (F36) without ceasing to have one.

**It is probably a React component, not a CSS pattern**, and the reason is in
what folded into it: the duplicated logic is behavior, not paint. `.item-list` /
`.item-row` can stay exactly what they are — the look — and the component owns
the parts three pages currently each remember.

**Folded in, so they stop being tracked separately** (each marked resolved in
place, pointing here):

- **F11** — the cursor logic written twice: clamp with no wrap, Enter opens the
  row under the cursor, the ring hides unless the container proper holds focus,
  `scrollIntoView({ block: 'nearest' })`.
- **F15** — when the list takes focus on arrival, and what it takes focus on.
- **F24** — an empty list keeps its box and puts the message inside it. (The
  homepage's replace-the-whole-list exception was closed 2026-08-24: the frame
  is always drawn, everywhere.)

**And F3 is not folded, but its blocking question is now this one's.** The red
spec cannot be rewritten until someone says whether the cursor ring rides the
row's `<a>` or its `<li>`; today the ring is on one and the scroll ref is on the
other, which is the sort of thing a component exists to stop being a per-page
accident.

> **resolution: DONE for this area (2026-08-24). It was built from its own plan
> file, since the sites live in four different areas and the component outlives
> this one; that plan was swept 2026-09-02 and the component is described in
> [docs/ui.md → Selection lists](../../docs/ui.md#selection-lists).** The one
> site that did not convert is scrabble's suggest box, now in
> [docs/games/scrabble.md](../../docs/games/scrabble.md) → Deferred.
>
> `<SelectionList>` ships in `common/components/lists/`; the homepage's clubs,
> ClubPage's two lists and crosswords' library picker all go through it, and
> `patterns/list.css` is deleted. **F38 stays open on scrabble's suggested-moves
> box**, which turned out not to fit — a frameless five-line list pinned to a
> fixed height, where the frame and the row padding would both arrive as a
> visible redesign. Three options are written up in the plan; the call is Joel's.
>
> Also folded in and now done: F11 (`list-cursor-written-twice`), F15
> (`focus-on-every-refetch`), F24 (`empty-list-keeps-box`).
>
> **The scrabble site leaves this area** (Joel, 2026-08-24) and is on §7's
> carried-forward checklist against `scrabble`, with its three options. Nothing
> about it is a homepage question.
>
> Two things settled here are worth carrying even if the build slips:
>
> - **F3's blocking question is dissolved.** The row is a `<div>` — no `<a>`, no
>   `<button>`, no `<li>` — so there is no element for the ring and the scroll
>   ref to disagree about. `e2e/home-keyboard.e2e.ts` can be rewritten whenever
>   someone gets to it.
> - **The line is "you pick exactly one thing", not "a column of rows".** That
>   is what put `Menu`, `FilterSelect`, `ColorChoiceList`, the players roster and
>   connections' `HintList` outside a roster they all resembled — and CreateClubPage
>   turns out not to have a list at all, contrary to the note above.

## Dependencies — found, listed, and LEFT

**Re-derived from scratch 2026-08-26** (Joel: *"we already had an audit for
homepage area, but we've built a lot of common machinery now. list the files
that would be found for this area (do this fresh)"*), by tracing the own files'
imports and the global class names they write, one level. **33 files, against 21
on the 2026-08-22 list** — 11 lib + hooks, 13 component files, 7 stylesheets
(the themes row is two), 2 e2e helpers. `CreateClubModal`'s two are not counted
here; they are own files.

§21: being found is not a claim on attention; none of these is audited here, and
whether any becomes its own area is Joel's call. **Stamps did not move** — every
file here stays `cs-unmet` under the 2026-08-26 reset, which makes finding one
a listing rather than a claim.

**The 33, one line each.**

1. `src/common/lib/routing/router.ts`
2. `src/common/lib/util/cls.ts`
3. `src/common/db.ts`
4. `src/common/lib/game/serverError.ts` — `faultMessage`
5. `src/common/lib/fault/faultStore.ts` — `presentFault`
6. `src/common/lib/supabase/realtimeDiag.ts` — `logStamp`
7. `src/common/hooks/session/useProfile.ts`
8. `src/common/hooks/realtime/useRealtimeRefetch.ts`
9. `src/common/hooks/input/useTabRing.ts`
10. `src/common/hooks/input/useAppShortcuts.tsx`
11. `src/common/hooks/account/useAccountMenuSection.ts`
12. `src/common/components/lists/SelectionList.tsx`
13. `src/common/components/lists/SelectionList.module.css`
14. `src/common/components/buttons/StandardButton.tsx`
15. `src/common/components/buttons/StandardButton.module.css`
16. `src/common/components/page-header/PageHeader.tsx`
17. `src/common/components/page-header/PageHeader.module.css`
18. `src/common/components/page-header/PageHeaderMenu.tsx` — `Menu` is second level, behind it
19. `src/common/components/text/Dot.tsx`
20. `src/common/components/text/Dot.module.css`
21. `src/common/components/branding/PuzpuzpuzWordmark.tsx`
22. `src/common/components/branding/PuzpuzpuzWordmark.module.css`
23. `src/common/components/branding/PuzpuzpuzLogo.tsx`
24. `src/common/components/branding/PuzpuzpuzLogo.module.css`
25. `src/common/utilities.css` — `.card`
26. `src/common/patterns/page.css` — `.pageHeaderAndMainArea`, `.pageMain`, `.pageMain-fills`
27. `src/common/patterns/badge.css` — `.badge`
28. `src/common/patterns/heading.css` — `.heading-with-controls`
29. `src/common/base.css` — `h1` / `h3`, `--page-padding-y`, the vocabularies
30. `src/common/themes/daylight.css` — `--flex-color-1` (F10 — was `--chrome-badge-color`)
31. `src/common/themes/midnight.css` — the same token's midnight value
32. `e2e/helpers/fixtures.ts` — `createClubWithMembers`
33. `e2e/helpers/session.ts` — `signIn`

**Seven files LEFT the list**, and each names the machinery that replaced it —
which is the measure of what the areas below this one built:

| gone | why |
|---|---|
| `lib/routing/Link.tsx` | the page writes no link at all now; F36 took the last one |
| `hooks/input/useSwallowTab.ts` | `useTabRing` |
| `components/menu/MenuTrigger.tsx` + `.module.css` | deleted by F12 |
| `components/menu/Menu.tsx` + `.module.css` | still reached, but second level, behind `PageHeaderMenu` |
| `patterns/list.css` | deleted by F38 — `<SelectionList>` |
| `patterns/button.css` | deleted by `forms` — `StandardButton.module.css` |
| `patterns/focus-ring.css` (`.kb-cursor`) | `<SelectionList>` writes it; the page does not |

`.muted` also left `utilities.css`'s row: the page's three no-rows sentences are
`<SelectionList>`'s `empty` prop now, not a `<p>` the page paints.

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

## Audit — dependency files 1–11 (lib + hooks)

Joel, 2026-08-26: *"audit 1-11"* — the lib-and-hooks half of the found list,
read in full. **These take this area's numbering** (F45 …) rather than starting
their own: they are findings against this area's reading, which is what an
F-number addresses. §21's "dependencies are listed, not audited" is a DEFAULT
about attention, not a prohibition — an area may be told to audit one.

Eleven files, 1,394 lines. Eleven findings. **F55 is fixed** (it was the only
one against a file this area owns); the other ten belong to the areas that own
their files and are recorded here, not acted on.

**F45 · `logstamp-in-realtimediag` · `logStamp()` is app-wide and lives in the
realtime diagnostics module.** It is the `HH:MM:SS.mmm` format for THREE console
families (`[rt]`, `[db]`, `[ui]`) and for the fault modal's on-screen
diagnostics line. Measured — nine readers: `App.tsx`, `ClubPage`, `HomePage`,
`GamePage`, `PlayAreaErrorBoundary`, `PlayAreaMountLog`, `lib/game/serverError`,
`lib/supabase/dbFetch`, and `realtimeDiag` itself. Two of the nine are realtime.
So the homepage imports a realtime-diagnostics module in order to timestamp a
fault about an empty club list. The other three exports there (`rtLog`,
`rtVerbose`, `instrumentChannel`) are genuinely realtime's.

> resolution:

**F46 · `orphaned-docstrings` · Two docstrings sit above the wrong function, in
two different files — and both have the same tell: two docstrings stacked with
nothing between them.**

- `lib/game/serverError.ts:140-157` — "Narrate a FAULT to the console under
  `[db]`" describes `logFault`, which is at line 186. It sits above `faultBits`
  (164), which carries its own docstring immediately below it. So the file's
  longest explanation of the logging rule ("Expected rejections are NOT logged")
  is attached to the string builder, and `logFault` reads as undocumented.
- `hooks/session/useProfile.ts:90-95` — "Reflect a just-saved color across every
  consumer in the tab" describes `setProfileColor` (107). It sits above
  `useCurrentProfile` (103), which also has its own docstring below it.

Neither is a stale comment; both are correct prose one function too early.

> resolution:

**F47 · `cls-thirty-lines` · The number arguing for hand-rolling `cls` is off by
seven times.** `lib/util/cls.ts` says clsx/classnames are "overkill for the
handful of conditional class composition sites we have — and we'd rather not add
a dependency for ~30 lines of usage". Measured: **203 call sites across 116
files.** The DECISION still looks right — the whole file is 5 lines of code and
the app has no dependency to track — but "a handful" is now the wrong reason for
it, and it is the kind of number a reader checks.

> resolution:

**F48 · `router-query-params` · The router says query parsing is "not needed
yet"; three places parse it.** `lib/routing/router.ts:37` lists it under "What's
NOT here". Today: `themes/loadTheme.ts:44` reads `?theme=`, `ClubPage.tsx:275`
reads `?new=`, and `ClubPage.tsx:302` STRIPS the query with `navigate(pathname,
true)` once it has read it. And `usePath()` returns `window.location.pathname`
alone, so a component that cares about the query cannot subscribe to it —
ClubPage reads `window.location.search` directly instead. Whether the router
should carry the query is a decision; the docstring asserting nobody needs it is
just false.

> resolution:

**F49 · `profile-load-failure-silent` · A failed profile fetch is silent, and
F14 already ruled on exactly this shape.** `useProfile.ts:63-70` console.errors
and returns; the page then greets you "Welcome!" with no name and the account
menu row says "Account", indefinitely. F14 made the homepage's other
identity-shaped failure — zero clubs — a FAULT, on the site-invariant argument
that `claim_username` materializes a solo club atomically with the profile. The
profile row is the OTHER half of that same atomic write, so the same argument
reaches it: if it isn't there, or can't be read, the account is broken and the
app has one way to say so. The two paths disagree today.

Worth keeping when this is decided: the failed load clears `loadedFor`, so a
later mount retries. That is deliberate and documented, and it means the fault
would fire per retry rather than once — which is the behavior F14 chose anyway
(*"their account is hopelessly fucked. showing it every time is simplest"*).

> resolution:

**F50 · `offsetparent-fixed` · `useTabRing`'s on-screen test is false for a
`position: fixed` stop.** `onScreen()` is `el.offsetParent !== null`, which is
what makes a hidden stop stop being a stop (the club page's mobile column) — but
per CSSOM `offsetParent` is ALSO null for a fixed-position element. Children of
a fixed element are fine (their offsetParent is that element), so this is narrow:
it bites only when the STOP ITSELF is fixed. Two candidates on the tab-rings
roster are: `Menu`'s popup and the mobile `InfoSheet`, both `position: fixed` in
their own modules. Latent today — the only two callers are `HomePage` and
`ClubPage`, neither fixed — and it fails SILENTLY (a ring whose stops all read as
off-screen consumes Tab and moves nothing), which is the part that makes it
worth writing down now.

> resolution:

**F51 · `ring-vs-trap` · `CreateClubModal` depends on a guard marked
TRANSITIONAL, and nothing pins it.** While the modal is open the innermost ring
is still the HOMEPAGE's, because a panel declares none. Tab inside the modal
works only because `useTabRing.ts:91` bails when the event target is inside
`[data-floating-panel]`. Traced: `useFocusTrap` listens on the panel and the ring
on `window`, so the panel's listener runs first and the event still reaches the
ring — if that bail went away, every Tab inside the modal would also move focus
to the clubs list behind the scrim, not just the two wrap-around presses. The
comment at that line says the guard "goes when the panels and dialogs declare
rings of their own" (plans/tab-rings.md → The leaks). So the modal built today
owes a ring at that moment, and no test says so.

> resolution:

**F52 · `four-of-eleven-untested` · Four of the eleven have no test at all**:
`realtimeDiag.ts`, `useProfile.ts`, `useTabRing.ts`, `useAccountMenuSection.ts`.
(`cls.ts` has no test of its own but is exercised by two suites and both CSS
guards.)

**`useTabRing` is the one worth arguing about.** It is the mechanism
plans/tab-rings.md was written to produce, it is load-bearing on both pages that
use it, and every behavior it claims is jsdom-shaped: innermost wins, an empty
ring consumes Tab rather than ignoring it, Shift+Tab enters at the far end after
a stray click, a modified chord is left to the browser. F50 and F51 are both
things a test would have pinned.

> resolution:

**F53 · `useappshortcuts-doc-says-two-pages` · The hook's docstring names two
pages and then documents the flag that exists for the third.** It opens
"available on any page that has the chat companion + the logo menu (ClubPage and
GamePage — the 'real' pages, as opposed to auth / setup screens)", and twelve
lines later explains `chat: false`, which exists FOR HomePage and is why the
homepage has `?` and `~`. Three pages call it. The first sentence predates the
flag and contradicts the paragraph below it.

> resolution:

**F54 · `account-menu-archaeology` · `useAccountMenuSection`'s docstring spends
its second paragraph on what the code used to be.** "These used to be a separate
`<UserMenu>` pinned to the top-right … that fixed chip forced
`GamePage.module.css`'s header to carry `margin-right: 2rem` …" — and the third
paragraph refers to "the separation `docs/ui.md` records for the OLD UserMenu".
This is F17's rule (Joel: *"all these examples are junk; remove"*) applied to a
file F17 did not reach: a comment explains the code that is THERE. What survives
the trim is the live reason — the row is a submenu because account items are a
different mental model from "things you can do to this game" — which stands on
its own without the removed control.

`docs/ui.md` carries the same paragraph and is step 12's business, not this
finding's.

> resolution:

**F55 · `createclub-fault-to-form-line` · DONE 2026-08-26 — built · Found while reading `serverError.ts`,
and it is against an OWN file: `CreateClubModal` routes a fault to the form's
red line, where its sibling pops the modal.** `CreateClubModal.tsx:157` calls
`failureText`, which returns words and nothing else; `EditClubModal` calls
`expectedTextOrFault`, which presents the fault MODAL and returns null. So a dead
connection while creating a club prints "create club: Server; try refresh" into
the form, and the same failure while editing one raises a fault. `serverError.ts`
is explicit that `expectedTextOrFault` is the form/panel helper and that the
string-shaped `failureText` is for sinks that cannot carry the fault look.

Not introduced by F36 — the page did this before the modal did. `ClubPage:545`
and `:562` (load club / load members) have the same shape and are `club-page`'s.

> **resolution: fixed — `expectedTextOrFault`** (Joel, 2026-08-26: *"failing to
> create a club should be a 'fault': faults should pop up the fault modal.
> change to this."*).
>
> One import and one call. `setError(expectedTextOrFault(error, 'create club'))`
> takes both outcomes: a string for an expected rejection, and `null` once the
> fault has gone to the modal — which clears the form's line, so the form says
> nothing behind the thing carrying the news. That is the reset `serverError.ts`
> describes at the helper's declaration.
>
> **THE TWO CODE ARMS ABOVE IT ARE UNCHANGED, and that is the boundary worth
> stating**: `23505` (name taken) and `23514` (the handle CHECK backstop) still
> write their sentences into the form, as does the local `getErrorTextForSlug` check
> before the call. Those are answers a player acts on by picking another name —
> Joel's standing rule is that validation and answers stay in-form — so they are
> not failures in the sense this finding is about. If a taken name should pop
> the modal too, that is a different call and one word changes it.
>
> Everything else now behaves exactly as `EditClubModal` already did: dead
> connection, unknown key, a raise nobody wrote copy for. Suite unchanged at
> 1996 of 1997.

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
  entirely. So this area could not clear its own row until F7 was answered —
  which is the prediction earning its keep, since the plan to write the row off
  was made before anyone noticed the two numbers had different fates. **F7 then
  answered it by deleting the value rather than converting it**, and the row is
  now gone.
- **Actual suite movement**: 1960 → **1968 in 201 files**. One new `it` per
  vocabulary entry: spacer, font-weight, font-size, line-height, opacity,
  letter-spacing, transition-duration, border-width. No test's assertions
  changed, and nothing went red on the way.
- **`csStamps.test.ts`** fails on any new file without a stamp — including a new
  hook from F11 or F12, and this file's own siblings if `plans/areas/` ever grows
  a `.ts`.
