# Area: members

The folders it reads: `members` · `text`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN (2026-09-08).** Roster agreed and stamped
`cs-audited-members`; every file read end to end; fifteen findings recorded. It
was the next row after `buttons` closed.

**`src/common/text/` is deleted (2026-09-09, Joel).** F-members-1 is worked, and
F-members-7, -11, -12 and -13 close as moot with it — they were all
`RichMessage`. What remains of F-members-14 is the `members` half.

## The roster

Agreed 2026-09-08 — every source file of `src/common/members/` and
`src/common/text/`; the two folders' own files, not their importers.

| file | what it is | stamp |
|---|---|---|
| `src/common/members/member.ts` | the `Member` / `GamePlayer` types — who someone is; types only | `cs-audited-members` |
| `src/common/members/memberColor.ts` | `MEMBER_COLORS` and the four helpers that turn a palette name into a CSS reference | `cs-audited-members` |
| `src/common/members/memberColor.test.ts` | tests for two of those four helpers; all four after F-members-8 | `cs-audited-members` |
| `src/guards/memberPalette.test.ts` | WRITTEN by this area (F-members-8) — the five spellings of the palette agree | `cs-audited-members` |
| `src/common/members/memberList.ts` | `orderSelfFirst` and `memberById` — reading order, and the who-is-this lookup | `cs-audited-members` |
| `src/common/members/gamePlayers.ts` | `gp()`, a `GamePlayer` fixture builder; every importer is a test | `cs-audited-members` |
| `src/common/members/Dot.tsx` | the identity disc | `cs-audited-members` |
| `src/common/members/Dot.module.css` | its geometry and the three per-site knobs | `cs-audited-members` |
| `src/common/text/RichMessage.tsx` | `RichMessageType` + the component that renders it — text with inline player segments | DELETED (F-members-1) |
| `src/common/text/RichMessage.module.css` | the segment's inline-flex and its disc size | DELETED (F-members-1) |
| `src/common/members/doc.md` · `todo.md` | the lede; the Soon item about bare `.dot` classes | (no stamp — markdown) |
| `src/common/text/doc.md` · `todo.md` | the lede; empty | DELETED (F-members-1) |

The folder's `todo.md` was read first. Its one Soon item — consumer modules
style `<Dot>` as a bare `.dot` where half the app uses a qualified class — is
inherited. One of them was on this roster (F-members-12) and went with the
folder.

## Findings

### F-members-1 · `richmessage-has-no-callers` · Nothing in `src/` renders a `<RichMessage>` or builds a `RichMessageType`

`grep -rn RichMessage src` outside `common/text/` hits one line: the
`0.25rem` pending row in `vocabularies.test.ts`. Neither the component nor the
type has an importer. The one producer — connections' roster-mismatch error,
"…needs these players: ● bert, ● ernie" — went with `53e71cc1` (2026-08-13,
"the server picks the puzzle; the dialogs just say which"), and
`src/connections/manifest.ts:81` says so in as many words: *"There is no
find-or-create any more, and no roster-mismatch error with it."*

So the `text` folder is dead code, and three docs still describe the dead path:
`docs/common-folders.md:314` (*"it renders setup errors today"*),
`docs/games/connections.md:383` and `:466` (the rich roster-mismatch error).
`common/text` also sits on `DESIGNS_OWED`, owing a Design for a component
nothing uses.

**A decision, not a cleanup.** Two honest answers: delete the folder (with its
`DESIGNS_OWED` row, its `vocabularies.test.ts` pending row, its
`common-folders.md` table row, and the three doc sentences), or keep it as a
primitive on purpose — in which case its docstring must stop citing a producer
that no longer exists, and F-members-7, -11, -12 and -13 get worked. Joel's
call; nothing is removed unprompted.

**WORKED 2026-09-09 — deleted, on Joel's call.** The history settled it. The
component had exactly one render site for its whole life, and it was never a
feedback pill: born 2026-06-29 (`96b1d13e`) rendering connections'
`rosterMismatchError()` on the setup dialog's error line; the producer went
2026-08-13 (`53e71cc1`), leaving the union's array half unreachable; the render
site went 2026-08-27 (`1273fe96`), when the dialog became an ordinary
`StandardForm`. Nothing has named it since. And the slot it filled is now shaped
against it — `SetupGameModal.tsx` puts `result.message` on a form line, and an
envelope's `message` is a `string`, so reviving the component would take a
change to the envelope shape rather than to the component.

