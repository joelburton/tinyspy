# Area: keyboard

The folders it reads: `keyboard`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED (2026-09-10).** Roster blessed `cs-blessed-keyboard` at
Joel's word. Twenty findings: sixteen resolved (most by the actions sprint
that came out of this area) and four surviving as `todo.md` items — the sort
is in "Close" at the bottom.

## The roster

Agreed 2026-09-09 — every source file of `src/common/keyboard/`; the folder's
own files, not its importers.

| file | what it is | stamp |
|---|---|---|
| `src/common/keyboard/useGlobalKeyHandler.ts` | the one window keydown listener with a stable ref-dispatch; declines while a text field or a floating panel has focus | `cs-blessed-keyboard` |
| `src/common/keyboard/useGlobalKeyHandler.test.ts` | its tests | `cs-blessed-keyboard` |
| `src/common/keyboard/useCaptureKeys.ts` | the shared capture-key core for word games: `asciiLetters`, letter append, Backspace, Enter, the disabled/busy gates | `cs-blessed-keyboard` |
| `src/common/keyboard/useCaptureKeys.test.ts` | its tests | `cs-blessed-keyboard` |
| `src/common/keyboard/editableField.ts` | the two predicates — `isEditableField` (a focused field owns its keys) and `isNonGameField` (…unless it is the game's own, marked `data-game-input`); created by the actions sprint, replacing `useAppShortcuts.tsx`, which is deleted | `cs-blessed-keyboard` |
| `src/common/keyboard/editableField.test.ts` | its tests | `cs-blessed-keyboard` |
| `src/common/keyboard/useBacktickEscape.ts` | backtick stands in for Escape by re-dispatching a synthetic Escape keydown | `cs-blessed-keyboard` |
| `src/common/keyboard/useBacktickEscape.test.ts` | tests for its pure core `backtickToEscape` | `cs-blessed-keyboard` |
| `src/common/keyboard/useTabRing.ts` | the tab-ring mechanism: a declared ring of stops, a mount-ordered stack of live rings | `cs-blessed-keyboard` |
| `src/common/keyboard/useSwallowTab.ts` | Tab does nothing on a cursor-navigated surface | `cs-blessed-keyboard` |
| `src/common/keyboard/keyboardHandoff.ts` | `handOffKeyboardOnTab`: Tab in a floating panel's field blurs it so the game hears keys again | `cs-blessed-keyboard` |
| `src/common/keyboard/doc.md` · `todo.md` | the folder's design, and its owed work | (no stamp — markdown) |

Read as evidence, not on the roster: `docs/keyboard-shortcuts.md` (the lede
names it canonical for what each key does) and `plans/tab-rings.md` (the plan
this folder's `useTabRing` was built from). Both are reconciled below
(F-keyboard-16, F-keyboard-17) because a doc that is canonical for this
folder's behavior is this folder's to keep true. The importers that were
opened to check a docstring's claim — `GamePage`, `ClubPage`, `HomePage`,
`useFocusTrap`, `FloatingPanel`'s family table, `useGameHasKeyboard`,
crosswords' `useGridKeyboard`, the five `useSwallowTab` PlayAreas, strands and
setgame — stay at whatever stamp they had.

The folder's `todo.md` was read first. Its three Soon items are inherited and
become F-keyboard-1, F-keyboard-2 and F-keyboard-3 below.

## Findings

## F-keyboard-1 · `tab-ring-untested` · `useTabRing` has no test, and its on-screen check is false for a fixed-position stop

Inherited from `todo.md`. Re-derived, not trusted: `onScreen()` is
`el.offsetParent !== null`, and `offsetParent` is `null` for any
`position: fixed` element as well as for a hidden one — so a fixed stop would
be skipped as if unmounted. No caller passes one today (the two rings hold
`<SelectionList>` containers), which is why nothing has noticed. The same test
is in `useFocusTrap.ts:46` with the same hole. The cheap correction is
`el.isConnected && el.getClientRects().length > 0`, or `checkVisibility()`.

A test file `useTabRing.test.ts` is owed regardless: empty ring consumes Tab;
innermost wins and the page gets it back on unmount; Shift+Tab reverses; a
stray focus enters at the end Tab would reach; an off-screen stop is skipped;
modified chords pass. jsdom can drive all of it — `document.activeElement` and
`focus()` work there; only `offsetParent` needs stubbing.

## F-keyboard-2 · `shortcuts-two-scopes` · `useAppShortcuts` binds at two scopes, returns JSX, and mounts its two dialogs three times

Inherited from `todo.md`, and it holds. Three pages call it (`HomePage.tsx:163`
with `chat: false`, `ClubPage.tsx:196`, `GamePage.tsx:343`); each must
remember both the call and rendering its return, and `AnagramDialog` /
`WordLookupDialog` are declared in three trees. The split the todo proposes —
an app-level host owning the two dialogs and their keys, the `/`-chat binding
staying with pages that mount a `<Chat>` — is the shape. The docstring names
two pages ("ClubPage and GamePage") where three call it, and the `chat: false`
paragraph is the place the two-scope problem is described as a feature.

A DECISION: where the host lives. `App.tsx` already mounts
`useBacktickEscape` as the one app-root key listener, so the host is a sibling
of that call; the `/` binding is then a tiny hook the two chat pages call.

## F-keyboard-3 · `handoff-successor` · `keyboardHandoff.ts` audits clean and has a scheduled replacement

Inherited from `todo.md`. The file is right as written. Its two callers are
both floating panels, so the conversion to a ring transition belongs to
`floating-panels/todo.md`, which already carries it. Nothing to do here except
the docstring pass (F-keyboard-11) and NOT tidying it further.

## F-keyboard-4 · `editable-predicate-four-times` · "is this a text field" is written four times, and one of the four disagrees

The predicate `INPUT | TEXTAREA | SELECT | isContentEditable`:

| where | spelling |
|---|---|
| `useGlobalKeyHandler.ts:53-58` | inline, with SELECT |
| `useAppShortcuts.tsx:138-142` (`isNonGameField`) | inline, with SELECT, minus `data-game-input` |
| `game-page/useGameHasKeyboard.ts:14` (`isEditableField`) | the exported one, with SELECT — its own docstring says "those two are candidates to consolidate onto it" |
| `game-page/GamePage.tsx:446-448` | inline, **without SELECT** |

Four spellings of one gate, and the shell's own shortcuts (`⇧<`, `+`, `⌥+`,
`⌥⌫`) fire from a focused `<select>` where every other listener declines.
Setup forms are the case (ui.md → Real forms keeps native selects there), and
they sit on ClubPage where `⇧<` is bound; the GamePage shortcuts only meet a
select in a floating panel over the game — so it is an inconsistency more than
a live bug, but the fix is the same either way.

Proposed: ONE `isEditableField` in `common/keyboard/` (it is a keyboard fact;
`game-page` importing it is the right direction), `isNonGameField` built on it
in the same file, `useGlobalKeyHandler` and `GamePage` calling it. Then
`isNonGameField` stops being exported from a hook file (crosswords and
ClubPage import a predicate from `useAppShortcuts.tsx` today).

## F-keyboard-5 · `modifier-bail-per-caller` · the modifier bail is written in nine `useGlobalKeyHandler` handlers, and two callers lack it

Every handler the dispatcher calls begins with the same line, or reaches it
through `exitOnKey`:

`useCaptureKeys`, `useSwallowTab`, `useDismissLocalFeedbackOnKey`,
`useArrowHistory`, `useBoardCursorKeys`, stackdown `BoardCol`, setgame,
strands, and `useHistoryViewer.exitOnKey` (used bare by codenamesduet,
letterboxed, waffle, wordle, connections, psychicnum). The two that do NOT bail
are the Space-shuffle handlers in connections `BoardCol:370` and psychicnum
`BoardCol:191` — so `⌥Space` shuffles there, which is harmless and certainly
unintended.

docs/keyboard-shortcuts.md's routing table lists "modifier bail" as one of
four gates that apply "before a key ever reaches game code" — but it is not in
the dispatcher; it is a convention each handler re-states. A DECISION: move
the bail into `useGlobalKeyHandler` (every caller wants it; crosswords and
GamePage, which want `⌥` chords, own their own listeners and would be
unaffected), or leave it per-caller and correct the doc. Moving it is the
option that adds and deletes nine lines.

## F-keyboard-6 · `tab-swallow-is-an-empty-ring` · `useSwallowTab`, `useCaptureKeys`' Tab clause, and two inline swallows are `useTabRing([])` four ways

`useSwallowTab`'s own docstring says it is "really `useTabRing([])` … and it
goes when the games declare theirs". tab-rings.md's table: five PlayAreas call
`useSwallowTab`; six games get the swallow from `useCaptureKeys:139`;
strands `PlayArea:382` and setgame `PlayArea:304` write it inline. Same
statement, four spellings.

Two facts the conversion has to respect, both checked:

- **`useSwallowTab` rides the dispatcher and so declines inside a text field or
  floating panel; `useTabRing` declines only inside its transitional
  `closest()` guard.** For the five callers that is equivalent today — chat and
  the scratchpad are floating panels, and none of the five has a text field on
  its board. codenamesduet's clue inputs are not in a panel, but codenamesduet
  is not a `useSwallowTab` caller and its form is its own hand-built ring.
- **`useCaptureKeys`' clause sits between the hard-off and the busy gate on
  purpose** (Tab is swallowed while the entry is live, not at terminal). A page
  ring would swallow at terminal too — which is the tab-rings rule (a surface
  with nowhere for Tab to go consumes it always), so that is a change in the
  intended direction, not a regression.

A DECISION with three sizes: (a) convert only the five `useSwallowTab`
callers to `useTabRing([])` and delete the hook — the mechanism's own folder
finishing its own scaffolding; (b) also drop the clause from `useCaptureKeys`
and the two inline swallows, so every game surface says `useTabRing([])` once
in its PlayArea; (c) leave all of it for each game's area, as tab-rings.md's
sequencing says. The plan's sequencing rule was written when the mechanism was
new; (a) is the smallest and closes this folder's own todo line.

## F-keyboard-7 · `overlay-selector-twice` · the three-part overlay selector is spelled in two places, and the transitional guard names a role nothing in a floating panel carries

`'[data-floating-panel], [role="menu"], [role="dialog"]'` appears in
`useTabRing.ts:91` (marked TRANSITIONAL) and `ClubPage.tsx:427` (whose comment
says "the same overlay guard `useTabToLists` applies" — a hook deleted
2026-08-24). Checked: `FloatingPanel` sets no `role="dialog"`; the three
elements that do are crosswords' number-jump card, the celebration modal's
content and `DefinitionPopover`, all of which sit inside a
`[data-floating-panel]` anyway. And `[role="menu"]` is unreachable: `Menu`
`stopPropagation()`s every key while open, so a window listener never sees a
Tab from inside it. The selector's real content is `[data-floating-panel]`.

The guard's exit is tab-rings.md's innermost-wins: an overlay that declares a
ring makes the page's not innermost. That conversion is `floating-panels`'.
What this area can do now: correct ClubPage's comment (it names a deleted
hook), and write down here that the selector is one term long in effect.

