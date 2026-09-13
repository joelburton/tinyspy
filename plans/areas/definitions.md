# Area: definitions

The folders it reads: `definitions` · `anagram-finder`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-12. Every finding is worked, F-1 to F-22
(F-18 to F-21 are the closing re-read's; F-22 came from a question after it);
both `doc.md` Designs are written. What remains is the blessing, which is
Joel's.**

## The roster

Agreed 2026-09-12 at twenty-three files, all `cs-met-definitions` →
`cs-audited-definitions`. Twenty-five now: F-definitions-15 wrote three and
deleted one, and F-definitions-22 deleted one.

- `src/common/definitions/DefinitionPopover.tsx` + `.module.css`
- `src/common/definitions/DefinitionView.tsx` + `.module.css`
- `src/common/definitions/WordLookupDialog.tsx` + `.test.tsx` (its
  `.module.css` is deleted — F-definitions-22)
- `src/common/definitions/WordEditDialog.tsx` + `.module.css` + `.test.tsx`
- `src/common/definitions/DefinableWord.tsx` + `.test.tsx` — written by this
  area (F-definitions-15), with `DefinitionHost.tsx` and `definitionStore.ts`;
  they replace `useDefinePopover.tsx`, which is deleted
- `src/common/definitions/DefinitionHost.tsx`, `definitionStore.ts`
- `src/common/definitions/useDefinition.ts`
- `src/common/definitions/parseDefinition.ts` + `.test.ts`
- `src/common/definitions/wordEditStore.ts`
- `src/common/anagram-finder/AnagramDialog.tsx` + `.module.css` + `.test.tsx`
- `supabase/functions/common-define/index.ts` — the lookup edge function
- `supabase/tests/common/anagrams_test.sql`, `supabase/tests/common/words_edit_test.sql`
- `e2e/anagram-finder.e2e.ts`, `e2e/word-edit.e2e.ts`

Plus the two folders' `doc.md` / `todo.md` (no stamp — markdown). Both
`doc.md`s have a Design and a rewritten lede (the closing re-read); both rows
are off `DESIGNS_OWED`.

**Decided at the opening (Joel: 1 yes · 2 in roster · 3 yes):**

- **`supabase/sql/common.sql` is evidence, not roster** — the same ruling the
  `supabase` area made, because a stamp is per file. Its two sections this area
  reads: `common.anagrams` (with `_anagram_fits`) and the dictionary-curation
  block (`_require_word_editor`, `_validate_word_fields`, `update_word`,
  `delete_word`, `add_word`, the `words_edits` policy) and `cache_definition`.
  A stale claim there about this folder's dialogs is forward-fixed.
- **The edge function, the two pgTAP files and the two e2e specs are ON the
  roster**: nothing else names them.
- **`common.words` and `common.words_edits`** in the baseline migration are
  evidence.

Consumers: `App.tsx` (mounts `WordEditDialog`, and now `DefinitionHost`),
`actions/AppActionsHost` (mounts the two dialogs), `account/useAccountMenuSection`
(the "Add word" opener), and the fourteen surfaces that show a definable word —
`word-list/WordList` and the games' `InfoCol` / `GameTurnLog` /
`SolutionReveal` files, all rewritten onto `<DefinableWord>` by
F-definitions-15. Evidence: `core-css/utilities.css → .definable`,
`keyboard/useDismissOnEscape`, `floating-panels/FloatingPanel` (`fitContent`),
`buttons/StandardButton.module.css` (the tones), `session/useProfile`,
`guards/orphanedDocstrings`, `guards/vocabularies`, `docs/common.md`'s three
sections (word definitions · the anagram finder · dictionary curation).

## Findings

### WORKED · F-definitions-1 · stranded-docstrings · three component docstrings sat above their form types

`AnagramDialog`, `WordLookupDialog` and `WordEditDialog` each opened with the
component's docstring, then `/** What the form holds */ type Values` (and in
`WordEditDialog`, a hundred lines of types and helpers), then the function —
so the prose read as `Values`'s and the component read as undocumented.
`AnagramDialog` was on `orphanedDocstrings`' known list; the other two had the
same defect but were exempt by the guard's first-docstring rule. All three
reordered so the docstring sits on the function; the guard line deleted.

