# Area: buttons

The folders it reads: `buttons`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN (2026-09-05).** Roster agreed (Joel: "audit this area") and
stamped `cs-audited-buttons`; nineteen findings recorded, plus F-buttons-20
(raised by Joel, not by the read: the `label`/`show` vocabulary). Worked:
F-buttons-1 through -5, -7, -8, -10 through -14, -17, -18 and -20. Closed with
no change: F-buttons-6, -9 and -16 (absorbed by the F-buttons-20 rewrite),
F-buttons-15 (`buttons.html` ruled out of scope) and F-buttons-19 (its sites
are not buttons in the normal sense). **Every finding is resolved.** Opened out
of §3's order: `members` is the next row, and Joel chose `buttons` first.

**A docstring standard came out of F-buttons-5 and governs the rest of the
area:** a purpose button's docstring answers *when do I reach for this* and
*what do I pass*, and nothing else — glyph tuning, box mechanics and class
names belong in a `//` comment at the line they explain. With F-buttons-3's
ruling (the tone never appears in a docstring), that is the shape every file
here is being brought to.

## The roster

Agreed 2026-09-05 — every source file of `src/common/buttons/`, one
`StandardButton` and the purpose buttons built on it.

| file | what it is | stamp |
|---|---|---|
| `src/common/buttons/StandardButton.tsx` | the one `<button>` — weight × tone × label/show/tooltip; every purpose button composes it | `cs-audited-buttons` |
| `src/common/buttons/StandardButton.module.css` | the taxonomy's stylesheet — `.standardButton`, `.small`, `.iconOnly`, the tone and weight rules (292 lines) | `cs-audited-buttons` |
| `src/common/buttons/StandardButton.test.tsx` | the rules that keep `label` / `show` / `tooltip` three things | `cs-audited-buttons` |
| `src/common/buttons/AIButton.tsx` | ask an AI helper — sparkles, the amber shared with Hint | `cs-audited-buttons` |
| `src/common/buttons/BackToClubButton.tsx` | leave the game for the club; draws "Club", called "Back to club"; filled at terminal, outline elsewhere | `cs-audited-buttons` |
| `src/common/buttons/CancelButton.tsx` | never mind — always "Cancel", always the quiet outline, never a drawn glyph | `cs-audited-buttons` |
| `src/common/buttons/FormSubmitButton.tsx` | **written by this area** (F-buttons-20) — a form or dialog's commit, Cancel's partner: it owns `type="submit"` + the emphasis, and defaults no words | `cs-audited-buttons` |
| `src/common/buttons/ClearButton.tsx` | wipe the pending selection — the eraser on a plain outline | `cs-audited-buttons` |
| `src/common/buttons/CloseButton.tsx` | dismiss the thing this sits in — a component because it owns the glyph | `cs-audited-buttons` |
| `src/common/buttons/CloseButton.module.css` | its stylesheet (24 lines) | `cs-audited-buttons` |
| `src/common/buttons/ConcedeGameButton.tsx` | one player quitting a compete race — distinct from End | `cs-audited-buttons` |
| `src/common/buttons/DeleteButton.tsx` | backspace — remove the last typed character; the glyph scaled up, since it reads small | `cs-audited-buttons` |
| `src/common/buttons/EndGameButton.tsx` | the manual "we're done" for solo / coop — destructive red, the crossed-out stop sign | `cs-audited-buttons` |
| `src/common/buttons/EndTurnButton.tsx` | hand play on — the octagon at primary weight | `cs-audited-buttons` |
| `src/common/buttons/ExchangeButton.tsx` | scrabble's swap — two-way arrows, the accent blue, "Swap" | `cs-audited-buttons` |
| `src/common/buttons/HelpButton.tsx` | icon-only "?" that opens a game's rules on top of the setup dialog | `cs-audited-buttons` |
| `src/common/buttons/HintButton.tsx` | ask for a clue — amber | `cs-audited-buttons` |
| `src/common/buttons/NewGameButton.tsx` | a fresh game with the same setup — the accent blue, "New game" | `cs-audited-buttons` |
| `src/common/buttons/PassButton.tsx` | skip your turn, de-emphasized — the octagon at secondary weight | `cs-audited-buttons` |
| `src/common/buttons/PauseButton.tsx` | pause / unpause, aware of manual vs presence pause | `cs-audited-buttons` |
| `src/common/buttons/PauseButton.module.css` | its stylesheet (18 lines) | `cs-audited-buttons` |
| `src/common/buttons/PeelButton.tsx` | bananagrams' primary move — the banana, primary weight | `cs-audited-buttons` |
| `src/common/buttons/RestartButton.tsx` | start this board over — the accent blue, "Restart" | `cs-audited-buttons` |
| `src/common/buttons/Segmented.tsx` | **written by this area** — a segmented choice: the joined frame + the group's label, segments left to the caller | `cs-audited-buttons` |
| `src/common/buttons/Segmented.module.css` | its stylesheet, moved here from `core-css/patterns/segmented.css` | `cs-audited-buttons` |
| `src/common/buttons/RevealButton.tsx` | uncover the whole hidden answer of a finished game — destructive red, boxed eye | `cs-audited-buttons` |
| `src/common/buttons/SharePreviewButton.tsx` | scrabble's show-a-move broadcast — a blue outline, drawn as a glyph | `cs-audited-buttons` |
| `src/common/buttons/ShuffleButton.tsx` | shuffle the tile set — its own component with its own stylesheet | `cs-audited-buttons` |
| `src/common/buttons/ShuffleButton.module.css` | its stylesheet (73 lines) | `cs-audited-buttons` |
| `src/common/buttons/SpoilerButton.tsx` | hand over one hidden item mid-game — amber, the bare eye; the rung above Hint | `cs-audited-buttons` |
| `src/common/buttons/SubmitButton.tsx` | send my move — the up triangle at primary weight; "deliberately thin" | `cs-audited-buttons` |
| `src/common/buttons/SubmitWithScore.tsx` | scrabble's submit carrying the staged play's score; a raw `<button>`, not a `StandardButton` | `cs-audited-buttons` |
| `src/common/buttons/SubmitWithScore.module.css` | its stylesheet (26 lines) | `cs-audited-buttons` |
| `src/common/buttons/TrashButton.tsx` | destroy this thing — destructive by default so it looks irreversible before the press | `cs-audited-buttons` |
| `src/common/buttons/WordCheckButton.tsx` | check my own work — the accent blue, deliberately not Hint's amber | `cs-audited-buttons` |
| `src/common/buttons/ZoomFitButton.tsx` | frame the whole board — icon-only, the shared square box | `cs-audited-buttons` |
| `src/common/buttons/doc.md` | the lede + the Design (written by this area; `common/buttons` is off `DESIGNS_OWED`) | (no stamp — markdown) |
| `src/common/buttons/todo.md` | the Soon items handed in by earlier areas, plus what this area filed; the area's first read once it opens | (no stamp — markdown) |

**Evidence, not roster** (to settle at the opening): `docs/buttons.html` —
the rendered button tone grid, the twin of the theme's BUTTON block, which the
stylesheet outranks; `docs/ui.md` → the button taxonomy and "What a `<button>`
is" (which `todo.md` already says is stale); `themes/daylight.css` → BUTTON,
which is `corecss`'s and paused; and the call sites — sixty-five files outside
the folder import from it.

## Findings

Recorded 2026-09-05 from one read of the thirty-three files, every claim
re-checked against the tree. The folder's `todo.md` was read first; its five
items reappear below re-judged (F-buttons-3, -11, -13, -18, -19). Shape and
behavior first, then the theme and the docs, then prose. No prefix means OPEN.