Removed with it: `src/common/text/` entire (four files), the `common/text` row
in `folderDocs.test.ts`'s `DESIGNS_OWED`, the `RichMessage.module.css` row in
`vocabularies.test.ts`'s spacing pending list, the `text` row and the two
`RichMessage` bullets in `docs/common-folders.md` (the folder table, the
"generic text renderer is NOT feedback" classification rule, the judgment
call), and the roster-mismatch sentence in `docs/games/connections.md`. The
area row in `app-audit.md` now says the folder is gone.

### F-members-2 · `docstring-recommends-coloring-text` · `colorVarFor`'s docstring tells callers to color the name text, which docs/ui.md forbids

`memberColor.ts:49`: *"Use as a `style={{ color: colorVarFor(member.color) }}`
… directly."* docs/ui.md → "Player identity = a colored disc" has the opposite
rule: *"Identity rides the disc, never the text. Don't encode a player by
coloring a word."* The helper's own docstring is the first thing a caller reads,
and it points them at the breach.

Four sites do exactly that today, all outside this roster:
`codenamesduet/components/InfoCol.tsx:144` and `:154`,
`common/chat/ChatBody.tsx:130`, `common/pause-suspend/PauseOverlay.tsx:113`.
(`common/word-list/WordList.tsx:249` colors an underline's
`textDecorationColor` for a recent word — an accent beside a disc, not the
identity carrier; not counted.) ui.md:1350 already knows: *"several older logs
still encode the actor by coloring the name text … tracked as a consistency
follow-up"* — but no `todo.md` tracks it (grep finds nothing). The
`core-css/fixed.css` header goes further and states the colors *"paint chat
names and list labels as well as the dot"* — `corecss` is paused, so that
sentence is noted for it, not touched here.

**Proposed:** rewrite the docstring to say what the reference is for (a disc's
fill, a map value, a decoration accent) and to point at the disc rule; hand the
four sites to their folders' `todo.md` (chat, pause-suspend, codenamesduet),
since swapping a colored name for a `<Dot>` is a design change each surface
makes with its files open.