### WORKED · F-definitions-2 · plan-citation · `(F23 → C)` in three durable comments

The `fitContent` comment in all three dialogs ended with a finding number from
a dead area file. The reasoning lives on `FloatingPanel`'s `fitContent` prop;
the three comments now say the one sentence and point there.

### WORKED · F-definitions-3 · chord-glyph · the anagram finder called itself ⌥`

`AnagramDialog.tsx`, its stylesheet, its test header and the `docs/common.md`
heading all wrote the unshifted chord, which the registry says nothing binds.
The chord is `⌥~`.

### WORKED · F-definitions-4 · stale-result-names · the edge function described the response it used to send

`common-define`'s docstring still gave `{ word, def: null, unknown?: true }`
semantics; the function answers with three named results. Rewritten to name
them, matching `DefinitionResult`. Same file: a comment said a service-error
"carries ERROR_COPY" (deleted with the error sprint) and one sentence was
written twice. `WordMeta`'s docstring said "absent when `unknown`" →
`not-a-word`.

### WORKED · F-definitions-5 · redundant-hover-rules · two local hover rules only ever painted a disabled button

`WordLookupDialog.module.css → .button:hover` and
`WordEditDialog.module.css → .saveButton:hover` set the shared primary hover
color. `StandardButton`'s `.primary:hover:not(:disabled)` outranks them
(0,3,0 over 0,2,0), so the local rule could only win where the shared one
declined: on a DISABLED button, which then took a hover wash. Both removed.

### WORKED · F-definitions-6 · tone-reset-duplicates-the-prop · `.deleteButton` re-set the destructive slot tokens

The rule's comment said the tone classes were out of reach "for a raw
<button>". The Delete control is `<StandardButton tone="destructive">`, whose
`.destructive` class sets exactly those tokens. The rule and its four-paragraph
comment went; the props say it.

### WORKED · F-definitions-7 · edit-link-on-error · the Edit link showed after a failed lookup

`DefinitionView` drew "Edit word…" whenever the result was not `not-a-word` —
which included `result === null`, the error case. The dialog edits a row, so
the link now requires `defined` or `no-definition`.

### WORKED · F-definitions-8 · profile-comment-wrong · "snapshot-only … the account menu loads it"

`useProfile` is a `useSyncExternalStore` subscription, and `useSession` fills
the store before the first page mounts. The comment rewritten to what the
condition is about: only a word the list holds.

### WORKED · F-definitions-9 · popover-docstring · rationale in the docstring; a computed `aria-label`

`DefinitionPopover`'s docstring carried fixed-vs-absolute reasoning and the
portal/transform explanation. The docstring now says what it is and how to
render it; the portal reason is a comment at the `createPortal` call, which is
the code it explains. `aria-label` was ``Definition of ${word}`` — no test
reads it, so it is the fixed string `Definition`. A stray two-space indent on
the `createPortal` import went too.

### WORKED · F-definitions-10 · rotting-tallies · caller lists in two comments

`useDefinePopover`'s docstring listed four games and how each used to carry
the same three lines; `DefinitionPopover.module.css` counted "ten mount sites
(…)". Both now name the condition (a surface that shows definable words).

### WORKED · F-definitions-11 · stale-cites · claims about these files that were no longer true

- `parseDefinition` and `docs/common.md` cited "the definition-format notes in
  docs/games/spellingbee.md"; no such notes exist there. Both now say the
  upstream word list's gloss format.