### WORKED · F-buttons-1 · `back-to-club-never-icon-only` · `<BackToClubButton label={null}>` draws text anyway

`BackToClubButton` computes what it draws as
`label ?? (compact ? 'Club' : undefined)`. `??` treats `null` like
`undefined`, so `label={null}` — the one value `StandardButton` defines as
"draw no text" — becomes `'Club'` when `compact` is set and `undefined`
(which draws the full name, "Back to club") when it is not. The button cannot
be icon-only from any call site.

Who asks for it: ten info columns render `<BackToClubButton label={null}>`
(boggle, letterboxed, setgame, spellingbee, strands, waffle, wordiply, wordle,
wordwheel; crosswords with `compact` too), and ten games pass
`backLabel={null}` through `<TerminalActionRow>`, whose prop docstring
promises "pass `null` for the icon-only square". `docs/ui.md` → Terminal
results says the same ("most games pass `iconOnly` so the row survives a
~22rem column"). Every one of those draws "‹ Club" or "‹ Back to club" today.

**Recommendation:** write the `undefined`/`null` split out, the way the base
does — `label === undefined ? (compact ? 'Club' : undefined) : label` — and
let the base's `aria-label` rule stand for the icon-only case (the explicit
`aria-label={name}` stays for the compact case, where "Club" is drawn but the
control is called "Back to club"). Then look at the terminal rows in the
gallery: they have never rendered as designed, so the design should be seen
before it ships.