**WORKED 2026-09-09 — the four sites are converted, not handed off** (Joel:
"on the pause page, show player name in black and with the member dot… same for
chat… same for codenames duet"). Each renders the shared `<ActorDot>`
(`common/turn-log/ActorMention`), whose stylesheet already carried the rule.
`show="both"` at all four: they are sentences, and the mention's default drops
the name on a phone. The names now inherit their line's color, so the two duet
banners keep their green/tan rather than turning literally black. The weight
dropped to the mention's 500 (chat was 600, the two banners were `<strong>`);
`PauseOverlay`'s is the one to look at, since its line is a 700 block headline.
`ChatBody.module.css` lost `.senderName` with its only caller.

The docstring is rewritten too: `colorVarFor` now says the reference paints a
SHAPE and never a name, and points at `<ActorTag>` / `<ActorDot>`.

Two sentences that described the old state went with it. `docs/ui.md:1350` said
*"several older logs still encode the actor by coloring the name text …
tracked as a consistency follow-up"* — nothing does now, so the follow-up is
gone and the paragraph names both widgets instead of only `<ActorTag>`. And
`core-css/fixed.css`'s MEMBER header said the fills paint *"bold name labels
(chat usernames)"* — **that file belongs to the paused `corecss` area**, whose
re-read is done and whose blessing is pending, so Joel should know it was
edited after the fact; the alternative was leaving a header that is now flatly
false.

### F-members-3 · `stale-paths-and-names` · Six citations name files, folders or tokens that moved or were renamed

| where | says | is |
|---|---|---|
| `member.ts:13` | *"the single most-imported name in `common/lib/`"* | `common/lib/` no longer exists |
| `member.ts:16` | `terminalOutcomeVerb.ts` *"lives next door"* | it is in `common/terminal/` |
| `memberColor.ts:10` | *"`themes/fixed.css` owns the actual shade"* | `core-css/fixed.css` |
| `memberColor.ts:8` | `common.color_for_username` *"in the baseline migration"* | defined in `supabase/sql/common.sql:544` (behavior); the migration only mentions it |
| `Dot.tsx:34` | *"paired `-border` shade (see theme.css)"* | the token is `--member-NAME-edge-color`, in `fixed.css` |
| `docs/ui.md:1348` | *"`-border` ring (`--member-NAME-border-color` … in theme.css)"* | same three facts, same fix — ui.md keeps the disc's taxonomy, so this area owns the sentence |

Also `docs/common.md:236` cites `lib/members/terminalOutcomeVerb.ts`; the
link target is right and the display path is not. A one-word fix that rides
along.

**WORKED 2026-09-09 — and the six were not all of them.** Grepping each stale
NAME rather than each cited line found five more, all of them members' own
prose: `docs/naming.md:132` and `docs/code-conventions.md:681` + its two
example import lines cite `common/lib/members/member.ts`, and
`docs/naming.md:159` cites both `common/lib/color/memberColor.ts` and a
`--member-*-dot-color` token that has never existed under that name.
`docs/common-folders.md:336` is why they were still there — prose paths
elsewhere in `docs/` were left for "each area of the app audit" — and members
is that area for these.

Two of them carried a second error past the path. `naming.md:159` gave
"coloring your own chat-message label" as the example of a member-level color;
F-members-2 ended that, so it now says the disc beside the message.
`docs/deferred.md:85`'s `-edge` item named the token `-border-color`, and asked
"whether name labels should switch to the border shade outright" — a question
with no subject left. Its other two cases (connections tile-selection borders,
crosswords peer-cursor frames) are real and stay.

**`borderVarFor` keeps its name.** The tokens are `-fill-color` / `-edge-color`
and the functions are `colorVarFor` / `borderVarFor`: two schemes, one naming
the visual part and one naming the CSS property it feeds, and the citations
were conflating them rather than the code being wrong. Renaming half the pair
would trade this for a worse mismatch, so the whole-pair question
(`fillVarFor` / `edgeVarFor`) is in `members/todo.md` to be decided as a pair.

### F-members-4 · `census-sentences` · Counts and who-uses lists, which the ruling deletes rather than corrects

- `member.ts:13`: *"over a hundred files"*. `memberList.ts:11`: *"well over a
  hundred files"*. (`terminal/terminalOutcomeVerb.ts:15` has the same sentence
  — the terminal area's, noted for it.) The fact that matters is *types only,
  so imports erase*; the count is the drift-magnet.
- `memberColor.ts:14–17`: *"Used wherever … the member-list circles, chat name
  labels, per-member in-game affordances (tile-selection borders, etc.),
  per-game guess/clue history rows"* — a who-uses list, and one item of it
  (chat name labels) is the breach in F-members-2.
- `memberColor.ts:23–25`: *"exported so the 'Edit profile' color picker can
  map over it"* — a who-uses sentence.
- `memberList.ts:20–22`: *"the progress strip, the turn log's whose-turns
  filter, the word list's whose-words filter, and any game rendering its own
  roster"* — true today (four callers) and still a list that rots. The
  sentence before it — "you, then the others" is the reading order — is the
  rule and survives.

`Dot.tsx`'s prop notes give one example each for `hollow` (an away member, an
unfound word) — examples that explain a prop's meaning, not a census. Kept.

**WORKED 2026-09-09.** All five deleted. `MEMBER_COLORS`'s comment keeps a fact
the picker sentence was standing in for: the ORDER is part of the contract,
because it is the order the swatches lay out in. `orderSelfFirst` keeps "you,
then the others" and loses the four callers. The third copy of the count, in
`terminal/terminalOutcomeVerb.ts`, went too rather than waiting for its own
area — leaving one of three identical sentences is how the three drift apart.

### F-members-5 · `dark-theme-contradiction` · `memberColor.ts` says the indirection exists so a dark theme can remap the palette; the palette is exempt from theming

`memberColor.ts:11`: *"That indirection means a future dark theme can remap each
palette entry without rewriting every consumer."* docs/ui.md:721 and the
`fixed.css` header say the opposite: the eight member colors are *"exempt from
theming … a theme has nothing to say about them."* The indirection's real
reason is that one file owns the hex. Rewrite the sentence to that.

**WORKED 2026-09-09.** It now says the hex lives in one file and a consumer
names the player, never the shade — and says outright that this is not theme
groundwork, since the sentence it replaces is the obvious thing to write again.

### F-members-6 · `white-ring-is-a-hex-literal` · `Dot.tsx:53` hard-codes `'#fff'` for the ring on a colored surface

The one hex literal in a component on this roster, and the one place the
member palette's contract ("fill + edge") has a third value with no name.
`--page-bg-color` is not it — the ring is white because it separates any disc
from a *saturated fill*, not because the page is white. Under the a/b/c rule
this is surfaced and decided: name it beside the pair in `fixed.css` (the ring
on a colored surface is part of the member palette's contract, and it is as
theme-exempt as the pair), or keep the literal on purpose with a sentence
saying why. Joel's call.