- `docs/common.md → Frontend` used pre-reorg paths (`hooks/definitions/`,
  `lib/`, `components/`) and `supabase.functions.invoke`; said the words were
  "click/keyboard-activatable" (pointer-only, by `.definable`'s rule); listed
  which games had wired it, with "boggle/crosswords later"; and said
  `common.words` had "no RLS" (on since `20260813000000`, permissive).
  `docs/games/spellingbee.md` had the old component paths.
- `anagrams_test.sql`: "severity: validation … on its own error line" and
  "nothing renders it yet — the form plumbing comes later" — the dialog routes
  by `field` now. `common.sql`'s PN001 comment said the same. Both fixed.
- `word-edit.e2e.ts` justified `exact: true` by a "Word to look up" caption
  the lookup box no longer has.

### WORKED · F-definitions-12 · unnamed-effects · two multi-line effects took bare arrows

`useDefinition` → `lookUp`; `WordEditDialog` → `loadRow`. The inline
`import('@/types/db').Json` became a type import.

### WORKED · F-definitions-13 · lying-test-title · "does nothing at all on an empty submit"

The next `describe` in the same file pins that it says something. The test
still asserts that nothing is looked up, so it is titled that.

### WORKED · F-definitions-14 · archaeology · a stylesheet comment about 2026-08-26

`WordLookupDialog.module.css → .input` explained what it used to carry and when
it went. Kept the one sentence that explains the rule (placement only, because
the class lands on the FIELD).

### WORKED · F-definitions-15 · definable-props · the click-to-define bundle at fourteen surfaces, and the native `title`

Every surface that showed a definable word spread the same four things —
`className` with `definable`, `title`, `data-word`, `onClick` — and nine had
written a local helper for it under three names. Three drifts: `data-word` on
only two of the fourteen; waffle's title read `Click for definition` where the
other thirteen read `Click to define`; and two games guarded the click with
`stopPropagation` against a row click target that no longer exists.

**Decided (Joel, one question at a time):** keep the NATIVE title at all
fourteen, one text — the styled bubble opens fast enough that reading down a
hundred-word list would trail popups, where the native one waits for the word
you settle on. One hover feel everywhere, faked under wordle's squares. Every
game with a history viewer treats a word click the same way, and what the
majority does is right.

**Shape: a component over an app-level host**, not the props helper the
`todo.md` proposed. The blocker the todo named — `useDefinePopover` held its
state per surface, so a per-word component would need `define` threaded to each
one — is answered by moving the state instead: a one-slot module store
(`definitionStore`) and one `<DefinitionHost>` mounted in `App.tsx` beside
`ToastHost` / `TooltipHost` / `ConfirmationHost`. `<DefinableWord>` then needs
nothing wired: the fourteen surfaces each lost a hook call and a `{popover}`
render as well as the bundle, and `useDefinePopover` is deleted. This is the
`todo.md` Someday item, done here because `data-word` everywhere was its stated
precondition and this work does that anyway.

What the conversion turned up:

- **Scrabble had the same vestigial `stopPropagation` as stackdown**, with the
  same comment about "the row's turn viewer". The audit had found only
  stackdown's and said so; both rows lost their click target when the whole-row
  hit area became the shared `#N` handle. Both guards are gone, so a word click
  now exits the history viewer in all seven games that have one.
- **Waffle's `SolutionReveal` and wordiply's longest-word reveal stopped being
  `<button>`s.** `.definable`'s docstring had named them as the sanctioned
  escape hatch for a word needing keyboard reach — but both play surfaces
  declare an empty tab ring (`useTabRing([])`), so neither was ever reachable by
  Tab. Both stylesheets also hand-rolled `.definable`'s two declarations. Waffle's
  extra hover background wash went too: one feel everywhere.
- **Strands' local `.definable`** was the global plus a 2px underline offset.
  Deleted rather than promoted — the global is the feel.
- **Wordle's hover cue is an underline now**, drawn as a transparent
  `border-bottom` on the five-square group that colors on hover: the shared
  `text-decoration` paints beneath the squares' own backgrounds, so it never
  showed. The border is always present, so hovering still never reflows the log.
  `--chrome-definable-ring-color` had no other reader and is gone from both
  themes.
- **Wordle's answer line** was a `<strong>`, whose bold now comes from
  `.answerReveal` rather than the tag.
- **Lowercasing happens once.** Three surfaces lowercased the word by hand for
  the lookup; the component does it for both the lookup and `data-word`.

Two tests needed repair, both for the same real reason — the popover is the
root's now, not the surface's. `AnagramDialog.test.tsx` renders
`<DefinitionHost>` alongside the dialog (it is what hears Escape first), and
wordiply's `PlayArea.test.tsx` selected the reveal by `tagName === 'BUTTON'`
and now selects it by `data-word`. `DefinableWord.test.tsx` is new and pins the
contract the fourteen surfaces inherit.

### WORKED · F-definitions-16 · bespoke-sizes · both stylesheets carried hand-picked values the token vocabulary covers

Converted, all of them (Joel: all, with `.editLink` at `--font-size-3`). The
popover now reads a few percent smaller throughout — the ramp's answer rather
than a per-file one:

| rule | was | now |
|---|---|---|
| `.headword` | `1.05rem` | `--font-size-1` |
| `.definition` | `0.92rem` / `1.45` | `--font-size-2` / `--line-height-1` |
| `.status`, `.error` | `0.9rem` | `--font-size-2` |
| `.attribution`, `.meta` | `0.72rem` | `--font-size-3` |
| `.editLink` | `0.8rem` | `--font-size-3` — matching the attribution line above it |
| `.view` gap | `0.3rem` | `--spacer-5` |
| `WordEditDialog` `.numbers` / `.checks` gap | `0.5` / `0.35rem` | `--spacer-4` / `--spacer-5` |

Three rows were not conversions:

- **The three `margin-top`s** on `.attribution` / `.meta` / `.editLink` (`0.15`
  / `0.1` / `0.3rem`) are gone rather than tokenized. `.view` is a flex column
  with a gap, so each was a hand-tuned nudge on top of the one value that
  already spaces the stack. The edit link loses its extra separation with them
  and now sits at the same `--spacer-5` as everything else.
- **`letter-spacing: 0.01em`** on `.headword` and `.meta` — dropped; it is
  under a tenth of a pixel at those sizes.
- **`.saveButton:disabled, .deleteButton:disabled`** is deleted, and both
  classes with it: the controls are `<StandardButton>`s, and `base.css`'s
  global `button:disabled` already sets the opacity and the cursor. A disabled
  Save or Delete now fades to `--chrome-disabled-opacity` (0.75) rather than
  the local 0.6.

Six rows came off `guards/vocabularies`' pending lists — spacer, font-size,
line-height, opacity and letter-spacing — and both files are now clean in
every vocabulary.

### WORKED · F-definitions-17 · e2e-screenshot-leftover · `anagram-finder.e2e.ts` wrote a screenshot into a dead session's scratchpad

The spec saved `anagram-finder.png` into a scratchpad directory belonging to a
session that had ended, on every run, and nothing asserted on the file. Deleted
(Joel).

### The closing re-read, 2026-09-12

Every roster file read again in one sitting, plus the three `docs/common.md`
sections and the cited siblings (`Menu`'s mousedown close, `toastStore`,
`useDismissOnEscape`, `.definable`, `EditProfileModal`, the `muted` class, the
`data-board` convention) — all still true. Four findings, three of them the
area's own recorded fault classes recurring in prose the audit had not
re-checked, and one class the area had fixed at a single site. All worked in
the same sitting.

### WORKED · F-definitions-18 · props-marker · `/**` on props, on a `useState`, on nested helpers, and on the wrong declaration

The marker pass at the close. Props with `/**` in `DefinitionPopover` and
`DefinitionView`; a `/**` on `WordLookupDialog`'s `word` state and on
`WordEditDialog`'s inner `onDelete`; in the tests, on `pressDelete`,
`defineAResult`, and a `describe` call. All `//`. Two docstrings sat on the
wrong declaration: `parseDefinition.ts` opened with a 26-line file docstring
about the function while the exported function had none (moved onto it, at
twelve lines), and `WordEditDialog.test.tsx` had the routing explanation on
`const MESSAGE` (now a `//` on the `describe` it describes, pointing at
`formFieldFor`).

### WORKED · F-definitions-19 · archaeology · "used to" at eleven sites

F-definitions-14 fixed one stylesheet comment; the class ran through the
folder: `WordLookupDialog` (two), `WordEditDialog` (the "retires the eight
`disabled` props" sentence), `AnagramDialog`, `common-define` (the "old single
shape" sentence), and five test comments (`parseDefinition.test`,
`WordEditDialog.test` three, `AnagramDialog.test` two). Each keeps the reason
in the present tense and drops the history.

### WORKED · F-definitions-20 · rationale-in-docstring · the why-this-shape paragraphs, and one explanation written three times

`definitionStore` argued for one slot against per-surface state;
`DefinitionView` explained why one view keeps two hosts thin (and still said
"Scrabble cross-references"); `useDefinition` restated the derived-`loading`
reason a third time (the `Loaded` type and the comment at the derivation both
already say it) and listed its callers; `DefinitionHost` explained its `key`
in the docstring; `AnagramDialog`'s docstring was seventeen lines carrying the
pattern syntax and a word count, and `PATTERN_LENGTH`'s eleven arguing for
being one object. `WordEditDialog`'s jsonb-routing explanation was written on
`Values`, on `formFieldFor` and again in the test. Each docstring is now the
caller's contract; the shape reasoning is the `doc.md` Designs (the store/host
shape, one view under two hosts, the pattern syntax), and the routing lives on
`formFieldFor` alone with the other two pointing.