## F-keyboard-8 · `dispatcher-docstring` · `useGlobalKeyHandler`'s docstring says one gate is built in, names two callers, and carries its rationale

Three things in one docstring:

- "One gate IS built in" — there are two; the floating-panel gate is described
  only in a `//` inside the listener. A reader deciding whether to call this
  learns half the contract.
- "Used by the word games (spellingbee, wordle) for physical-keyboard input
  alongside their on-screen keyboards" — a caller census, wrong (nineteen call
  sites; spellingbee has no on-screen keyboard). Deleted, not corrected.
- The two-bad-choices paragraph ("Re-register the listener every render …
  Re-register only when deps change …") is why the implementation is what it
  is; it belongs beside the ref, not in the docstring.

## F-keyboard-9 · `capture-keys-prose` · `useCaptureKeys` cites two anchors that do not exist, counts its callers, and tells a bug story twice

- `docs/ui.md → Text entry` (docstring, twice) — ui.md has no such heading;
  the section is `docs/playarea.md → Text entry — capture, not <input>`.
  `docs/playarea.md → "Move entry"` — no such heading. `docs/ui.md → Feedback
  pill (dismissal modes)` — the heading is `Feedback pill`; the sub-heading is
  a bold line "Dismiss modes".
- `onExtraKey`'s comment: "the only two are spellingbee's and wordwheel's
  Space-shuffles" (a census), then "the key sitting below the hard-off meant
  the two disagreed: you could shuffle a finished board by clicking but not by
  pressing Space" (archaeology). The test file tells the same story with a
  date ("until 2026-08-16"). The rule that survives is one sentence: an extra
  key is a board key, so it runs before the entry's hard-off and busy gate.
- The body's step comments are numbered against the docstring's list and so
  read 1, 3, (extra), 2, 4/5 in source order — correct, and confusing to
  anyone who reads the body first. Consider dropping the numbers and letting
  each comment name its step.
- `CaptureKeysOptions`' fields carry `/**`; the marker pass (F-keyboard-11).

## F-keyboard-10 · `backtick-cost-understated` · `useBacktickEscape` says one text field pays for it; five do

"There's exactly one text field where that matters (chat)". Every editable
field in the app loses the backtick: chat, the scratchpad (crosswords'
notes — the one place a player might type code-ish text), codenamesduet's
clue word, every setup and profile form, the rebus overlay. The blanket
version is a real decision and may well stand; the sentence defending it is
wrong. Also provenance twice ("Ported from crossplay's app-level handler";
"crossplay shipped the blanket version and it was fine") — how it used to be,
not why it is.

A DECISION, small: keep the blanket (and say so honestly), or skip editable
targets (then an iPad user cannot Esc-close chat from inside the box, which
is the case the feature exists for). Recommendation: keep the blanket, fix
the sentence.

## F-keyboard-11 · `docstring-marker-pass` · the folder's `/**` on fields, tests and a floating block

The pass, per file:

- `useCaptureKeys.ts` — nine `/**` on `CaptureKeysOptions` fields → `//`.
- `useCaptureKeys.test.ts` — a `/**` on an `it()` case (the 2026-08-16
  story) → `//`, and shortened (F-keyboard-9).
- `useBacktickEscape.test.ts` — a `/**` block sitting between the imports and
  the first declaration, attached to nothing; it is the file's docstring and
  goes above the imports, where every other test file in the folder puts it.
- `useTabRing.ts:28` — `/**` on `onScreen`, a module function: correct.
  `useAppShortcuts.test.ts:9` — `/**` on a `let`: a variable note, `//`.
- `useGlobalKeyHandler.ts`, `useAppShortcuts.tsx`, `useSwallowTab.ts`,
  `keyboardHandoff.ts`, `useTabRing.ts` — function docstrings only; the
  rationale paragraphs are F-keyboard-8, -12, -13.

## F-keyboard-12 · `swallow-tab-prose` · `useSwallowTab`'s docstring counts callers twice and dates the homepage

"Games built on `useCaptureKeys` (boggle, spellingbee, wordle, wordwheel,
wordiply, psychicnum) already get this" and "Callers today: the five
window-key games' PlayAreas" — two censuses. "That is exactly what the
homepage did until 2026-08-24" — archaeology. If F-keyboard-6 (a) is taken the
file is deleted and this is moot; if not, the three sentences go.

