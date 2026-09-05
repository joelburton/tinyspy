# Area: icons

The folders it reads: `icons`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN** (2026-09-04). The roster is agreed and stamped, `doc.md`'s
lede + Design are written and committed (`985b4e51`), and the audit is
recorded below: eight findings, all OPEN, nothing in the code moved yet.

## The roster

`src/common/icons/`, its own files only:

| file | what it is | stamp |
|---|---|---|
| `icons.ts` | the semantic glyph registry — one re-export block from `lucide-react`, a comment per glyph | `cs-met-icons` |
| `doc.md` | lede + Design, written at the opening | — |
| `todo.md` | empty in all four sections at the opening | — |

No CSS, no test, no hook, no component. Dependents are not on the roster: 53
files import from the registry, and `docs/ui.md` → "Button iconography" is the
doc of the subject.

**What the audit checked:** every caller of every export (a grep per name,
outside the registry); every claim a glyph's comment makes about who uses it,
what sits beside it and what tone it wears, looked up in the tree; the
docstring-marker pass (one `/**`, on the file); the naming rules against the
Design just written; whether anything else imports `lucide-react`; and the two
docs that describe the folder against the file.

**What checked out:** the three eyes are wired as described (`SpoilerButton`
is the bare eye, `RevealButton` swaps `IconReveal` for `IconHideSolution`);
the octagon pair differs by tone as claimed (`PassButton` is `caution`,
`EndGameButton` is `destructive`) and both are on screen in scrabble
(`Controls.tsx` and `InfoCol.tsx`); bananagrams renders End and Concede in
one row (`PlayArea.tsx:684–685`); `PauseButton` draws its own `<svg>`;
`IconBack` and the menu's `⇧<` rhyme (`gameMenu.ts:111`); `StrikeMarks`,
strands' log marks, letterboxed's `ChainStrip` ×, `CloseButton` and
`InfoSwitchButton` each use the export their comment names; nothing but the
registry imports a glyph from `lucide-react`, and the one other import is the
`LucideIcon` type in `menuModel.ts`; no eslint rule or guard enforces that.

## Findings

### F-icons-1 · `undo-unused` · `IconUndo` has no caller; letterboxed's undo is the chain's ×

The comment says it is letterboxed's "Undo" (pop the last word off the
chain). That action exists (`PlayArea.tsx` `removeLast` → `undo_word`), but
the control that fires it is `ChainStrip`'s × on the last word, which draws
`IconRemove`. `IconUndo` is imported by nothing. Either it goes, or something
should be wearing it — the comment argues the curved arrow reads as "one step"
where `IconRestart` reads as "all of them", which is a reason for a glyph, not
a reason to keep an export nobody draws.

### F-icons-2 · `archaeology-in-comments` · Five comments tell how it used to work

CLAUDE.md: a comment that teaches is wanted; "how it used to work" is not.
These carry history alongside (or instead of) the live reason:

| lines | the archaeology | the live reason, if any |
|---|---|---|
| 52–54 (`IconEnd`) | "It was the flag until 2026-08-03" | Concede wears the flag; two red flags in a row read as one act |
| 77–79 (`IconTrash`) | "a game row's delete used to wear one … (Joel, 2026-08-25)" | an ✕ means dismiss, so a destroy must not wear it |
| 112–117 (`IconMenuChevron`) | "the alternative was the one glyph in the app hand-inlined as raw `<svg>`" | it is an affordance mark, kept in the registry so it cannot drift |
| 124–129 (`IconScratchpad`) | "the closer match to the hand-rolled glyph the bubble wore for years" | the pen says "you write here" |
| 130–137 (`IconChat`) | "the inlined path was Feather's `message-circle` … from before this app used Lucide" | none — the whole comment is history |
| 191–195 (`IconClose`) | "It replaces a TEXT × … InfoSheet hand-wrote ✕ and nobody could see the difference" | a glyph not in the registry drifts; the SVG centers, the text × does not |

Proposed: keep the right-hand column, drop the middle one. `IconChat` is then
"Club chat" plus the one sentence about the menu legend needing the same
bubble the header shows.

### F-icons-3 · `stale-call-site-claims` · Seven comments name a caller the tree no longer agrees with

| export | the comment says | the tree says |
|---|---|---|
| `IconSpoiler` | "stackdown's next word, psychicnum's answer word" | letterboxed's `InfoCol` renders `SpoilerButton` too |
| `IconHelp` | "the '?' the setup dialog's HelpButton shows" | also `ClubPage.tsx:915` and the game menu's Help row |
| `IconChat` | "ChatButton and Chat now render this" | `Chat.tsx` renders no glyph; `ChatButton` and the game menu do |
| `IconPrint` | "The one glyph here with NO button" | the two strike marks, the four word-outcome marks and the menu chevron have no button either — it is the one ACTION with no button |
| `IconRestart` / `IconNewGame` | "waffle's replay-board" / "waffle's New game" | every game's menu and `RestartButton` / `NewGameButton` |
| `IconEndTurn` | "codenamesduet's Pass is the first user" | scrabble's `Controls.tsx` too; "first" is history |
| `IconExchange` | "scrabble's Swap" | also bananagrams' dump slot (`HandCard.tsx:88`) and its "Dumped" readout (`PlayArea.tsx:249`) as a bare glyph in text |