### WORKED · F-definitions-21 · bare-panel · "panel" alone at thirteen sites

`docs/ui.md` bans the word on its own. Three were the `fitContent` comments
F-definitions-2 had written ("on a panel that cannot be resized"); the rest
were `DefinitionPopover` (two), `WordLookupDialog`, `WordEditDialog.module.css`,
`AnagramDialog.test`, both e2e specs (four), and `docs/common.md`'s anagram
section. Now "floating panel" where the family is meant and "dialog" where the
instance is one.

### WORKED · F-definitions-22 · inert-row-rules · `WordLookupDialog.module.css` laid out a row the dialog never renders

Found by a question after the re-read, not by it. The stylesheet's two rules
said the box "shares a row with its button and has to take the slack"
(`flex: 1 1 auto; min-width: 0` on the field, `flex: 0 0 auto` on the button).
The dialog passes no class to its `<StandardForm>`, so the form is the
standard column and the box and the Define button are stacked; in a column
both rules are inert, and the file described a layout that does not exist.
The re-read had checked the comment's wording and not the layout behind it.
Both rules, the two `className`s and the stylesheet are deleted; the dialog
renders as before. Field spacing is `StandardForm`'s one gap, and a
full-width button is `fullWidth` on the button — nothing per-form was ever
needed here.

