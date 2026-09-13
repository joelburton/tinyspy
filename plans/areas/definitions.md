# Area: definitions

The folders it reads: `definitions` · `anagram-finder`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-12; the prose pass, the no-decision fixes and
F-definitions-15 are in the tree. F-definitions-16 and -17 are still to
present.**

## The roster

Agreed 2026-09-12 at twenty-three files, all `cs-met-definitions` →
`cs-audited-definitions`. Twenty-six now: F-definitions-15 wrote three and
deleted one.

- `src/common/definitions/DefinitionPopover.tsx` + `.module.css`
- `src/common/definitions/DefinitionView.tsx` + `.module.css`
- `src/common/definitions/WordLookupDialog.tsx` + `.module.css` + `.test.tsx`
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
`doc.md`s are a one-line lede with no Design; both folders are on
`DESIGNS_OWED`.

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

### F-definitions-16 · bespoke-sizes · both stylesheets carry hand-picked values the token vocabulary covers

On `guards/vocabularies`' allowlists as pending:

| file | today | token |
|---|---|---|
| `DefinitionView.module.css` `.headword` | `1.05rem` | `--font-size-1` (1rem) |
| `.definition` | `0.92rem` / line-height `1.45` | `--font-size-2` (0.85) / `--line-height-1` (1.5) |
| `.status`, `.error` | `0.9rem` | `--font-size-2` |
| `.attribution`, `.meta` | `0.72rem` | `--font-size-3` (0.75) |
| `.editLink` | `0.8rem` | `--font-size-2` or `-3` |
| `.view` gap · `.attribution` / `.meta` / `.editLink` margins | `0.3` · `0.15` · `0.1` · `0.3rem` | `--spacer-5` (0.25) / none |
| `.headword`, `.meta` letter-spacing | `0.01em` | drop |
| `WordEditDialog.module.css` `.numbers` / `.checks` gap | `0.5` / `0.35rem` | `--spacer-4` / `--spacer-5` |
| `.saveButton:disabled, .deleteButton:disabled` opacity | `0.6` | `--chrome-disabled-opacity` (0.75) — the global `button:disabled` already sets it and the cursor, so the rule GOES and both classes with it |

Every row is a visible change of a few percent. One decision: convert all, or
name the ones to keep bespoke.

### F-definitions-17 · e2e-screenshot-leftover · `anagram-finder.e2e.ts` writes a screenshot into a dead session's scratchpad

Lines 48–50 save `anagram-finder.png` to
`/private/tmp/claude-501/…/b3c9f78e-…/scratchpad/` on every run — a
debugging leftover with a path no other session has. Proposed: delete the
call (a removal, so it is asked, not done).

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
- Both `doc.md`s are a lede only; the Design is written at the close
  (the portal reason, the one-view-two-hosts split, the capture-first journal,
  the pointer-only rule's home).

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

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
