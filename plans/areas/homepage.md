# Area: homepage

The first area of the CSS sprint's step 7. The process is
[css-system-2.md](../css-system-2.md) §21; the plan holds the order, this file
holds everything else.

**Status: RESUMED, and a second subject added.** Thirty-nine findings,
twenty-seven resolved (F1, F2, F4, F5, F6, F6.1, F7, F8, F9, F10, F11, F14, F15,
F16, F17, F18, F19, F20, F22, F23, F24, F25, F28, F29, F32, F36, F37) — where
"resolved" includes the ones FOLDED into a later finding rather than fixed.

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

**`src/common/components/branding/homeTitle.png`** is in the area but carries no
stamp: a PNG has nowhere to put a comment. Joel reviews it himself and this file
records the date he says he has.

- reviewed by Joel: *(not yet)*

## Findings

**Numbered `F1` … `F39`, and sub-numbered `F6.1` where one finding grows its own
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

**F1 · `dead-clubslist-class` · `styles.clubsList` is undefined.** `HomePage.tsx:255` writes
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

**F2 · `soloitem-never-existed` · `.soloItem` never existed.** The component docstring (`HomePage.tsx:44`)
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

**F3 · `home-keyboard-spec` · `e2e/home-keyboard.e2e.ts` has been failing since 2026-08-21.** It locates
rows with `[class*="_clubItem"]`. `.clubItem` was deleted in `89122fc7` ("the
homepage stops describing a button and a list, and just uses them") — the commit
that made the list `.item-list` / `.item-row` — and that commit did not touch the
spec. The locator now matches nothing, so the spec dies at line 29 waiting for
the first row. **Verified by running it**, not by reading: `npx playwright test
e2e/home-keyboard.e2e.ts` fails on `expect(rows.first()).toBeVisible()`.

Rewriting it means choosing what the ring is *on*: `kb-cursor` rides the `<a
class="item-row">`, while the `scrollIntoView` ref rides the `<li>`.

> resolution:

**F4 · `class-exists-guard` · The "class defined ≠ referenced" guard (§10) has two live cases here** —
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

**F5 · `the-eight-vocabularies` · None of the eight vocabularies exist yet** (grepped: no `--spacer-`,
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

**F5.1 · `guard-per-vocabulary` · Every vocabulary got a guard entry, not just spacer's** (Joel,
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

**F6 · `spacer-spans-3-properties` · The spacer vocabulary spans three properties; the guard takes one.**
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

**F6.1 · `padding-parked` · Padding needs an explicit ruling, because two records already disagree
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

**F7 · `greeting-dot-gap` · `0.45em` and `0.7em` are em-relative; the spacer scale is rem.** Both are
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

**F8 · `font-weight-multiples-of-100` · `font-weight` is not one of the eight, and the app writes six values.**
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

**F9 · `badge-vs-pill-shape` · The radius guard has already assigned a decision to this area.**
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
>   swept: `ChatBubble`'s counter chip and `ShuffleButton`. Both are square
>   boxes that may want `50%` instead, which is their own areas' call.
>   letterboxed's two are a game's own surface and the vocabulary does not look
>   there.
>
> **Blessed on sight (Joel, 2026-08-22): *"it's fine"*** — so `--radius-round`
> ships without `@@`, and `.badge`'s `0.4rem` side padding stays as it is
> against the new ~9.6px end caps.

### Color

**F10 · `solo-badge-color` · `--chrome-badge-color` has exactly one reader in the app**, and it is
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

**F11 · `list-cursor-written-twice` · The list-cursor logic is written twice, for three lists.** Clamp with no
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

**F12 · `page-header-trio` · The page-header trio is written three times.** Identical apart from the
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

**F13 · `frame-to-clubpage` · `.frame` — already carried forward to the `club-page` area**, recorded
here only so the homepage's shape is on file when that area opens. Home's is the
simplest of the three declarations (`width: 100%`, flex column, `gap: 1rem`) and
the only one bounded by `max-height` rather than `height` — because its body is a
content-sized card, and a fixed height would strand a two-club list at the top of
a full-viewport box.

> resolution: deferred to `club-page` by §7's carried-forward list

### Behavior

**F14 · `empty-clubs-is-a-fault` · A failed clubs fetch is displayed as "You haven't joined a club yet."**
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
>    `plans/error-copy-sprint.md`.
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

**F23 · `fault-modal-reaches-home` · The fault modal has to reach the homepage, and it already does**
(raised by Joel, 2026-08-22, when F14 was decided: *"faults get a modal, so
we'll need to get the modal-fault set up as part of this"*). Worth its own
number because the homepage is a SHELL page, and shell pages have twice been
caught missing something the game pages load — `theme.css` ships in PlayArea's
lazy chunk, so `SetupForm` and Help had to import their own or every token
resolved to nothing, silently.

> **resolution: nothing to build — verified, not assumed.** Two halves, both
> checked by reading the code rather than by trusting the mount:
>
> - **The host renders on `/`.** `<FaultDialog />` sits in `App.tsx` after the
>   auth + claim-handle gates and outside the route switch, so it is on every
>   real page.
> - **Its styling is not in a lazy chunk.** `FaultDialog.module.css` reads
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
> 1. **The wiring**, via `window.pupfault()` — the console trigger `FaultDialog`
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
> **Both were verified by planting.** Rendering `<FaultDialog>` conditionally
> false in `App.tsx` reddens BOTH cases, which is what proves the browser half
> rather than the store half; disabling the zero-clubs `presentFault` reddens
> only the second. Restored, and green after.
>
> One locator note worth keeping, since it cost a run: the panel's `×` and the
> modal's button carry the SAME accessible name, so `getByRole('button', {name:
> 'Close'})` is ambiguous. The spec takes `button.primary` — a global class from
> `patterns/button.css`, not a module hash, so it cannot rot the way F3 did.

**F15 · `focus-on-every-refetch` · `focusListOnLoad` re-runs on every length change, not on load.** Its
dependency is `[ordered.length]`, and the club list is realtime — a friend adding
you to a club re-runs it. It only takes focus when `document.activeElement` is
`null` or `<body>`, so the blast radius is small, but the name promises less than
the effect does.

> **resolution: folded into F38 (SelectionLists), 2026-08-22.** WHEN a list
> takes focus, and on what, is the component's decision — not something each
> page re-derives with its own effect and its own dependency array. The bug
> stands; it just gets fixed once, somewhere else.

**F25 · `is-solo-column` · The `=` convention is a database convention, so the database should
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
> `ClubPage.tsx:115` and `SetupGameDialog.tsx:208` still test
> `handle.startsWith('=')`, and `common.sql` + the setgame migration write
> `like '=%'` in SQL. *"Fine for now, but we should get '=' stuff out of FE
> when we get to them."* Filed on the plan's carried-forward list.

**F16 · `clubs-vs-ordered` · The empty branch tests `clubs`; everything else reads `ordered`.**
`clubs.length === 0` gates the message while the keyboard, the ring and the rows
all index `ordered`. They are the same set — `ordered` is a partition of `clubs`
— so this is one name too many, not a bug.

> **resolution: dissolved by F25, not fixed.** `ordered` existed only to move
> solo clubs to the front; once the database sorts them there, the second array
> has no reason to exist and there is one name again. Nothing was renamed —
> the thing that needed two names stopped happening.

### Comments and docs

**F17 · `archaeology-comments` · Four archaeology blocks**, which CLAUDE.md rules out ("how it used to
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

**F18 · `stale-solo-club-doc` · `docs/common.md:284` describes a homepage that isn't there.** It says a
solo club is "visually distinguished (star icon, accent background tint, 'Solo'
badge)". There is no star and no tint; the badge is the whole treatment.

> **resolution (Joel, 2026-08-22): fixed.** The sentence now reads "marked by a
> 'Solo' badge on the row and always sorted to the top" — the star and the tint
> are gone, since neither was ever built.

**F19 · `stale-playercountfits-doc` · `games.ts:801` names HomePage as a consumer it no longer has.**
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

**F20 · `stale-swallowtab-link` · `useSwallowTab`'s docstring sends the reader to the wrong page.** It ends
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

**F24 · `empty-list-keeps-box` · An empty list keeps its BOX, and says so inside it — the homepage is
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

### Layers

**F22 · `z-ladder` · The homepage is the first surface to need the z- vocabulary, and it
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

**F22.1 · `satellite-host-slot` · How a satellite names its host — decided, not built.** §20 says a
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

**F26 · `three-wrappers` · Three `.frame` rules, and only one of the differences is a decision.**

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

> resolution:

**F27 · `width-100-undeclared` · `width: 100%` is load-bearing, and only two of the three frames say
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

> resolution:

**F28 · `gamepage-bounds-itself` · GamePage skips the page-level bound entirely, and pays for it with a
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

**F29 · `which-pages-never-scroll` · The never-scroll invariant binds on two pages out of eight, and nothing
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

**F30 · `pagemain-widths` · Four widths for "how wide is a page's body", with no relationship
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

> resolution:

**F31 · `centering-said-4x` · Centering is declared three or four times over.** `body` centers its
grid item (`place-items: start center`); `.card` also says `margin: 0 auto`;
FontPage's `.page` says `margin: 0 auto` again; ClubPage's content well says
`margin-inline: auto`. At most one of these is doing work at any given moment,
and which one is not obvious from any of them.

> resolution:

**F32 · `pages-that-are-just-a-card` · Five of the eight pages have no page structure at all — they ARE a
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

**F35.1 · `card-is-white` · What a card is, and what makes the homepage white** (Joel,
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

**F35 · `card-and-frame-names` · `frame` and `card` are both vague names, and `card` is the worse of
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

> resolution:

**F33 · `wrapper-name` · The page element's name — a proposal, deferred by Joel.** *"We'll
discuss this when we dive in."* Written down now so the proposal is on the
record and F26 has something to wait for; F35 is the wider question it sits
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

> resolution:

> resolution:

**F34 · `stale-height-records` · Two stale records about page height**, both found while measuring:

- `ClubPage.module.css`'s frame comment says *"The body's 2rem padding (in
  theme.css) means we subtract 4rem from 100svh"*. The rule subtracts
  `2 * var(--page-padding-y)` — which is **1rem** total, not 4 — and the body
  rule lives in `base.css`, not `theme.css`.
- `ui.md:373` says ClubPage fits via `height: calc(100vh - body padding)`. It is
  `100svh`, and the difference is the whole mobile-Safari reason `base.css`
  documents at length.

> resolution:

### Loading and errors

**F39 · `loading-and-errors` · There are nine ways to say "not ready" or "broken", and they should be
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

> resolution:

### The three names this area produced

Each of these came out of the page-structure audit rather than out of the
homepage, and each is a THING to build rather than a line to change. They keep
this area's numbering (§ "Findings") because they were found here.

**F36 · `createclub-modal` · CreateClubPage should be a modal, not a page** (Joel, 2026-08-22:
*"CreateClubPage is a separate page, and that's probably pure-history: it was
one of the very first things we ever wrote in the app, and had thought out none
of the UI. I argue that it should be a modal — just like Setup and EditProfile
are."*).

The evidence agrees. It is already dialog-sized — an `h1`, one input, one
textarea, an error line, Cancel + Create — which is SMALLER than
`EditClubDialog`, and that dialog is its exact sibling: create and edit of the
same object. `SetupGameDialog` and `EditProfileDialog` are the same shape again.

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

> resolution: *(agreed, not built — "we'll do that one soon")*

**F37 · `card-only-page` · `CardOnlyPage` — a page whose whole body is one card** (Joel,
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

> resolution: *(named, not built)*

**F38 · `selection-lists` · `SelectionLists` — the keyboard-navigable list wants a real component**
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
- **F24** — an empty list keeps its box and puts the message inside it.

**And F3 is not folded, but its blocking question is now this one's.** The red
spec cannot be rewritten until someone says whether the cursor ring rides the
row's `<a>` or its `<li>`; today the ring is on one and the scroll ref is on the
other, which is the sort of thing a component exists to stop being a per-page
accident.

> resolution:

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
| `common/themes/daylight.css` · `midnight.css` | `--flex-color-1` (F10 — was `--chrome-badge-color`) |

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