`HomePage.tsx:227` says "Tab does nothing on this page (useSwallowTab)" — false
since the page moved to `useTabRing` (its own line 156). A one-line correction
this area makes, because the false claim is about this folder's hook.

## F-keyboard-13 · `shortcuts-archaeology` · `useAppShortcuts`' docstring ends two bullets with how it used to work

"Each page used to thread a `useRef<MenuHandle>` here by hand." and "(This
used to be re-implemented per-game in spellingbee/scrabble; it now lives here
so it works almost everywhere.)" Both go. `keyboardHandoff.ts` has "Used by
the two floating panels you type into … (`ChatBody`) … (`GameScratchpadCompanion`)"
— a census; the sentence that survives is "for a floating panel's text field".

## F-keyboard-14 · `dispatcher-test-gaps` · the dispatcher's tests cover one of its two gates

`useGlobalKeyHandler.test.ts` tests INPUT / TEXTAREA / SELECT and the
fresh-ref dispatch. Untested: contenteditable, and the whole floating-panel
gate (`[data-floating-panel]`), which crosswords tests for ITS copy of the
guard (`useGridKeyboard.test.ts:244`) while the shared one has no case. Two
cases to add; if F-keyboard-5 moves the modifier bail in, a third.

## F-keyboard-15 · `marker-attributes-by-string` · three DOM markers the folder reads are string contracts with no home