### F-members-7 · `richmessage-archaeology` · The `RichMessageType` docstring tells how it used to work

`RichMessage.tsx:15–19`: *"It lived in `lib/games.ts` until the split, where
this file was its only importer — and imported it back out under exactly this
alias."* Archaeology; the durable half is one clause — named `RichMessageType`
because the component owns the plain name.

**CLOSED MOOT 2026-09-09** — the file is gone with F-members-1.

### F-members-8 · `test-covers-half-the-module` · `memberColor.test.ts` tests two of four exports and re-spells the palette

- The docstring says *"the two pure helpers"*; the module exports four.
  `borderVarFor` and `defaultColorFor` have no test — `defaultColorFor`'s one
  contract (stable, spread across the eight) is the kind a test states well.
- The palette test spells the eight names instead of importing
  `MEMBER_COLORS`. That is the right choice (a test that imports the list it
  checks proves nothing) but nothing says so, and it looks like a copy.
- The real invariant has no guard anywhere: **three places spell the
  palette** — the CHECK on `common.profiles.color`
  (`20260615000000_common.sql:117`), the `update_profile_color` PN033 list
  (`common.sql:2518`), and `MEMBER_COLORS` — with two comments asking a human
  to *"keep in sync."* Guard the vocabulary: a test that reads the two SQL
  lists off disk and asserts equality with `MEMBER_COLORS`.

  **It was FIVE places, not three** (found 2026-09-09, planting a failure into
  the guard: the plant hit two matches where one was expected). The two the
  read missed are both in `common.sql` — `claim_username`'s PN015 allow-list
  (`:2425`) and the array `common.color_for_username` picks from (`:550`). The
  second is the interesting one: it carries the palette's LENGTH as well as its
  names, as the `% 8` that indexes the array, so a ninth color added to the
  other four would leave that function unable to ever return it.

**WORKED 2026-09-09.** `src/guards/memberPalette.test.ts` reads all four SQL
sites off disk and compares each as a SET with `MEMBER_COLORS` — order is
meaningless in three membership tests and a hash bucket, and `MEMBER_COLORS`'s
own order belongs to the picker. It asserts the modulo separately, and it
asserts that each list was FOUND, because a reworded anchor would otherwise
leave it comparing two empty arrays and passing. Verified by planting four
failures (a name added to the FE, a name dropped from PN015, a changed modulo,
a reworded anchor); each failed with the message that names the cause.

`memberColor.test.ts` gains `borderVarFor` (the edge var, and the same
fallback contract) and `defaultColorFor` (always in-palette, stable per
username, and reaching all eight over 200 names). Its docstring now says why
the palette is spelled by hand there — a test that imports the list it checks
proves only that the function interpolates — and points at the guard for the
agreement question.

### F-members-9 · `fixture-named-like-a-module` · `gamePlayers.ts` is a test fixture wearing a module's name

The file name says "game players"; the contents are one function, `gp()`, and
all sixteen importers are `PlayArea.test.tsx` and two hook tests. The repo
already has a shape for this: `boggle/lib/solver.fixture.ts`,
`strands/lib/oracle.fixture.ts`, `crosswords/lib/fixtures/`. A rename to
`gamePlayer.fixture.ts` says at a glance what the file is. `gp` as the
builder's name is a fixture idiom (sixteen call sites, terse by design); leave
it or lengthen it — Joel's call.

### F-members-10 · `member-docstrings-duplicate-and-underdocument` · `member.ts` says the same thing twice and leaves a field undocumented

- The file docstring and the `Member` docstring both explain member-vs-player
  naming and both cite docs/naming.md. One copy.
- ~~`GamePlayer`'s bullets: *"Drives the OpponentStrip 'out' marker"* —
  `OpponentStrip.tsx` never reads `conceded` and draws no such marker.~~
  **WRONG, and the docstring was right** (found 2026-09-09, working the
  finding). `OpponentStrip` takes a `metricFor(player, isSelf)` callback and
  seven games return the string `'out'` from it when `concededIds.has(...)`
  (`connections/components/InfoCol.tsx:193` + six siblings). The field really
  does drive the marker; the strip simply never names it, which is what an
  `OpponentStrip.tsx` grep looks like and how this was misread. The docstring
  now says who renders it, so the next grep does not end the same way. The same
  claim appears in ~15 doc sentences and in
  `20260615000000_common.sql:533` — all of them accurate, none to touch.