The file's convention is to name an example user, which is fine while the
example is true. Proposed: name the SHARED button where one exists
(`SpoilerButton`, `HelpButton`, `RestartButton`) and a game only when the
glyph is that game's alone (`IconPeel`, `IconZoomFit`).

### F-icons-4 · `panel-in-a-name` · `IconInfoPanelOpen` / `IconInfoPanelClose` name a panel that is a page

The comment says "A right-hand panel opening / closing IS the gesture — the
info column slides in from the right". `InfoSheet.tsx`'s own docstring says
the 24rem drawer "went when it became a page (docs/mobile.md)", and
`InfoSwitchButton` is what renders the pair. So the name records a shape the
surface no longer has, and "panel" alone is the word the sprint banned as a
kind (it is not a floating panel). Proposed: `IconInfoPageOpen` /
`IconInfoPageClose`, or names after the two faces (`IconShowInfo` /
`IconShowBoard`), and a comment that describes the current gesture. The Lucide
glyphs (`PanelRightOpen`/`Close`) can stay — the picture still reads.

### F-icons-5 · `names-that-say-the-picture` · Three names break the Design's first rule

The Design (written this opening) says a name says what the glyph MEANS,
never what it looks like. Three do not:

- `IconTrash` — names a can. The meaning is destroy (its own comment: "DESTROY
  a thing, as opposed to dismissing one"). `IconDestroy`? — though
  `TrashButton` is the shared button's name, so this is a pair to rename or
  a pair to leave.
- `IconMenuChevron` — names a chevron. The comment already knows it ("an
  AFFORDANCE MARK rather than an icon in the button sense"). `IconOpensMenu`?
- `IconEnd` — half a name. It ends the GAME, and sits beside `IconEndTurn`,
  whose name says what it ends; `EndGameButton` is the button.
  `IconEndGame` makes the octagon pair read as a pair.

Also noted, not proposed: `IconReveal` / `IconHideSolution` are two faces of
one button with asymmetric names.

### F-icons-6 · `no-order` · Exports sit in arrival order, with two comment styles and one section header

The block is the order glyphs were adopted: hint, AI, the eyes, word-check,
end, concede, submit, end-turn, clear, exchange, delete, trash, shuffle, peel,
share, back, menu chevron, print, scratchpad, chat, restart, undo, new game,
help, zoom-fit, strike marks, word marks, remove, close, info page. Related
glyphs are split (the octagons at 55 and 69; restart/undo/new-game at 141–150
far from shuffle at 81; the three ✕ aliases at 181–196 while `IconDelete` is
at 75). The first two exports carry trailing comments, the rest leading; the
word-outcome marks get a `──` section header and nothing else does.

Proposed: group by what the glyph is for, each group under the same kind of
header the marks already have — **game actions** (submit, end-turn, end,
concede, clear, exchange, delete, shuffle, restart, new-game, peel, share,
zoom-fit) · **help** (hint, AI, the three eyes, word-check) · **chrome**
(back, help, print, scratchpad, chat, close, menu chevron, info page) ·
**marks** (strikes, word outcomes, remove). Leading comments throughout. Joel's
call on the groups; the point is that a family sits together, which is what
the eyes' comment already asks for ("Keep them adjacent here").

### F-icons-7 · `one-importer-rule-unguarded` · Nothing enforces "nothing imports `lucide-react` but this file"

The Design states it and the tree satisfies it today (one glyph importer, one
type importer), but nothing fails when a component reaches for Lucide
directly. `eslint.config` already carries `no-restricted-imports` patterns for
other boundaries; a pattern for `lucide-react` outside `src/common/icons/`
would catch a glyph import at lint time, with `menuModel.ts`'s `import type
{ LucideIcon }` the one exception to allow (an eslint pattern cannot tell a
type import from a value one, so the exception is by path or the type moves
into the registry as a re-export — `export type { LucideIcon }` beside the
glyphs, which is arguably where it belongs). Guard the vocabulary, not just
name it.

### F-icons-8 · `docs-describe-an-older-file` · Two docs disagree with the registry

Outside the folder, but the docs OF this folder:

- `docs/ui.md` → "Button iconography": the registry's path is
  `common/components/icons.ts` (it is `common/icons/icons.ts` since the
  restructure); "Today's full set of direct importers is the registry itself;
  psychicnum + connections + the shared ShuffleButton / BackToClubButton /
  PauseButton consume it" is a snapshot from before 53 files did; and the map
  table has three rows the code contradicts — **Pass** `SkipForward` (the code
  is `Octagon`, and the comment says why), **Pause** `Pause` (the code says
  Lucide's is wrong and `PauseButton` hand-draws it), **Recall** `Undo2`
  (scrabble's Recall is `ClearButton`, the eraser). The prose after the table
  ("The menu is the legend", the four exempt glyphs) checks out.
- `docs/common-folders.md:222`: the folder row says "the inline SVG set",
  which the old lede also said. The folder holds no SVG.

Whether these are this area's edits is Joel's call — the utils close edited
no doc outside its folder. Recorded so they are not lost either way.

## Notes

- Checking `IconEnd`'s tone claim turned up that `PassButton`'s docstring
  names a `warning` tone the type does not have (the prop is `caution`).
  Filed in `src/common/buttons/todo.md` → Soon; not this area's.
- `src/common/buttons/todo.md` already notes the typed `+` in "+ New club"
  as "the last glyph-shaped affordance not in the icon registry" — a future
  export, owned by whichever area converts it.

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to the folder's `doc.md`
or `todo.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
