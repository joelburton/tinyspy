# Area: actions

The folders it reads: `actions`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-11** (Joel: "bless the files and close the area") —
every roster file reads `cs-blessed-actions`, stamped at those words. Opened
the same day: roster agreed (Joel: the two guards and the e2e helper stay
off, "then audit the area") and stamped `cs-audited-actions`.
Every audit finding is worked, ruled or withdrawn. **The whole-area re-read
was done the same day**; it found two small things, F-actions-12 and -13
under "The re-read" below, both worked. `doc.md` needed no other change.
Blessed and closed on his words the same day.

## The roster

All in `src/common/actions/`, all written whole by the actions sprint on
2026-09-10:

| file | what it is |
|---|---|
| `registry.ts` | `ACTIONS`, every command's fixed half, and `ActionSpec` |
| `useBoundAction.ts` + `.test.ts` | the live half, the binding stack, `useBoundActions`, `useAppAction` |
| `dispatcher.ts` + `.test.tsx` | the one window key listener: the two gates, the three passes, the tie warning |
| `chord.ts` + `.test.ts` | `Chord`, `KeyPattern`, `matches` |
| `AppActionsHost.tsx` + `.test.tsx` | the shell's four keys and the two dialogs two of them open |
| `ActionButton.tsx` + `.test.tsx` | the button that IS an action |
| `actionSurface.ts` | the props a bespoke control spreads to be one |
| `KeyList.tsx` + `.module.css` + `.test.tsx` | the generated key list in Help |
| `nameWithKey.ts` | "Shuffle · ⌥Z" |
| `boundAction.fixture.ts` | a bound action for a test that does not bind |
| `doc.md` | Design and Details, written by the sprint; not on `INTROS_OWED` |
| `todo.md` | one Bug, one Soon, three Someday, one Maybe |

Left off, at Joel's word: the two guards (`actionIds`, `registeredChords`) and
`e2e/helpers/actions.ts`.

**Callers, for evidence (read, not stamped).** `useBoundAction` is imported
by ninety-odd files — every game's PlayArea and most of the shell.
`useActionDispatcher` is mounted once in `App.tsx` and by every game's
PlayArea spec. `useAppAction`: `GamePage`, `ChatButton`, crosswords'
PlayArea. The unkeyed registry rows are all bound somewhere: `act-pause` by
`PauseButton`, `act-toggle-info-sheet` by `InfoSwitchButton`,
`act-share-preview` by bananagrams, `act-zoom-fit` by scrabble. No
registry row uses the `digit` pattern. End, Concede and Restart are bound for
every game by `game-page`'s `useStandardGameActions`, not by each PlayArea
directly.

**The docs agree with the code.** docs/keyboard-shortcuts.md → How a
keystroke is routed says the same gates, passes, order, repeat and Cmd rules
the dispatcher implements, and every claim in `doc.md` I could check holds:
the shell's four keys, chat hidden without a panel, `ConfirmationHost` in
`App.tsx`, `act-end-game` bound by `GamePage` for the pause overlay, the two
guards, the e2e helper.

## Findings

### Code and prose

## F-actions-1 · `docstring-marker-pass` · `actionSurface.ts`'s type members are `/**` fields

`ActionSurface`'s four members (`hidden`, `label`, `icon`, `buttonProps`)
carry `/**`. Every other type in the folder already puts `//` on its members
(`ActionSpec`, `Chord`, `KeyPattern`, `Described`, `LiveAction`,
`BoundAction`), so this is one file out of step with its siblings. The `/**`
stays on the type and on `actionSurface()`.

**WORKED 2026-09-11 (Joel: "do the no-decisions ones").** The four members
are `//`.

## F-actions-2 · `keylist-css-unmarked` · `KeyList.module.css` carries no `/* @@ */` markers

Six rules, none marked. Every other stylesheet marks every rule until Joel
has seen it in place and says so — removing the marker is the act of
deciding — and a sprint-written file is not exempt (`empty-state.css`, written
by the lists area, is marked). The values themselves are all tokens; the one
literal is `font-weight: 500`, which is bespoke by the forms ruling. Mark the
six, or say these were seen.

**WORKED 2026-09-11.** All six rules marked. The header's "rules copy" became
"rules text" in passing.

## F-actions-3 · `counts-and-archaeology` · Four sentences, and a header after its imports

- `registry.ts`: "answers to the same key in all sixteen of them" — the game
  count.
- `registry.ts` → `act-recall-tiles`: "Keyless: it has always been a button."
- `dispatcher.ts`: "Two gates come first, and they are the same two the app
  has always had."
- `chord.ts`: "every listener that matched those by character had to explain
  the workaround itself" — the listeners this folder replaced.