`[data-floating-panel]` (set by `FloatingPanel`, read by `useGlobalKeyHandler`,
`useTabRing`, `useFocusTrap`, `usePanelEscape`, `BlockingModal`, ClubPage,
crosswords), `[data-chat-input]` (set by `ChatBody`, read by
`useAppShortcuts` and an e2e spec), `data-game-input` (set by `CluePanel`,
read by `isNonGameField`, pinned by `CluePanel.test.tsx`). Each is typed by
hand at every site. A rename of any one is a silent break at the readers.

Not proposing a constants module for its own sake; noting it so the decision
is made rather than defaulted. The cheapest guard is a test that greps the
setter and the readers for the same literal, which is what the sprint's other
vocabularies do. Candidate for `todo.md` → Maybe if not taken.

## F-keyboard-16 · `shortcuts-doc-drift` · `docs/keyboard-shortcuts.md` is canonical and has five claims the code no longer makes

Checked against the tree 2026-09-09:

1. Routing table, "Four gates apply before a key ever reaches game code" —
   two are in the dispatcher; "modifier bail" is per-handler (F-keyboard-5)
   and "open menu" is `Menu`'s own `stopPropagation`. Say which is where.
2. "Any floating panel · Tab / ⇧Tab · Cycles focus inside the panel (focus
   trap)" — only the three MODAL families trap (`FloatingPanel` family table:
   `trapsFocus` follows the scrim); companions and dialogs let Tab out.