- The bullets list `conceded` and `result` and skip `conceded_at`.
- The `color` field's `//` note points at `colorVarFor` by full path; the
  short form is enough inside the same folder.

**WORKED 2026-09-09.** The naming rule keeps one copy, in `Member`'s docstring,
because that is the one a hover shows. `conceded_at` gets a bullet saying it is
written and cleared with the flag, so a true `conceded` always carries one
(`common.sql:1562`, and `reset_game` clears the pair). The `color` note now
says what the field IS — a palette name, never a hex — and names both resolvers
rather than one file path.

### F-members-11 · `richmessage-defeats-em-sizing` · Dot's default size is em so an inline dot tracks its text; `RichMessage`, an inline text row, overrides it to `0.6rem`

`Dot.module.css:7`: *"default em-relative: inline dots track text."*
`RichMessage.module.css:15`: `--dot-size: 0.6rem`. The one caller whose whole
point is inline text is the one that opts out of tracking it. `core-css/todo.md`
already holds the app-wide em-versus-rem question for `--dot-size`; this is
this roster's own instance. Also `gap: 0.25rem` sits on the `vocabularies`
pending list and IS `--spacer-5` — a straight conversion.

**CLOSED MOOT 2026-09-09** — the stylesheet is gone with F-members-1, and its
pending row with it. `core-css/todo.md` still holds the app-wide question.

### F-members-12 · `bare-dot-class` · `RichMessage.module.css` is one of the ten bare `.dot` modules the todo names

The inherited Soon item. `Dot.module.css` owns `.dot` legitimately; a consumer
naming its size-override class `.dot` too is the drift. `.playerDot` or
`.segmentDot`.

**CLOSED MOOT 2026-09-09** — gone with F-members-1. The inherited item stays in
`members/todo.md` for the consumers outside this roster.

### F-members-13 · `props-doc-names-the-wrong-type` · `RichMessage`'s `message` prop says "a `RichMessage` array"

The type is `RichMessageType`; `RichMessage` is the component. Trivial.

**CLOSED MOOT 2026-09-09** — gone with F-members-1.

### F-members-14 · `doc-lede-omits-half-the-folder` · `members/doc.md` describes the types, the color and the disc, and not the list operations or the fixture

*"Who someone is, the color that identifies them, and the disc that shows
it."* `memberList.ts` (reading order, lookup) and `gamePlayers.ts` are in the
folder and not in the sentence. The Design is owed and is where the folder's
one real idea goes: identity is a name plus a color, the color is a NAME the
DB constrains and the FE resolves, and the disc is the only thing that carries
it. (`text/doc.md` is gone with F-members-1; only the `members` half is left.)

### F-members-15 · `two-fallbacks-for-nobody` · The helpers fall back to `--page-text-color`; `chatUnread.ts` picks `--page-text-muted-color` for the same case

`colorVarFor` / `borderVarFor` answer body text for a missing or unknown name —
documented, tested, and what `useCommonGame.ts:692` leans on for the "Someone"
pseudo-member. `common/chat/chatUnread.ts:102` answers muted text for a sender
not in the roster. Two answers to "no member here." Whether one of them is
wrong is a look-at-it question, not a read one; recorded so it is asked.

## Notes

- **`borderVarFor` has one caller, `Dot.tsx`.** Not a finding — the disc is
  the ring's one job — but the name says `border` and the token says `edge`;
  F-members-3's rewrite is the moment to decide whether the function follows
  the token.
- **`onColor` has one caller** (psychicnum's Board); `hollow` has two
  (PageHeaderPlayersStrip, WordList). `hollow` + `onColor` together would draw a
  dark ring on a colored tile; no site does it.
- **Every spelling of the palette agrees today**, same eight names, same order
  — and there are five of them, not the three the read found. F-members-8's
  guard is what keeps it that way.
- **`fixed.css`'s header** said the member colors paint *"bold name labels
  (chat usernames)"* — a `corecss` sentence, and F-members-2 made it false the
  day it landed. Fixed there rather than noted, and called out for `corecss`.
- **`terminalOutcomeVerb.ts:15`** carried the same "well over a hundred files"
  count as F-members-4. Deleted with the other two rather than left for the
  `terminal` area (row 41, still `cs-unmet`).

## Predicted test breaks

*(written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