- `chord.test.ts` puts its header docstring after the imports; the folder's
  other specs put it before.

**WORKED 2026-09-11.** "In every one of them"; "Keyless: it is a button";
the gates are "the app's, not an action's"; the chord docstring says what a
`code` chord does without the listeners it replaced; the spec header sits
before its imports.

## F-actions-4 · `rotate-wears-shuffles-glyph` · Two rows borrow another command's icon

`act-rotate` wears `IconShuffle` and `act-end-game` wears `IconConcede`. The
`icon` member's own comment says the registry exists so "one registry keeps a
glyph meaning one thing", and `icons.ts` names every glyph "under the name of
what it means". So either the glyph means something broader than its name
says (rearrange; stop) and the icon registry should say so with a second name
for the same glyph — a two-line conformance edit in the closed `icons` area —
or the borrowing is fine and the comment should not claim otherwise. Joel's
call.

**RULED 2026-09-11 (Joel: "shuffle and rotate use the same icon; it's fine.
keep them as separate actions, but both using the icon").** Two actions, one
glyph, by decision. Nothing changes.

## F-actions-5 · `open-menu-active-with-no-menu` · The folder's own Bug

From `todo.md` → Bugs, this area's to fix: `AppActionsHost` binds
`act-open-menu` with `describe: () => 'active'` unconditionally, so on a page
with no registered menu (a game paused, where its menu is gone) `?` sits in
the key list and does nothing. `pageMenuStore` is a slot with no subscription,
so `describe` cannot ask whether a menu is registered. The fix is the shape
`chatOpenStore` already has for chat: give the store a subscription and a
`usePageMenuMounted()`, and answer `hidden` when nothing is registered.
`AppActionsHost.test.tsx`'s "'?' with no menu registered does nothing" then
asserts the key is unbound and falls through, the way the no-chat test does.

**RULED 2026-09-11 (Joel: "there is no help on pages without menus. since
nothing bad happens; we will just ignore this").** The one cost was a key
list that lies, and the key list only exists in Help, which only exists where
a menu does — so nothing lies to anyone. Not fixed; the Bug is out of
`todo.md`, with the Soon (F-actions-6) and the Maybe (F-actions-7), since
all three are decided.

## F-actions-6 · `hidden-vs-disabled-ruling` · The folder's own Soon, and a decision

From `todo.md` → Soon: `doc.md` says `hidden` is "not here at this moment"
and `disabled` is "here, and not right now", yet psychicnum, letterboxed,
connections, stackdown, scrabble and codenamesduet answer `disabled` for
Hint, Spoiler and Reveal outside their moment, on purpose — the menu row is
the legend that teaches the glyph, and the terminal-row slot keeps its shape.
Either `doc.md` states that exception and its reason, or the games conform
when their areas open. This area owns the doc, so it is where the ruling gets
written.

**RULED 2026-09-11 (Joel: "wontfix; fine as-is. we may change some when going
through individual games").** The doc's definitions stand; a game answering
`disabled` where `hidden` would fit is that game's to revisit at its own
area. The Soon item comes out of `todo.md` at the close, since nothing is
owed here.

## F-actions-7 · `digit-pattern-unused` · The folder's own Maybe

From `todo.md` → Maybe: `KeyPattern` offers `digit`, no registry row uses
it, and `chord.test.ts` tests it. A pattern nothing binds is a line the
matcher carries for a game that types numbers, and none does. Delete it (the
arm, its test, its mention in the comment), or keep it as designed-ahead and
leave the item.

**RULED 2026-09-11 (Joel: "keep").** The pattern stays; the Maybe item comes
out of `todo.md` at the close, since it is decided.

## F-actions-8 · `doc-md-details-restates-docstrings` · Details is a tour

`doc.md`'s Design is a narrative and holds up. Its Details section is 150
lines of twenty-two bolded paragraphs, and most of them restate a docstring
in the same folder nearly verbatim: the stack order (`useBoundAction.ts`),
the three passes and the disabled-keeps-the-key rule (`dispatcher.ts`), the
chord and shift rules (`chord.ts`), the four keys (`AppActionsHost.tsx`), the
key list (`KeyList.tsx`), the bubble (`nameWithKey.ts`, `ActionButton.tsx`),
the bespoke control (`actionSurface.ts`), the fixture
(`boundAction.fixture.ts`). docs/common-folders.md: nothing that belongs in
a docstring, and not a tour of the files. What only the folder can say —
the two-halves model, binding is offering, the three passes as a design,
what `data-action` is for, the two guards, why the confirmation is the
shared run's — is the Details that survives; the rest becomes a pointer at
the file. Joel decides how far to cut.

**DIRECTION 2026-09-11 (Joel):** the cut runs the OTHER way. "Consider
whether the docstrings need info stored in Details; docstrings should be
about 'who should call this and how?'. If there are internal things, that
should be comments in the docstring — or a pointer to the doc.md if this is
something better explained with context or is common between things." So
Details keeps what needs context or is shared across files; each docstring
shrinks to who calls it and how, with internals moved onto the lines they are
about or replaced by a pointer at `doc.md`. The same shape as F-forms-19.
Joel, on the framing: "it's not that the only option is move docstring →
doc.md; there may be times it makes more sense to keep in docstring, with the
component. I'm just observing that you often are putting lots of design
decisions or internal stuff in a docstring."

**WORKED 2026-09-11 (Joel: "let's do f8").** File by file:

- `useBoundAction.ts`: the file-level docstring was not attached to anything
  a hover could show, so the hook's own docstring is now the example, "bind
  once and hand it to everything", what `run` does, and a pointer. The
  binding-stack explanation was a 25-line docstring on a module-private
  const; it is a `//` comment, half the length, with the order rule in one
  sentence and the rest pointed at `doc.md`. `Described`'s docstring keeps
  the fallback rule and points at `doc.md` for what may vary. The
  ref-during-render comment is nine lines, down from nineteen, on the line
  it defends.
- `dispatcher.ts`: the hook's docstring is who mounts it and the shape of
  the routing in two sentences, down from 46 lines. What each pass does now
  sits on the pass, in the comments that were already there, filled out.
- `chord.ts`: the file docstring is "reach for this when giving an action a
  key" and a pointer; `matches` says its two rules in one line, with the
  reasons on the lines that apply them.
- `KeyList.tsx`: "place it once in a help companion; it draws itself." The
  one-row-per-command rule and the End-bound-twice case moved onto the
  dedupe.
- `ActionButton.tsx`: the `data-action` comment is three lines and points at
  `doc.md` for the attribute-versus-class reasoning.
- `registry.ts`: one sentence dropped. The rest is "adding an action is
  adding a row here", which is the how-to and stays.
- Kept as they were: `actionSurface`, `nameWithKey`, `AppActionsHost`,
  `boundAction.fixture`, and every type member note — all already "who calls
  this and how".
- `doc.md` Details is untouched: now that the docstrings point at it, it is
  the one copy rather than the second.

## F-actions-9 · `keylist-filter-side-effect` · A `filter` that writes

`KeyList.tsx`: `.filter((row) => !seen.has(row.action.id) && seen.add(row.action.id))`
dedupes by mutating a set inside a predicate, and reads as a test until the
`&&` is parsed. A comment saying "first binding wins, later ones dropped" or a
plain loop would say it. Small.

**WORKED 2026-09-11.** The dedupe is its own `filter` with a body and a
comment saying the first binding keeps its row; behavior unchanged, and the
"lists a command ONCE" test still passes.

### Prose elsewhere, turned up by this area's reading

## F-actions-10 · `common-md-names-a-missing-hook` · WITHDRAWN — the hook exists

**A false finding, and the record of how.** I claimed docs/common.md named a
hook that did not exist. `useStandardGameActions` exists at
`src/common/game-page/useStandardGameActions.ts`, binds End, Concede and
Restart for every game, and is imported by every game's PlayArea. The grep I
ran to check was piped through `head -3`, which showed only the first three
mentions (two `todo.md`s and a PlayArea), and I read the cut-off list as the
whole answer and the absence of a `common/` file as proof. An absence a tool
reports is the easiest wrong answer, and a truncated tool is the easiest way
to get one.

**Both edits reverted 2026-09-11**, the End sentence (line 226) and the
Concede sentence (line 274), to their original text word for word. docs/common.md
is as it was. The callers paragraph above, which says every game binds
`act-end-game` "itself with `useBoundAction`", was wrong for the same reason:
they bind it through `useStandardGameActions`, which is the `game-page`
area's.

## F-actions-11 · `keyboard-shortcuts-now`

docs/keyboard-shortcuts.md → How a keystroke is routed: "the `<select>` in the
first row is now almost vestigial outside real forms" — "now" is a before.
One word; the keyboard area's doc, touched because this area read it.

**WORKED 2026-09-11.** The word is out.

### The re-read, 2026-09-11

Every file on the roster read end to end after F-actions-8, and `doc.md`
checked against the code as the one copy the docstrings now point at. Every
pointer the docstrings make names a phrase that is in `doc.md`. What did not
hold up:

## F-actions-12 · `any-key-behaviors-are-three` · "The two behaviors that answer to every key" — there are three

`chord.ts` says it twice (`KeyPattern.pattern`'s comment: "for the two
behaviors that answer to every key (dismissing feedback, leaving the history
viewer)"; `isWildcard`'s docstring: "The two behaviors that do are…"), and
`doc.md` said it once ("The two any-key behaviors differ in one property").
The registry has three `pattern: 'any'` rows: `act-dismiss-feedback`,
`act-exit-history` (`act-exit-viewer` when this was written — `turn-log`
renamed it 2026-09-16) and crosswords' `act-drop-peek`, a non-consuming watcher
like dismiss. A count, and already wrong.

**`doc.md`'s half WORKED 2026-09-11** as part of "update the doc.md as
needed": the paragraph names all three and keeps the one distinction
(the viewer consumes; the other two do not). **The `chord.ts` half WORKED
2026-09-11 (Joel: "fix f12 and f13")**: both comments name the three and
count nothing. A fourth site turned up in the fix: the registry's section
heading "The two behaviors that answer to any key", which groups the two the
shell shares while crosswords' third sits in that game's section above. It
now reads "The any-key behaviors every game shares".

## F-actions-13 · `small-leftovers` · Two lines

- `useBoundAction.ts`, the stack-entry comment: "both want the newest one,
  neither wants last one" — a dropped "the".
- `KeyList.module.css` header: "Separated from the rules text above it by a
  rule" — "rule" twice in two senses (the game's rules, a drawn line). "By a
  line" says it.

**WORKED 2026-09-11.** "Neither the last"; "by a line".

**The lede and Design need no change.** The lede still says what the folder
is and defers what each key does to keyboard-shortcuts.md; the Design
narrative describes the code as it is; nothing this area changed touched
behavior.

### Ruled already, recorded so the re-read does not re-raise them

- **`// eslint-disable-next-line react-hooks/refs`** twice in
  `useBoundAction.ts`: each carries its reason on the line and the docstring
  above explains why the ref is written during render. Deliberate; stays.
- **`import.meta.env.DEV` in the dispatcher** for the tie warning: the walk
  stops at the winner in production. Deliberate; stays.
- **The registry casts `ACTIONS[id] as ActionSpec`**: `as const satisfies`
  narrows each row to its literal shape, and the cast widens it back for the
  binding. Fine.

## Notes

- **`todo.md`'s Someday items, reviewed with Joel 2026-09-11.** The
  tooltip item moved to `tooltips/todo.md` ("consider non-text content"),
  which is the folder that would do it. The per-game key tables in
  docs/keyboard-shortcuts.md: Joel — "we should get rid of these; they're not
  needed and will definitely drift", and on the prose between them, "we can
  do this as we hit the game" — so the section goes game by game, each
  game's prose into its own doc; recorded in docs/deferred.md (it crosses
  sixteen games) and out of this folder's `todo.md`. The flat key list stays
  on the todo, reworded to what Joel meant: "the real advantage is less the
  order but the grouping: 'General keys' with those, 'Crossword keys' with
  those."
- **Every `Someday` and the Bug name a real thing** — checked against the
  code; nothing in `todo.md` is stale.
- **The vocabularies guard has no row for this folder**: `KeyList.module.css`
  reads tokens throughout. Nothing to convert.

## Predicted test breaks

*(written when the area starts changing things)*

- F-actions-5 (open-menu-active-with-no-menu): `AppActionsHost.test.tsx`'s
  "does nothing" test changes shape; `KeyList` and menu tests that expect `?`
  listed on a page with no menu, if any, change with it.
- F-actions-7 (digit-pattern-unused), if deleted: `chord.test.ts`'s `digit`
  case goes with it.
- F-actions-1, -3, -8, -9, -10, -11: prose; nothing runs differently.

## Closing

- [x] the whole area re-read in one sitting after the last group —
      2026-09-11; F-actions-12 and -13 are what it found
- [x] the folder's `doc.md` Design holds up (already written); on Joel's
      framing the cut ran from the docstrings toward it, and it is now the one
      copy
- [x] `todo.md` holds everything still owed (three Someday items); nothing
      durable left in this file
- [x] every file on the roster blessed, or its stamp says why not — all
      seventeen `cs-blessed-actions`, 2026-09-11, on Joel's words "bless the
      files"

## Closing summary

Moved here from `plans/app-audit.md` (its "Where to start" notes and its row in
the areas table) when that file was trimmed to the process, 2026-09-23.

**CLOSED 2026-09-11.** what a command IS: the registry of every command's fixed half, the one key dispatcher, the bound action a page or component makes, and the surfaces that read it (`<ActionButton>`, `actionSurface`, the key list). Built by the actions sprint (2026-09-10) and on no roster since; `doc.md` is written. Its two guards (`actionIds`, `registeredChords`) and `e2e/helpers/actions.ts` are its to list at the opening