3. Same row: "Chat and the scratchpad opt out of Esc-to-close" — false; every
   family is `escape: 'close'` except `modal-fault`, so both close on Escape.
4. The `useAppShortcuts` section header says "any page with chat and the logo
   menu (club page + play area)" — the home page calls it too; only `/` is
   chat-scoped.
5. connections: "It used to say `Space` on a focused tile toggles it … That's
   gone" — archaeology in a doc that describes now. (A per-game row; noted
   here because the whole doc was read.)

Also "Fourteen of the sixteen games swallow it" — a count; the condition is
"every game but crosswords and codenamesduet", which is what the sentence
already says. The count goes.

## F-keyboard-17 · `tab-rings-plan-stale` · `plans/tab-rings.md` names two things that no longer exist and one leak that closed

The plan's status line says the mechanism is built and surfaces convert as
their areas open — right. Stale inside it:

- `common/hooks/input/useTabRing.ts` → `common/keyboard/useTabRing.ts`.
- `CodenamesduetAISuggestModal.trapTab` (three mentions) — that rename was
  reverted; it is `CluePanel`'s `trapTab`.
- "There is no focus trap in `FloatingPanel`" (leak 3) — `useFocusTrap`
  exists and the modal families use it; the doc line it corrects is wrong the
  OTHER way now (F-keyboard-16 item 2).
- "Nothing handles Tab at all — letterboxed" (leak 1) — letterboxed renders
  `<EntryRow>`, so it has `useCaptureKeys`' swallow. codenamesduet's board
  still leaks (its PlayArea only passes `exitOnKey`), which is that game's.
- "the scratchpad does not close on Escape (`closeOnEsc={false}`)" — the prop
  is gone; the companion family closes.
- The `useTabToLists` section describes a hook already deleted; the "Open"
  section says so. Fold or cut.

A DECISION: this area fixes the names (mechanical) and leaves the plan
standing, or the plan's durable half folds into `docs/keyboard-shortcuts.md`
now that the mechanism's folder has been audited. The plan's own header wants
the fold "as each surface converts", which argues for standing.

## F-keyboard-18 · `stale-paths` · four docs and a plan still say `common/hooks/input/`