**Resolution (2026-09-06, Joel: "let's make the back-to-club button just like
the other buttons (so it loses the 'compact' property) and its default label is
just '< Club'")** — the recommendation is superseded and the fix is smaller
than it: `compact` is gone and the drawn text is a default PARAMETER,
`label = 'Club'`. A default parameter treats an explicitly passed `undefined`
as omitted, which is the `undefined` = "use the default" half of the rule
`StandardButtonProps` documents, so `label={null}` now reaches the base
untouched and suppresses the text. The `??` was deleted, not rewritten. The
explicit `aria-label={name}` stays — the drawn word is never the name now, and
every test and e2e selector finds this button by "Back to club".

Two call sites relied on "the label defaults to the name" and had to say what
they draw, since the default is no longer the name:

- `PauseOverlay` passes `name="Suspend and return to club"` and now passes the
  same string as `label`. It is the one place the button says more than "Club":
  leaving a paused game suspends it, and the overlay is wide enough to say so.
- `DeviceBlockNotice` drew "Back to club" and now draws "Club" — it takes the
  new default, which is what the ruling asks for. Its card is the one surface
  where the longer text would still fit, so it is the place to look first if
  the short word reads too terse.

**The chevron got heavier, in the registry (2026-09-06, Joel: "the icon
*itself* should be thicker, wherever its used. no new icon. just make it a bit
thicker").** Making `label={null}` work is what exposed it: at lucide's default
weight of 2 a chevron is two strokes and no body, and the icon-only form is
that hairline alone in an empty square. So `IconBack` is now a component in
`common/icons/icons.ts` carrying `strokeWidth={2.75}`, not an alias of
`ChevronLeft` — the weight belongs to the glyph, so all three call sites get it
(this button, the game menu's Back-to-club row, the club menu's Back-to-home
row). Two consequences worth knowing:

- It is the first glyph in the registry that is not a bare re-export, so its
  argument moved below the export block and a pointer sits in its place. The
  file's grouping is load-bearing by its own docstring ("a glyph is chosen
  against its NEIGHBORS"), which is what the pointer protects.
- `MenuItem.icon` was typed `LucideIcon`, which a component of ours cannot
  satisfy. The registry now exports `AppIcon` and the menu takes that. Its
  comment claimed the menu's type "is the same type `ActionButton.icon` takes",
  which was false twice over — `ActionButton` is gone (F-buttons-4) and
  `StandardButton` takes the wider `ButtonIcon`. It now says what is true.

**Files this area changed outside its roster:** `common/icons/icons.ts`
(`cs-blessed-icons`) and `common/menu/menuModel.ts` (`cs-unmet`). Neither takes
this area's stamp; both are named here so the close can see them.

The number to look at is 2.75, which has not been seen on screen — the stroke
is the one part of this that cannot be checked from the source.

Correction to the finding: **fifteen** games pass `backLabel={null}` through
`<TerminalActionRow>`, not ten (the ten direct `label={null}` info columns were
right). So twenty-five call sites change appearance at once, into a design that
has never rendered — the gallery pass the finding asks for is still owed and is
the review of this change.

### WORKED (with F-buttons-1) · F-buttons-2 · `variant-is-weight` · One axis, two props

`BackToClubButton` takes `variant?: 'primary' | 'secondary'` and passes it as
`weight`. Its `Props` is `PurposeButtonProps & {…}`, so `weight` is still
accepted and rides in `...rest`, which spreads AFTER `weight={variant}` and
wins. Two props name one axis, and only this purpose button renames it. Three
callers pass `variant="primary"` (`TerminalActionRow`, `DeviceBlockNotice`,
crosswords' terminal strip).

**Recommendation:** drop `variant`; take `weight` with the default
`'secondary'` like every sibling, and change the three callers.

**Resolution (2026-09-06, same ruling — "just like the other buttons", then
"we should drop the special props for back-to-club button")** — `variant` is
gone and the three callers pass `weight="primary"`. The button does not name
`weight` at all: a sibling only declares an axis where its default differs from
the base's, and `secondary` already is the base's.

The required `onClick` went with it, so the button now takes
`PurposeButtonProps` and nothing else. It was the only button in the folder
that required a handler, and it required one for no stated reason — the
requirement had ridden in on the bespoke `Props` block that existed to hold
`variant` and `compact`, and the siblings that take `PurposeButtonProps`
directly have nowhere to put such a thing. It also narrowed the handler to
`() => void`, where the native one takes an event.

Whether a button HAS a handler turns out to be a property of the call site, not
of the button: two groups render one with none — a `type="submit"` form commit
(nine `StandardButton`s plus codenamesduet's `SubmitButton`), and an inert
`disabled` placeholder held so a row does not change shape (`ConcedeGameButton`
in nine info columns, `RevealButton` in five). `spellingbee/InfoCol.tsx` renders
the same Concede both ways four lines apart. So the requirement could never
have become a family rule.

### WORKED · F-buttons-3 · `tones-that-do-not-exist` · Seven docstrings name a tone the type has never had

`ButtonTone` is `quiet | normal | caution | destructive | success`. The
docstrings say: `warning` (AIButton, HintButton, PassButton, SpoilerButton —
each passes `caution`), `neutral` (ClearButton — passes nothing, so `normal`),
`info` (WordCheckButton — passes `normal`), and "the `error` red"
(ConcedeGameButton — passes `destructive`). HintButton adds that it is "the
same amber as a `warning` feedback pill", and `daylight.css` → CAUTION says
the opposite at length: the button orange is deliberately NOT the outcome
orange (hue 48° against 70°). The todo's PassButton item is this finding, one
file of seven.

**Recommendation:** name the tone the code passes, in every file, and delete
the pill comparison. The same sentence lives in scrabble's `Controls.tsx`
docstring and `docs/games/scrabble.md` ("`warning` tone") — a sweep, since
this folder owns the vocabulary.

**Resolution (2026-09-06, Joel: "i think we shouldn't put the tone in
docstring --- it's not useful for the docstring, and it can drift.")** — the
recommendation is superseded: the tone came OUT rather than being corrected.
A docstring naming the tone is a second copy of the line of code directly
below it, and the seven wrong ones are what a second copy does over time.

That makes it a bigger sweep than the finding, and rightly: **fifteen files
named a tone, not seven.** The eight that happened to be right (`CancelButton`,
`EndGameButton`, `ExchangeButton`, `NewGameButton`, `RestartButton`,
`RevealButton`, `SharePreviewButton`, `BackToClubButton`) could drift exactly
as the other seven had, so they lost the token too. Outside the folder,
scrabble's `Controls.tsx` (twice) and `docs/games/scrabble.md` said "`info`
tone" for Swap and "`warning` tone" for Pass; both are gone.

Two judgment calls in the execution:

- **The token went; the argument stayed.** Most of these sentences wrapped a
  real point — why Reveal is not Spoiler, why WordCheck is not Hint — around
  the token. The point is why anyone reads the docstring, so it survives in
  plain words ("irreversible", "help you asked for", "the main move").
- **Color words stayed** ("amber", "the accent blue", "red"). They describe
  what a reader sees rather than naming a value the code sets, and the
  sibling comparisons need them. Worth revisiting if a theme ever moves one.

`HintButton`'s false claim is gone with the rest of it: it said its amber was
"the same amber as a `warning` feedback pill", where the theme's CAUTION block
says it is rotated a third of the way to red for exactly the reason that it
must not be. The docstring now says that, and points at the theme.

Still open in this area, and not touched here: `docs/ui.md`'s "Hint / Reveal =
`caution`" (F-buttons-13, where Reveal is `destructive`) and
`daylight.css`'s BUTTON header (F-buttons-14).

### WORKED · F-buttons-4 · `ghost-action-button` · `ActionButton` is gone and still named across the tree

There is no `ActionButton` in the tree. Inside the folder it is named by
`BackToClubButton` ("`aria-hidden` inside `ActionButton`"), `HelpButton` ("a
thin wrapper over `ActionButton`"), `SubmitWithScore` ("the `ActionButton`
family") and `StandardButton.module.css` ("`ActionButton.module.css`'s tone
classes came with them"). Outside: `codenamesduet/CluePanel.tsx:374`,
`menu/menuModel.ts:59`, `tooltips/TooltipHost.tsx:26`,
`definitions/WordEditDialog.module.css:49`, `docs/deferred.md:121` (which also
names `theme.css`), and `docs/ui.md` six times (F-buttons-13).
`devtools/PalettePage.tsx:49` names it too and is out of bounds.

**Recommendation:** `StandardButton` wherever the sentence survives the
substitution; where the sentence only existed to say "it's an ActionButton",
delete it. The `docs/ui.md` hits fold into F-buttons-13.

**Resolution (2026-09-06, Joel: "do it")** — every mention outside
`docs/ui.md`'s two button sections is gone: `HelpButton`, `BackToClubButton`,
`SubmitWithScore`, `codenamesduet/CluePanel.tsx`,
`definitions/WordEditDialog.module.css` and `tooltips/TooltipHost.tsx` each
took the substitution, and `StandardButton.module.css`'s clause was deleted
rather than substituted — "`ActionButton.module.css`'s tone classes came with
them" becomes nonsense when the file it names IS the file it is written in.
That clause was also F-buttons-7's archaeology, so that finding is one item
lighter.

**The five remaining mentions are all in `docs/ui.md` 2109–2201, and are
deliberately LEFT for F-buttons-13**, which rewrites both those sections
whole. Fixing a noun inside a paragraph that is being replaced is work thrown
away.

Two things the finding did not have:

- **`docs/ui.md`'s icon-type sentence had gone wrong under this area's own
  hand.** It said "`MenuItem.icon` is typed `LucideIcon`, the same type
  `ActionButton.icon` takes" — one stale name when the finding was written, two
  after F-buttons-1's `AppIcon` change. Fixed here, not deferred, because this
  area broke it.
- **`docs/deferred.md`'s slot-rename item named three files and got all three
  wrong**, which made a deferred item unactionable rather than merely stale:
  `theme.css` does not exist (the themes are `themes/daylight.css` and
  `themes/midnight.css`, two now, not one), `ActionButton.module.css` is
  `StandardButton.module.css`, and strands' `HintBar` is not touched at all —
  it reads the `--button-caution-*` family tokens, not the slots. It also
  missed two files that DO read `--button-slot-*`:
  `feedback/GenericFeedbackPill.module.css` and
  `definitions/WordEditDialog.module.css`. Re-derived from the tree and
  rewritten.

### WORKED · F-buttons-5 · `renamed-props-in-prose` · Docstrings name props and classes that were renamed under them

- `SubmitButton`: "`iconOnly` for the no-text form" — the prop is
  `label={null}`. `docs/ui.md:209` says "most games pass `iconOnly`".
- `DeleteButton`: "bumped to 22 (vs the default 18)" and "`.icon-only`'s
  fixed box" — it is `iconScale = 1.2` and `.iconOnly`, and the parameter
  comment below the docstring already says the current thing, so the
  docstring is a stale second copy.
- `ZoomFitButton`: "the shared `.icon-only` box", "Default aria-label", and
  "pass `label={false ? null : undefined}` for a labeled form" — an expression
  that always evaluates to `null`. The sentence wanted "pass `label` to draw
  one".
- `HelpButton`: "`label` becomes the aria-label + tooltip" — `name` does.
- `RevealButton`: "pass `label` … pass `revealedLabel` with it" — the props
  are `name` and `revealedName`, and all nine callers pass `revealedName`. Its
  opening list of what it uncovers reads as complete and names six games;
  ten render it.
- `PauseButton`: "docs/ui.md → the button taxonomy" — no heading by that
  name; the section is "What a `<button>` is: the fourteen kinds".

**Recommendation:** fix each sentence to the current name; delete
DeleteButton's docstring sentence in favor of the comment that is right.

**Resolution (2026-09-06, Joel: "Stuff like 'what the iconScale is for this
button' shouldn't be in the docstring anyway; that's inside-the-component
comment material. The docstring for a button should be simple: 'when should i
use this, what do i pass to it'")** — a standard, not a set of corrections, and
it settles most of the finding by deletion. **A purpose button's docstring
answers two questions: when do I reach for this, and what do I pass.** Glyph
tuning, box mechanics and class names are a `//` comment at the line they
explain, or nothing.

Under it the six read shorter and lead with the job: SUBMIT is "send my move",
DELETE is "backspace", ZOOMFIT is "frame the whole board", HELP is "open the
rules". `DeleteButton`'s wrong "bumped to 22" needed no correction — the
parameter comment below it was already right, so the docstring sentence just
went. `ZoomFitButton`'s `label={false ? null : undefined}` (an expression that
always evaluates to `null`, documenting the state it is already in) went the
same way; what a caller can actually do — pass `label` — is what replaced it.
`RevealButton` keeps its two-state design argument, which IS "when do I use
this", and loses the six-game list: `useSolutionReveal` holds the real one, and
ten games render the button.

**The ghost prop `iconOnly` was in six docs as well as the docstrings.**
`docs/ui.md:209`, `docs/mobile.md` twice, `docs/games/wordiply.md`,
`docs/games/waffle.md`, `docs/games/wordle.md`, and one game stylesheet comment
(`connections/PlayArea.module.css`). It has never been a prop; the spellings
are `label={null}` on a button and `backLabel={null}` through
`<TerminalActionRow>`. All fixed — the same defect in one place is the same
defect in seven.

**Two more lines this area had made wrong, both fixed here for that reason:**

- `docs/ui.md:317` documented `variant` and `iconOnly` on Back-to-club, one of
  which F-buttons-2 deleted this morning and the other of which never existed.
  It now describes `weight` and the draws-"Club"/called-"Back to club" split.
- `docs/ui.md:209` and `:1342` gave `common/components/game/terminal/`, a
  pre-reorg path; the folder is `common/terminal/`. Both are OUTSIDE
  F-buttons-13's 1806–2225 range, so nothing else was going to reach them.

**Left for its own decision:** `core-css/base.css:265` calls the icon-only box
`.icon-only`, the pre-module global name. That is a paused area's file, and the
same call as F-buttons-14 — it rides with that one.

### CLOSED, NO CHANGE · F-buttons-6 · `base-docstring-drift` · `StandardButton.tsx`'s own docstrings disagree with the file

- `ButtonTone`: "`caution` = orange (Hint / Reveal)" — Reveal is
  `destructive`, and its docstring argues why.
- `StandardButtonProps`: "the six axes" — nine props follow (`name`,
  `label`, `icon`, `tooltip`, `weight`, `tone`, `small`, `fullWidth`,
  `iconScale`). The sentence predates `fullWidth` and `iconScale`.
- `ButtonIcon`: widened past Lucide's type "so a button can supply its own
  drawing … the pause bars are drawn inline". The pause bars are
  `PauseButton`'s, which is a `<PageHeaderButton>` and never passes through
  `StandardButton`; no caller of `StandardButton` supplies a non-Lucide glyph,
  and nothing outside the file imports `ButtonIcon`.
- Line 36: the bold closes on one line and the sentence's period opens the
  next (`**null means "don't"**` / `*.`), a formatting slip.
- `const Icon = icon ?? undefined` exists only so `{Icon && …}` sees
  `undefined`; `{icon && <icon …>}` would read the same. Trivial.

**Recommendation:** fix the tone example and the count (or drop the count —
"the axes below"), and give `ButtonIcon` a true reason or narrow it to
`LucideIcon` — a decision, since the type is exported and unread.

**Updated 2026-09-06 by the IconBack change (see F-buttons-1's resolution):
narrowing to `LucideIcon` is now the wrong branch.** `IconBack` is a component
of ours, so a button typed against lucide's forwardRef shape would reject the
registry's own glyph — the widening has a true reason after all, and the
docstring's example of it (the pause bars) is still the wrong one. The
registry now exports `AppIcon` for exactly this, and the menu reads it. So the
open decision is smaller than it was: whether `ButtonIcon` should simply BE
`AppIcon`, leaving one name for what a glyph is.

**Closed 2026-09-06 with no work of its own: F-buttons-20 rewrote the file and
every item went with it.** The tone example is gone (F-buttons-3 had already
taken the tone out of docstrings, and this docstring is the vocabulary's
definition, so it keeps the tones and drops the button names). "The six axes"
is now "the axes below", which cannot miscount. `ButtonIcon`'s widening states
its true reason — `IconBack` is the registry's own component, not an alias.
The `**null means "don't"**` passage that carried the formatting slip no longer
exists, because `null` no longer means anything. And `const Icon = icon ??
undefined` is now `const Icon = icon`: the alias survives because JSX needs a
capitalized identifier, which is a real reason where the `?? undefined` was
not. **The one item still open is the last paragraph above** — whether
`ButtonIcon` should just BE `AppIcon`.

### WORKED · F-buttons-7 · `module-header-contradicts-close` · The stylesheet's list of what is NOT a standard button includes one that is

`StandardButton.module.css` lines 12–16: "NOT standard buttons, and none of
them come through here: … the ✕ dismiss glyphs — deliberately borderless, and
they may not end up sharing the hover either." `CloseButton` IS a
`StandardButton` — `StandardButton.tsx:128` says so ("A ✕ dismiss IS this
button … packaged as `<CloseButton>`"), and `CloseButton.module.css` keeps the
hover wash on purpose ("that is the affordance"). The same header cites "§7's
table" — a plan section in a durable file, which the no-cite rule forbids —
and carries two pieces of archaeology ("`ActionButton.module.css`'s tone
classes came with them"; "the old `.button-small` declared `font-weight:
500`").

**Recommendation:** take the dismiss off the NOT list (it belongs on the
component docstring's list, which is right); replace the §7 citation with the
rule itself (a pattern with structure lives in a component + its module) or a
pointer to `docs/code-conventions.md` → Patterns; cut the archaeology.

**Resolution (2026-09-06, Joel: "got ahead and fix the prose for this")** —
prose only; no selector or declaration moved, and the rendered app is
byte-identical.

The dismiss came off the NOT list, and the list gained one short line saying
where it actually lives (`<CloseButton>`, which composes these classes) rather
than a second copy of the component's own sentence — the F-buttons-3 lesson
applied to itself. The §7 citation became the rule it was pointing at, since a
citation is the part that rots and the rule is one sentence.

Both pieces of archaeology were protecting something, so both were restated
forward rather than deleted: the `font-weight` note now says why the weight is
declared on the base (one treatment at two scales, not two treatments) instead
of what `.button-small` used to declare, and the hover note says the wash is
the button's own family "rather than one shared gray" instead of what it used
to be. Neither needed F-buttons-18 to settle anything.

The fourth item on the finding — `ActionButton.module.css`'s tone classes
"came with them" — was already gone, deleted by F-buttons-4.

### WORKED · F-buttons-8 · `end-turn-prose` · `EndTurnButton` describes a mechanism the module contradicts

"Primary is the filled-accent look, so it ignores semantic tone — the accent
fill stands in for the no-valence 'info' read." Both treatments take all
five tones; that is the tones section's whole point, and `ButtonWeight`'s
docstring says "both take any tone". And "Distinct from `EndGameButton` (the
flag, red …)" — the flag is Concede's; End took the crossed-out stop sign, as
`EndGameButton`'s own docstring says.

**Recommendation:** say it is `primary` in the default `normal` tone because
it is the row's main move, and name End's glyph correctly or not at all.

**Resolution (2026-09-06, Joel: "do it")** — one docstring, no code. The
tone-ignoring parenthetical is gone: it is `primary` because ending the turn IS
the move on offer, and nothing about weight touches tone. It also smuggled in
`info`, a tone that has never existed — F-buttons-3's sweep missed it because
it read as a claim about weight rather than about tone.

End's glyph is not named at all now, which is better than naming it right: the
glyph was never what distinguished these two. The contrast the docstring keeps
is **the trap it exists for** — `EndGameButton` shares the WORD and not the
act. And the sibling that shares the ACT and not the word, `PassButton`, is
named alongside it: same octagon, secondary weight, for games where passing is
the fallback. Both confusions now have a sentence, from the side a reader
arrives on.

### CLOSED, NO CHANGE · F-buttons-9 · `cancel-type-button` · `CancelButton` tells callers to pass what the base already sets

"Inside a `<form>`, pass `type="button"`: it is not the submit."
`StandardButton` emits `type="button"` unless a caller overrides it, and no
`CancelButton` caller passes `type` at all. The instruction is a no-op; the
true note is the inverse (the commit passes `type="submit"`), and the base's
comment already says that.

**Recommendation:** delete the sentence.

**Closed 2026-09-06 with no work of its own:** F-buttons-20 deleted it, and
better than deletion — the sentence existed because a form's commit had no
component of its own, so Cancel's docstring was the only place to say anything
about the pair. `<FormSubmitButton>` now owns `type="submit"`, so neither
button asks a caller for it and Cancel's docstring points at its partner
instead.

### WORKED · F-buttons-10 · `submit-with-score-prose` · Both `SubmitWithScore` files credit a class that paints nothing

`SubmitWithScore.module.css`: "The `.button` class provides the primary accent
fill / padding / radius". In that module `.button` is layout only (flex,
gap, a fixed width); the chrome comes from `sb.standardButton sb.primary
sb.normal` in the component. The component's docstring says "the filled
`.button`" and "the `ActionButton` family" (F-buttons-4). The deferred item in
`docs/games/scrabble.md` is real and stays scrabble's.

**Recommendation:** say what each class does; keep the deferral where it is.

**Resolution (2026-09-06, Joel: "do it")** — two comments, no code. The module
header now leads with what is NOT here: none of the chrome, which comes from
`StandardButton.module.css` via the classes the component composes. Saying it
that way round is the point — the file's whole oddity is the reach next door,
and the old sentence made it sound ordinary by crediting the local class with
the paint. The docstring's "the filled `.button`" becomes "it still WEARS a
standard button, by composing that module's classes and supplying only its own
row".

The deferral in `docs/games/scrabble.md` (a shared prop, or scrabble keeps a
shape of its own) stays scrabble's, untouched — the component's `className`
comment already points at it, correctly.

### WORKED · F-buttons-11 · `shuffle-stylesheet-claims` · `ShuffleButton.module.css` describes a button it is not

- "fill most of the 44px pill" — `.shuffle` is 35px.
- `font-size: 32px` with "the .glyph span inherits this" — the glyph is
  `<IconShuffle size={24}>`, sized by attribute; the font-size sets the span's
  line box and nothing visible.
- A commented-out `background:` line under `:hover`, and a `background 120ms`
  transition with no background change to animate.
- "Lifted from spellingbee's original .iconAction button" — archaeology.
- The focus comment counts "nine call sites"; seven files render it, one
  each. The component docstring names three games.
- OPEN question, not a claim: it lifts `translateY(-1px)` on hover with no
  shadow. `docs/ui.md` gives a general button color only and a float over a
  board its shadow; this has neither a shadow to lift nor a color change, so
  the lift is a twitch by the file's own standard.
- The todo's focus item is Joel's ruling of 2026-08-21 and stands: the fix is
  removing the tab stop, at the seven call sites' passes, not restyling the
  ring here.

**Recommendation:** correct the numbers and the font-size claim (or delete
the declaration if it is dead — verify in a browser first), delete the dead
line and the dead transition half, cut the archaeology. The hover lift is a
decision to present on its own.

**Resolution (2026-09-06, Joel: "whatever we do now for hover is fine.
otherwise, take your recs.")** — the hover lift stays exactly as it is; nothing
about it moved. Deleted: the commented-out `background:` under `:hover`, and
the `background 120ms` half of the transition, which had nothing left to
animate once that line was the only background change. Cut: the "lifted from
spellingbee's original `.iconAction`" archaeology.

**The counts came OUT rather than being corrected** — Joel, mid-turn, on the
"nine call sites" I had just changed to "seven": *"don't put stuff in comments
unless it's really needed. who cares how many sites use it? this just become
stale."* So the focus note names no number, the header says "every game where a
player can reorder tiles of their own" instead of listing three games, and the
same sweep went back over the census-style sentences this area itself wrote
earlier today: six docstrings said "Every call site passes `show=…`" where
"Pass `show=…`" is both shorter and un-rottable, `TerminalActionRow` said
"every game's terminal row passes `icon` today", and `ButtonShow`'s docstring
explained the world before the prop existed — archaeology as well as a count.

**The `font-size: 32px` was NOT deleted, and its comment now says what is
true:** the glyph's size comes from the component (`<IconShuffle size={24}>`),
and this sets the line box its `inline-block` span sits on. Whether that still
does anything inside a 35px flex-centered pill cannot be settled by reading, so
it went to `buttons/todo.md` for a browser.

### WORKED · F-buttons-12 · `doc-lede-overclaims` · `doc.md` says every button here is built from `StandardButton`

"Every purpose button in the app, and the `StandardButton` they are built
from." Three are not: `ShuffleButton` (its own `<button>` and module),
`PauseButton` (a `<PageHeaderButton>`), `SubmitWithScore` (a raw `<button>`
borrowing the module's classes). The Design is owed regardless.

**Recommendation:** rewrite the lede when the Design is written; the Design
should say what the folder holds — a look, not logic — and name the three
that stand apart and why.

**Resolution (2026-09-06, Joel: "i'll take your rec. fix it.")** — the Design
is written and `common/buttons` is off `DESIGNS_OWED`. Patching two sentences
was never worth doing separately: the lede had gone stale twice over (the three
exceptions, and "a default name, a tone" naming axes this area removed today),
and it was going to be replaced.

**The ruling F-buttons-13 was waiting on is now made, by the Design taking the
job:** this folder's `doc.md` owns how a button is BUILT — the one general
component, label vs `show` vs tooltip, weight × tone, defaults as default
parameters — and `docs/ui.md` keeps the taxonomy around it: what kinds of
control the app has, which glyph means what, when a button is offered at all.
The lede says so in its first sentence and links there, so F-buttons-13 rewrites
those two sections against a boundary rather than choosing one.

Written as narrative, not a tour of the files: the Design argues from "a button
here carries no logic" to why the folder is organized by control rather than by
caller, and the `## Details` bullets hold the specifics (default parameters,
`...rest` last, the focus suppression, the commit/Cancel pair, the missing-hover
disabled tell). The three that stand apart are named with the reason each does,
and `SubmitWithScore` is called the interesting one — the exception that shows
where the boundary is.

**Guard verified by planting**, per the rule that a `doc.md` cannot take a
rationale while its folder is on the list: with the row still present and the
Design written, `folderDocs.test.ts` fails; removing the row turns it green.

**One more line this area had made false**, fixed here for the same reason as
the others: `common/icons/doc.md` said the one thing another file may take from
lucide is the `LucideIcon` type. Since `IconBack` became a component of ours and
the registry grew `AppIcon`, that is exactly the type a surface must NOT reach
for. The icons folder is closed and blessed; this is a correction to a sentence
this area broke, not a re-opening.

### WORKED · F-buttons-13 · `ui-md-button-sections` · `docs/ui.md`'s two button sections describe the world before `StandardButton`

"What a `<button>` is: the fourteen kinds" (1806–1980) and "Button
iconography" (1982–2225) still say: `.button` / `.button-small` /
`.icon-button` are global classes in `theme.css`; a call site writes
`cls('button', 'secondary', 'button-small')`; a semantic button composes from
`ActionButton`'s two axes; buttons live in `common/components/buttons/` and
the host in `common/components/tooltips/`; "Hint / Reveal = `caution`";
`.button-small` is `0.8rem` in `0.25rem 0.6rem` (the module's `.small` is
`0.85em` in `0.25rem 0.5rem`); most games pass `iconOnly` (line 209). The
todo's last item names the class story; the drift is the whole of both
sections. What is still right and worth keeping: the fourteen kinds and their
four feedback families, the "color only" rule, the menu-is-the-legend
argument, the four exempt glyphs, long-press, the End/Concede split, the
disabled-tooltip rule.

**Recommendation:** rewrite both sections against the module and the
component — one place says how a button is built (this folder's `doc.md`
Design, most likely) and `docs/ui.md` keeps the taxonomy and the rules and
points at it. A decision on which file owns the class story comes first.

**Resolution (2026-09-06, Joel: "do it")** — `docs/ui.md` only; no code. The
decision the recommendation asked for had already been made by F-buttons-12's
Design, so the rewrite was mostly DELETION plus a link: everything explaining
how a button is constructed left, and everything about which control exists and
which glyph means what stayed.

What went, because it described a world two steps back — the class table and
the compose-by-hand story (`.button` / `.primary` / `.secondary` as globals),
`cls('button', 'secondary', 'button-small')`, the global `.icon-button` shape,
per-call-site `size={15-16}`, the five `ActionButton` mentions, "Hint / Reveal =
`caution`" (Reveal is `destructive`, and argues why), `.button-small`'s
measurements, and the "it used to be the other way round" paragraph about the
old filled default. The roster of named buttons went too: it is a list that
rots, and the folder's own doc holds it.

What stayed, which is most of it: the fourteen kinds and their four feedback
families, "a kind is what a control IS", the pieces-use-depth rule, the
general-buttons-use-color-only rule, the menu-is-the-legend argument, the four
exempt glyphs, long-press and the two platform suppressions, the End/Concede
split, and the disabled-tooltip rule.

Also swept, since nothing else was on the hook for them: **the count in the
opening line** ("102 of them"), and **five pre-reorg paths elsewhere in the
file** — `common/components/game/CelebrationBlockingModal`,
`common/components/text/Dot`, `common/components/game/lists/ActorTag`,
`common/components/game/PlayArea.module.css`, and `[data-tooltip]`'s callout
suppression, which is in `core-css/utilities.css` rather than a `theme.css`.
Four of those sit outside both button sections.

**Left for F-buttons-15:** the `buttons.html` paragraph. Its file name was
wrong (`theme.css` → CHROME, which does not exist) and is now
`themes/daylight.css` → BUTTON, but whether the page is regenerated or deleted
is that finding's call, and the rest of the paragraph describes it as it is.

### WORKED · F-buttons-14 · `theme-tone-map-is-wrong` · `daylight.css`'s BUTTON header assigns buttons to the wrong families

`themes/daylight.css:97–101` (corecss's file, paused): "quiet — Cancel, Back
to club, Pause" — `BackToClubButton` is `normal` in both weights and its
docstring argues exactly that; `PauseButton` is a `<PageHeaderButton>` with no
tone. "destructive — Delete" — `DeleteButton` (backspace) is `normal`;
`TrashButton` is the destructive one. And "success — RESERVED — no consumer
today", twice: `PauseButton.module.css` reads
`--button-success-primary-color` for the resume face.

**Recommendation:** a conformance edit to five lines of a paused area's file
— this folder owns the tone vocabulary, so it ships with this area — or a
line in `core-css/todo.md` if Joel would rather the paused area not move.

**Resolution (2026-09-06, Joel: "it feels like most of these 'it's used here'
comments are low value. my editor can easily show me where something is used.
unless its important, we don't need examples.")** — which reframes the finding:
three of the four wrong facts were EXAMPLES, and examples of that kind are
deleted rather than corrected. The family list now says what each family MEANS
and names no buttons, so Cancel/Back-to-club/Pause and the Delete ambiguity all
go with the roster. Comments only — no declaration, token or color moved, in
either the theme or `base.css`.

**The fourth was not an example and stayed, rewritten as the warning it should
have been.** `success` was documented "RESERVED — no consumer today", which
invites deletion, while `PauseButton.module.css` reads
`--button-success-primary-color` for its resume face. It now says no button
passes the tone, the family is live because a stylesheet reads its tokens
directly, and not to retire it on the strength of an empty grep for the tone
name. That is the difference between "safe to delete" and "not", which is worth
a comment where a usage list is not.

The paused-area question resolved itself: what shipped is a comment edit that
leaves nothing for `corecss` to re-derive. `core-css/base.css`'s `.icon-only` —
the pre-module class name that had been riding on this decision — went at the
same time, by naming the thing rather than a class: "the fixed square footprint
of a button drawn as a glyph alone".

**The same ruling swept this folder**, and Joel scoped it: *"no, we'll worry
about docs/ui.md later"*, so the doc's own example lists (the fourteen kinds,
the exempt glyphs) are untouched. Deleted here: the "X is the first user"
sentences in `EndTurnButton`, `NewGameButton`, `SharePreviewButton` and
`WordCheckButton`, and the game roster this area had itself put into
`ShuffleButton` earlier today. Kept, on Joel's "unless it's important": a single
grounding example where the sentence is otherwise abstract — `ZoomFitButton`'s
"a board a player can pan or grow past the window", `ClearButton`'s pending
selection — and `PeelButton`'s "only bananagrams peels", which is load-bearing
because it explains why a one-game button lives in a shared folder.

### CLOSED, NO CHANGE · F-buttons-15 · `buttons-html-behind` · The rendered grid no longer shows what ships

`docs/buttons.html` says it is "THE RENDERED REFERENCE for
`src/common/theme.css` → CHROME" — no such file; the block is
`themes/daylight.css` → BUTTON. It renders four cells per family where the
theme has eight (no press step), says "only the four -primary values are
CHOSEN" for five families, glosses caution as "outcome-warning's fill" (the
theme says the opposite), and its "today" swatches carry hexes that do not
ship (`#ef6c00` caution, `#8e1b2e` destructive, `#b0b0b0` quiet).
`daylight.css` says "if it and this file disagree, this file wins", and
`CLAUDE.md` and `docs/ui.md:1835` both call the page "the twin of `theme.css`
→ CHROME". It was kept on the argument that a picture cannot drift silently
into prose; it drifted.

**Recommendation:** a decision — regenerate it against `daylight.css` (all
five families, all eight cells, the real derivation) or delete it and let the
stylesheet be the reference. If kept, `CLAUDE.md`'s row and `ui.md`'s
sentence get the right file name.

**Closed 2026-09-06 with no change (Joel: "ignore buttons.html. just close
this")** — the page is out of scope, the way `/palette` and `/font` are. Nothing
about it moved: not the page, not `CLAUDE.md`'s row, not `daylight.css`'s claim
that the page wins where they disagree. The one incidental change already
shipped: `docs/ui.md`'s paragraph names `themes/daylight.css` → BUTTON instead
of a `theme.css` → CHROME that does not exist, because that sentence was being
rewritten anyway.

The evidence is left recorded because it stays true and someone will notice it
again: the page shows four cells per family where the theme has eight, glosses
`caution` as the outcome orange the theme is at pains to separate from, and its
"today" swatches are three colors that no longer ship.

### CLOSED, NO CHANGE · F-buttons-16 · `test-prose` · The spec carries a finding ID, two counts, and a test that does not test its title

`StandardButton.test.tsx`: "the F9 case" is a finding number from a deleted
audit in a durable file; "146 call sites draw no text, and 457 test selectors
find buttons by name" are counts that were true one day; and "supply their
own name, and stay overridable on every axis" renders `<RestartButton />` and
checks the name only.

**Recommendation:** name the rule instead of the finding (a Cancel is a
standard button with no glyph); say "many" or nothing; either override an
axis in the test (`<RestartButton name="Start over" />` is found by the new
name) or retitle it.

**Closed 2026-09-06 with no work of its own:** F-buttons-20 rewrote the spec
around the new vocabulary and took all three items with it. "The F9 case" is
gone — the test is named for its rule, that a Cancel is a standard button whose
glyph is never drawn. The two counts are gone, replaced by the condition ("most
buttons in the app are icon-only, and the suite finds them by that name"). And
the test that did not test its title now does: it rerenders with a label of its
own and finds the button by the new words, which is what "stay overridable on
every axis" was claiming.

### WORKED · F-buttons-17 · `archaeology` · "How it used to work" in six docstrings

`BackToClubButton` ("rendered a raw `<button className="secondary">` until
2026-08-18, which is how it ended up quiet-gray"), `TrashButton` ("used to be
a neutral gray `×` that only turned red once you had already clicked"),
`EndGameButton` ("the flag it used to share with Concede"),
`ConcedeGameButton` ("(2026-08-03)"), `StandardButton.module.css` and
`ShuffleButton.module.css` (F-buttons-7, -11). CLAUDE.md: "how it used to
work" is not useful. Each is protecting a rule that can be stated forward —
Trash is red BEFORE the press; End and Concede differ by glyph because
bananagrams shows both.

**Recommendation:** keep the rule, cut the history, in each.

**Resolution (2026-09-06, Joel: "i'll take your rec.")** — three docstrings, no
code. The finding listed six sites; two had already gone with F-buttons-7 and
F-buttons-11, and `BackToClubButton`'s 2026-08-18 sentence went with the
F-buttons-20 rewrite, so three were left.

Each was protecting a rule, and each states forward without the history. End's
glyph and Concede's are described as what they ARE, with bananagrams showing
both at once as the standing reason rather than as the event that "forced them
apart"; the date on Concede went, since it dated a decision whose reason sits in
the same sentence. Trash keeps the rule that mattered — an irreversible act
should look irreversible while you can still change your mind — with the
too-late-to-help point made about *a control that turns red only once you have
clicked it* rather than about the club's old delete.

Also dropped, in the same docstring: **"every v3 game"**. The version vocabulary
is settled at v3-canonical with no v4, so the qualifier can only ever be
redundant; it is now "the same in every game".

And one this area wrote itself today: `FormSubmitButton` said its packaged props
"used to be retyped at each of them", which is the same fault a few hours old. It
now says what it packages.

### WORKED · F-buttons-18 · `small-buttons` · Ten controls make themselves small by hand (from `todo.md`)

The todo item, re-judged: still true and still a decision. Three write
`0.8rem` and differ only in padding; four more sizes exist that nothing names;
the ramp's middle step has no callers among them. Four of the ten are games'.
Also from the item: the `+` in "+ New club" is a typed character, not a glyph.

**Recommendation:** decide the rule here — is `.small` the one small size,
and does a text-only small button take it? — then each folder applies it at
its pass. Not this area's edit beyond the rule and `StandardButton`'s part.

**Resolution (2026-09-06, Joel: "otherwise, standardbuttons should have the same
treatment when .small. the other things you listed aren't buttons, are they?
links and filter drop down glpyhs and such? drop a note in crosswords todo to
examine these when we get there. and one for scrabble todo when we get there.")**
— and the second sentence is the finding's real answer.

**They are all `<button>` elements, and almost none of them is a button.** By
the taxonomy's own rule — a kind is what a control IS, not what element it is
built from — `DefinitionView.editLink` is a textlink, `FilterSelect`'s closed
select is a trigger, scrabble's suggest row is a list row that IS the control,
and crosswords' control bar is a documented exemption whose ON state is a game
color. So the shared button's small treatment never reached them and was never
going to; what they actually share is only that each picked a size off the type
ramp. The finding was framed as "ten controls should adopt `.small`" and the
honest version is "one rule for buttons, and a separate question about the ramp
for everything else".

**The arithmetic killed the rest of it.** Nothing sets a root font-size, so rem
is the browser's 16px: `0.8rem` is 12.8px, `0.85rem` 13.6px, `0.9rem` 14.4px.
Joel: *"`.85rem` and `.9rem` is the same thing, effectively. what's that going
to be, ~1px diff?"* — 0.8px each way, 1.6px across the whole spread. Three
values separated by less than a pixel were never three decisions.

What shipped: the rule stated in the folder's Design (`small` is one prop that
brings type, weight, padding and the smaller glyph square together, because
those move together; a link, trigger or list row is not covered and takes the
ramp's small step), and a note in `crosswords/todo.md` and `scrabble/todo.md`
for the two games holding a `0.9rem`, each carrying the sub-pixel fact so
neither has to re-derive it. `buttons/todo.md`'s small-buttons item is settled
and gone; the `+` in "+ New club" survives it as its own line.

Also cleared from `buttons/todo.md`: the item asking for the `docs/ui.md`
class story to be rewritten, which F-buttons-13 did.

### CLOSED, NO CHANGE · F-buttons-19 · `disabled-utility` · One look for a disabled control (from `todo.md`)

The todo item, re-judged: nine `cursor: not-allowed` sites today (the item
says eleven), with the opacity still spread across values; `ShuffleButton`'s
`0.45` is this folder's one. `StandardButton` has no disabled rule at all —
`docs/ui.md` says a disabled general button's tell is the missing hover, and
the module delivers that by `:not(:disabled)` on every hover rule, so the
base is consistent and the others are not.

**Recommendation:** decide whether disabled is a utility (`--opacity-2`,
`not-allowed`) every control composes or a rule the base states; the
non-button sites are their folders'.

**Closed 2026-09-06 with no change (Joel: "these aren't buttons in the normal
sense; just close this")** — the same ruling as F-buttons-18, and the sites bear
it out: a select, a timer input, a menu row, a keycap, crosswords' game-surface
control bar, and the board's round shuffle pill. None is a general button, so
none is this area's to restyle.

Two things the re-read turned up that are worth leaving recorded, because the
finding had them backwards and the next reader will hit the same wall:

- **The utility already exists**, and deliberately on the ELEMENT rather than on
  the button class: `base.css` gives every `button:disabled` the fade and
  `cursor: not-allowed`, with a comment saying why — a disabled game piece,
  keycap or list row should fade and refuse the pointer exactly as a button
  does. So "StandardButton states no disabled rule" is true and irrelevant; the
  base is consistent BECAUSE the element rule covers it, and five of the
  hand-written `cursor: not-allowed` declarations are re-stating what they
  already inherit.
- **Every site that overrides the opacity makes it FAINTER than the global** —
  0.45, 0.5, 0.55 and 0.6 against `--chrome-disabled-opacity`'s 0.75. Seven
  independent choices in the same direction read as the global being too subtle
  rather than as seven surfaces each needing something different. And
  `--opacity-1` (0.7) sits 0.05 from that token, which is the same
  indistinguishable-pair shape as the 0.85/0.9 font sizes.

That is a `core-css` question about one number, not a buttons question, and it
is left for that area rather than filed as a defect here.

### WORKED · F-buttons-20 · `show-not-a-guessed-default` · A call site could not say what its button draws

Raised by Joel 2026-09-06, not by the read: *"it looks like our buttons don't
align on whether they default to an icon or not, or a label or not. this makes
it hard to read at a call site — is the label missing because there's a default?
or, do we need to pass an empty string for no label? I'd rather the call sites
be regular, even if that means more verbose call sites."*

**The measurement that settled it.** "No `label` prop" meant three different
things depending on the component: `<RestartButton />` drew its word and glyph
(21 buttons), `<HelpButton />` drew nothing but the glyph (4), and
`<BackToClubButton />` drew "Club" — neither its name nor nothing (1). Reading
a call site you could not tell which without opening the file. And the dominant
form was nobody's default: **128 call sites passed `label={null}`** to get
icon-only, against ~20 that drew text.

**The design, Joel's** (*"this could a prop like `show: ICON | LABEL | BOTH`
passed in"*, then *"name is a terrible name, then. shall we call it 'tooltip'?
it probably makes sense for 'label' be the one that people pass, and tooltip
defaults to the label, if no tooltip is given"*):

```
label: ReactNode                    REQUIRED. the words — what people pass
show: 'icon' | 'label' | 'both'     REQUIRED, at every call site. what is drawn
tooltip?: string | null             the bubble AND the name; defaults to label
icon?: ButtonIcon                   defaults to the purpose button's
```

`name` is gone. The root defect it fixes is that `label` used to do two jobs —
carry the words, and secretly change the form by being `null`. Separating them
retires the whole class of bug F-buttons-1 was: a `??` cannot swallow a
meaning that `null` no longer carries.

Four properties worth keeping in mind:

- **The rename is accessible-name-preserving.** The name is `tooltip ?? label`,
  so Back-to-club stays "Back to club" while drawing "Club", and the ~500
  `getByRole('button', { name })` selectors did not move. Two exceptions, both
  now more descriptive: stackdown's Hint and Spoiler pass a `tooltip` and so are
  named by it ("Hint for next word"), which cost two selectors in that game's
  test.
- **`aria-label` is emitted only when the name is not already the visible
  text** — every icon-only button, and the handful a tooltip renames. A first
  cut set it from the tooltip unconditionally and renamed stackdown's Hint out
  from under its test; the test caught it.
- **`StandardButtonProps` no longer shadows the DOM `name` attribute**, which it
  used to do deliberately and document at length.
- **Rejected, then done anyway on Joel's call:** a generic square
  (`IconGeneric`) is now the fallback glyph, so every button has one and
  `show="both"` always draws two things. The concern was a meaningless glyph in
  twelve dialog footers; Joel's answer — *"we'll just pass show='label' for the
  ones that we currently have be label-only"* — means it never actually renders.
  It exists to keep the component shape uniform.

**`FormSubmitButton` is new** (Joel: *"i think we should make a button for that
--- 'SaveButton'? or FormSubmitButton?"*). Nine sites hand-wrote `type="submit"`
+ `weight="primary"` + the words; the first two now live in the component.
`SaveButton` was the wrong name — the sites are Save, Start, Create, Send magic
link, Accept, Find, Define — so `label` is required and defaults to nothing.
This also deletes F-buttons-9's subject: `CancelButton` no longer tells callers
to pass a `type` the base already sets, because its commit partner exists.

**Two prop renames rode along**, both of which had been open questions in this
area: `ShuffleButton.label` was never drawn text — it was the aria-label — and
is now `tooltip`, which is what that word means everywhere else in the folder.
`RevealButton.revealedName` is `revealedLabel`, which is what its docstring
wrongly claimed for months before F-buttons-5 corrected the doc.

`TerminalActionRow.backLabel` became `backShow`, required, passed straight
through — a row that doesn't say what it draws is a row you have to open a file
to read, one level up.

**Scale:** 94 files. The mechanical parts were scripted with per-file
assertions; the ~20 sites passing real text, the six with a dynamic form
(`show={isPhone ? 'icon' : 'both'}`, which replaces the unreadable
`label={isPhone ? null : undefined}`), and every docstring were done by hand.

### WORKED · F-buttons-21 · `segmented-is-a-pattern-without-a-component` · A shared class with three hand-composing call sites

Raised by Joel 2026-09-08, from a question about where `segmented.css` was
used: *"do you think the segmented.css stuff would be better as a proper React
component?"* then *"we should do it, and we should put it here, in buttons."*

**It was the case the buttons module's own header describes.** That header
states the boundary rule — a pattern with structure or behavior belongs in a
React component plus its module, and a shared stylesheet with many consumers
and no component is a component waiting to be written. A segmented choice has
both: a frame that owns the border and rounding while the segments own only
their fill, and "exactly one chosen" keyed off `aria-pressed`.

Two specific costs of it being a class:

- **The `aria-pressed` contract lived only in a CSS comment.** The chosen
  segment is styled by `[aria-pressed='true']`, so a call site that forgot the
  attribute got a control where nothing looks chosen — no type error, no guard,
  no test.
- **It was hand-composed**, which is the fault `cssTokens.test.ts` exists to
  prevent for buttons. That guard's regex looks for `button|primary|secondary`,
  so `cls('segmented', …)` walked past it at all three sites.

**What it deliberately is NOT** is the obvious `value` / `onChange` / `options`
component. The three call sites want different things from a press — the club's
mode filter sets a filter, its mobile tabs switch a view, crosswords' picker
OPENS A MODAL and reflects state set elsewhere — and one that owned the value
would have made two of them lie. So `<Segmented>` owns the frame, the class and
the group semantics (`role="group"` plus a required label, since a row of
segments never says what the choice is about), and the segments stay the
caller's own buttons. ModeFilter's `onMouseDown` focus-suppression, which keeps
ClubPage's list cursor alive, survives untouched for the same reason.

The global stylesheet is gone with it — deleted from `core-css/patterns/`, its
import dropped from `main.tsx`, and `vocabularies.test.ts`'s pending-literal row
moved to the new path. `docs/ui.md`'s section now points at the component, and
five comments that named the class or the old path were corrected.

**Left alone deliberately:** the segments' `0.8rem`, which stays a pending
literal. F-buttons-18 established that `0.8` / `0.85` / `0.9` are the same size
to within a pixel, but collapsing it here would be a visible change nobody asked
for in a move that is otherwise render-identical.

## Notes

- **Seen, not audited — `TooltipHost`'s list of direct carriers.** Fixing
  F-buttons-4's noun there also took `BackToClubButton` off the list, which was
  wrong on it: that button's bubble comes from `StandardButton` like any
  other's. The list still reads as exhaustive and is not — crosswords'
  `Controls` and letterboxed's `ChainStrip` write `data-tooltip` directly too.
  That is the `tooltips` area's sentence to finish.
- **Seen, not audited — a guard with a stale allowlist.**
  `src/guards/cssTokens.test.ts:353` allows `common/components/buttons/`, a
  pre-reorg path; the test still passes because `StandardButton.tsx` composes
  module classes (`styles[weight]`), which the regex never matches, so the
  allowlist has no reader. Guards are outside the audit; noted so the path is
  fixed the next time the guard is edited for a real reason.
- **`vocabularies.test.ts` holds eight pending literals in this folder**, six
  of them `ShuffleButton.module.css`'s (`999px`, `32px`, `1`, `0.45`, `120ms`,
  `1px`), plus `SubmitWithScore`'s `0.5rem` gap and `StandardButton`'s `0.4em`
  gap. F-buttons-11 touches the `32px`; the rest are the a/b/c rule's to
  decide when the module is converted.
- **Evidence read, off the roster:** `themes/daylight.css` → BUTTON (corecss,
  paused — F-buttons-14), `core-css/base.css:270` (`--iconButton-size:
  2.05rem`, which every claim about it matched), `docs/ui.md` 1806–2241
  (F-buttons-13), `docs/buttons.html` (F-buttons-15),
  `terminal/TerminalActionRow.tsx`, `page-header/PageHeaderButton.tsx`,
  `reveal/useSolutionReveal.test.ts`, the crosswords terminal strip, and the
  caller lists for every purpose button (in the roster's descriptions).
- **Claims that checked out and are worth not re-checking:** `RevealButton`'s
  six clear-win games are exactly the six `alreadyShown` callers; `.titlebar
  .close` exists in `FloatingPanel.module.css` at two classes as
  `CloseButton.module.css` says; `modalActions.module.css` is the one reader
  of `data-icon-only`; `useCommonGame` forces `paused` false at `ended_at`;
  `GamePageCtx.goToGame` exists; the setup dialog's Start label is the span
  the `label` docstring describes.

## Predicted test breaks

Written as the area changed things, and all of them landed:

- **`StandardButton.test.tsx`** — rewritten whole. Its three tests existed to
  keep `name` / `label` / `tooltip` apart, and the vocabulary changed under
  them.
- **`stackdown/PlayArea.test.tsx`** — two selectors. Its Hint passes a
  `tooltip`, so the button's accessible name became the richer sentence.
- **`folderDocs.test.ts`** — by design: writing the Design failed the guard
  until `common/buttons` came off `DESIGNS_OWED`, which is how the guard was
  verified rather than trusted.

Nothing else moved. The ~500 `getByRole('button', { name })` selectors across
the unit and e2e suites survived the rename untouched, because `tooltip ?? label`
preserves every accessible name that `name` used to carry.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