## Notes

- **Read and left:** the `todo.md` Someday item — `useDefinePopover` holds
  `{ word, rect }` per surface where `TooltipHost` shows delegation would do.
  Not opened by this area; F-definitions-15's `data-word` everywhere is its
  precondition, and the line says so.
- `DefinitionPopover`'s `POPOVER_WIDTH` (280) and the 220px below-threshold are
  the card's own geometry, bare numbers with names; nothing in the vocabulary
  covers them and nothing was done.
- `WordEditDialog`'s "Hint" field is the `words.hint` column — the
  guessing-game clue — and keeps the column's name.
- Both `doc.md` Designs written at the close: `definitions` carries the
  store/host shape, the root mount and the portal in one sentence, the
  pointer-only rule's home (a pointer to `.definable`, not a restatement), one
  view under two hosts, and the capture-first journal; `anagram-finder` carries
  the pattern syntax, the sibling relationship to the lookup dialog, and the
  unfiltered ruling. Both ledes rewritten. `docs/common.md` keeps the data,
  the edge function and the RPCs; neither Design restates it.

## Predicted test breaks

None from the prose pass: `word-edit.e2e.ts` clicks the Edit link on a
`defined` result, which F-definitions-7 still shows.

F-definitions-15 was predicted to break nothing and broke two unit tests, both
because the popover moved to the root: a test that renders one surface alone no
longer has a popover in its tree. The prediction had only asked whether a
surface LOSES `data-word` (none does) — the wrong question once the mount
moved. Repaired in the same pass; the e2e specs select words by `data-word`,
which every surface now carries.

## Closing

- [x] the whole area re-read in one sitting after the last group (2026-09-12;
      F-18 to F-21 above)
- [x] both folders' `doc.md` Design written; both rows off `DESIGNS_OWED`
      (the guard went red on exactly the two rows before they came off)
- [x] `todo.md` holds everything still owed — both are empty; the one Someday
      item was done by F-definitions-15 — and nothing durable is left here
- [ ] every file on the roster blessed, or its stamp says why not — **NOT
      blessed**: all twenty-five read `cs-audited-definitions`, and the stamp
      is Joel's to set