`docs/common.md:755`, `docs/playarea.md:259`, `docs/games/spellingbee.md:81`
and `:469`, `plans/keyboard-nav-plan.md:241`, `plans/tab-rings.md:7`. A
find-and-replace this area ships. (`docs/playarea.md:209` and `:218` say
`common/components/game/entry/` for `EntryRow`/`MoveRow`, which is
`word-entry`'s — noted in passing, same fix, same commit if wanted.)

## F-keyboard-19 · `common-md-second-copy` · `docs/common.md` carries a second, older copy of the shortcuts

`docs/common.md:628-644` re-describes `useAppShortcuts` and the Tab handoff at
length: "Both pages call it" (three do), the `?` row says the page "wires
`openMenu` to its `<Menu ref>`" (it is `pageMenuStore` now), `⌥\`` is missing,
and the `useSwallowTab` paragraph lists the five callers. `keyboard/doc.md`
names `docs/keyboard-shortcuts.md` canonical. One home: common.md keeps a
sentence and a link; the table and the two long paragraphs go.

## F-keyboard-20 · `doc-md-design` · the folder's `doc.md` is a lede

Owed at close. What only the folder can say: the app has ONE window
dispatcher and everything else composes on it; a key has one owner per
surface (the dispatcher's two gates say who); Tab is never native — a surface
declares a ring, and an empty ring is a ring; the shell's own shortcuts
(`GamePage`, `ClubPage`) and crosswords own their own listeners and are the
only ones that want modified keys; the `data-*` markers are the contract
between this folder and the panels. Written after the decisions above land,
since F-keyboard-5 and -6 change two of those sentences.

## Notes

- **The actions sprint came out of this area (2026-09-09) and shipped
  2026-09-10.** Every key and command is now a bound action: what a command IS
  is `src/common/actions/doc.md`, what each key DOES is
  `docs/keyboard-shortcuts.md`. Two of this area's findings are closed by it
  outright — F-keyboard-5 (modifier-bail-per-caller: the chord matcher owns
  the bail) and the Space-shuffle spellings (shuffle is `⌥Z`, one registry
  row) — and `useAppShortcuts` is deleted, so its rows on the roster above
  name files that no longer exist. The re-read for the close has to sort the
  rest into resolved, moot and surviving.
- **The dispatcher's `[role="menu"]` and `[role="dialog"]` terms are inert**
  (F-keyboard-7): nothing a window listener can see carries them outside a
  `[data-floating-panel]`. Written down so no one "fixes" the selector by
  adding a fourth term.
- **`useTabRing` does not decline inside a text field, by design** — a field
  is a stop (tab-rings.md → "a text field is a STOP"). A form that lives
  outside a floating panel and declares no ring — codenamesduet's clue form is
  the one — has its own `trapTab`, which runs first on the input and
  `preventDefault`s, so the page ring's later `preventDefault` is a no-op.
  Two handlers on one Tab, both agreeing; it holds until that game's area
  gives the form a ring.
- **`useAppShortcuts`' `/` focuses `[data-chat-input]` one rAF after flipping
  the store.** Pinned by `chat-keyboard.e2e.ts`; not unit-tested, and jsdom
  would not prove it anyway.
- **`⌥Space` shuffles in connections and psychicnum** (F-keyboard-5's two
  exceptions). Harmless; falls out of the fix if the bail moves.
- **GamePage's shortcut listener and ClubPage's `⇧<` are not this folder's**
  (game-page, club-page), but both restate the editable predicate
  (F-keyboard-4) — a two-line call-site edit each once the predicate has one
  home, which ships with that finding.

## Predicted test breaks

*(written when the area starts changing things)*

- F-keyboard-4: none expected — the predicate keeps its behavior; GamePage
  gains SELECT.
- F-keyboard-5 (if moved): `useCaptureKeys.test.ts`, `useSwallowTab` (none),
  `useDismissLocalFeedbackOnKey.test.ts`, `useArrowHistory.test.ts`,
  `useBoardCursorKeys.test.ts` — each has a modifier case that still passes
  (the bail moves up, the observable is the same).
- F-keyboard-6 (a): `e2e/tab-swallow.e2e.ts` keeps passing (same observable:
  focus never leaves body); its header names `useSwallowTab`.
- F-keyboard-2: `useAppShortcuts.test.ts` — the `~` and `⌥\`` cases assert on
  the hook's RETURN value, which the split removes.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not

## Close (2026-09-10)

The closing re-read, after the actions sprint had rebuilt the folder's
subject underneath it. Every finding, sorted:

| finding | slug | status | what settled it |
|---|---|---|---|
| F-keyboard-1 | `tab-ring-untested` | surviving | `todo.md` → Soon; `useTabRing` still has no test |
| F-keyboard-2 | `shortcuts-two-scopes` | resolved | `AppActionsHost` binds the four keys once at the app root; `useAppShortcuts` deleted |
| F-keyboard-3 | `handoff-successor` | surviving | `todo.md` → Soon; the ring transition is `floating-panels`' |
| F-keyboard-4 | `editable-predicate-four-times` | resolved | `editableField.ts` is the one home; the dispatcher, `useGlobalKeyHandler`, `useGameHasKeyboard` and bananagrams read it |
| F-keyboard-5 | `modifier-bail-per-caller` | resolved | the chord matcher owns the bail; the two leftover Tab clauses bail by hand, correctly |
| F-keyboard-6 | `tab-swallow-is-an-empty-ring` | surviving | `todo.md` → Soon, with the two facts the conversion must keep; the decision is `plans/tab-rings.md`'s |
| F-keyboard-7 | `overlay-selector-twice` | resolved | ClubPage's comment names `useTabRing`; the ring's transitional guard is the one spelling left and is tab-rings' to retire |
| F-keyboard-8 | `dispatcher-docstring` | resolved | two gates named, no caller census, the ref rationale sits beside the ref |
| F-keyboard-9 | `capture-keys-prose` | resolved | anchors point at `docs/playarea.md → Text entry`; `onExtraKey` is gone; the fields carry `//` |
| F-keyboard-10 | `backtick-cost-understated` | resolved | the blanket stands and the docstring says what it costs; provenance gone |
| F-keyboard-11 | `docstring-marker-pass` | resolved | `CaptureKeysOptions` fields `//`; the backtick test's file docstring above its imports |
| F-keyboard-12 | `swallow-tab-prose` | resolved | no counts, no date; the caller is named by its condition |
| F-keyboard-13 | `shortcuts-archaeology` | resolved | `useAppShortcuts` deleted; `keyboardHandoff` names the condition, not the two callers |
| F-keyboard-14 | `dispatcher-test-gaps` | resolved | the action dispatcher tests both gates (`dispatcher.test.tsx`); `useGlobalKeyHandler.test.ts` gained the panel-gate case |
| F-keyboard-15 | `marker-attributes-by-string` | surviving | `todo.md` → Maybe |
| F-keyboard-16 | `shortcuts-doc-drift` | resolved | the doc's routing section describes the dispatcher; the floating-panel row says which families trap and that every family but the fault modal closes on Escape |
| F-keyboard-17 | `tab-rings-plan-stale` | resolved | the plan's names fixed (`common/keyboard/useTabRing.ts`, `CluePanel.trapTab`), its three false leaks corrected; the plan stands |
| F-keyboard-18 | `stale-paths` | resolved | every `common/hooks/input/` and `common/components/game/` path repointed |
| F-keyboard-19 | `common-md-second-copy` | resolved | `docs/common.md` keeps one paragraph on the Tab round trip and links the folder doc and the shortcuts doc |
| F-keyboard-20 | `doc-md-design` | resolved | `doc.md` has its Design: whose keystroke, where Tab may go, backtick as Escape; not on `DESIGNS_OWED` |

Two rows on the roster went and two came: `useAppShortcuts.tsx` and its test
are deleted, `editableField.ts` and its test are the folder's new files. The
docstring-marker pass at this sitting found the nine `/**` on
`CaptureKeysOptions` still standing from F-keyboard-11 and one file docstring
below its imports; both are fixed. `doc.md` was harvested at the sprint's step
7 and re-read here; nothing owed.
