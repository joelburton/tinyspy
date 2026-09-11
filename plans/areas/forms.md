# Area: forms

The folders it reads: `forms` · `fields`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN 2026-09-11.** Roster agreed (Joel: "do the audit") and stamped
`cs-audited-forms`. The audit read is done; every finding below is OPEN and
waits on Joel's word one at a time.

## The roster

**`src/common/forms/`** — the frame

| file | what it is |
|---|---|
| `StandardForm.tsx` | the form that owns its values and hands them to a render-prop |
| `StandardForm.module.css` | one gap between fields |
| `StandardForm.test.tsx` | the four silent failures only the frame can have |
| `formState.ts` | `FormErrors` and the form-wide key |
| `doc.md` | lede only; Design owed |
| `todo.md` | four unbuilt patterns and the `FormErrors` dependency question |

**`src/common/fields/`** — every field

| file | what it is |
|---|---|
| `Field.tsx` · `field.module.css` · `Field.test.tsx` | the shape every field has: caption, help, control, entry help, error |
| `fieldProps.ts` | `AllFieldProps`, what every field takes |
| `fieldContract.tsx` | the assertions every field's spec runs |
| `errorUnder.ts` · `errorUnder.test.tsx` | the test lookups that prove a message reached its field |
| `groupTiles.ts` | the dash-inserter a board field and a summary share |
| `TextField` · `NumberField` · `DateField` · `SelectField` · `CheckboxField` · `CheckboxListField` · `RadioRow` · `ReadOnlyField` · `ColorField` | the general fields — each `.tsx` + `.test.tsx`, each but `ColorField` with a `.module.css` |
| `PlayersField` · `ManualBoardField` · `DictBandField` | the three only a setup form renders; `DictBandField` has no module |
| `doc.md` | lede only; Design owed |
| `todo.md` | empty |

Left off, agreed at the opening: the e2e specs that drive forms from a page,
and every guard (`fieldTests` reads this directory; guards are not audited).

**Callers, for evidence (read, not stamped).** `StandardForm`: `LoginScreen`,
`ClaimHandleScreen`, `CreateClubModal`, `EditClubModal`, `EditProfileModal`,
`SetupGameModal`, `AnagramDialog`, `WordLookupDialog`, `WordEditDialog`.
`SelectField`: `SetupCoopStyleSection`, `DictBandField`, and eight games' setup
forms. `ManualBoardField`: five games' setup forms. `NumberField`: bananagrams'
setup form and `WordEditDialog`. `DateField`: `SetupNextPuzzleSection` alone.
`CheckboxListField`: `EditClubModal` alone. `PlayersField`: `PlayersSection`
alone. `ColorField`: `ClaimHandleScreen`, `EditProfileModal`. `ReadOnlyField`:
`EditProfileModal`, crosswords' `PuzzleSourceField`. No radio is written
outside `RadioRow`.

**No doc owns the field rules.** docs/ui.md → Real forms, and everything else
says who owns the keyboard in a form; nothing in `docs/` says what a field is
(caption, help, entry help, error) or which control a setting takes. That
vocabulary lives only in the docstrings today, and the folder's `doc.md`
Design is where it goes at the close.

## Findings

### Code and prose

## F-forms-1 · `docstring-marker-pass` · Every prop and member in both folders is a `/**` field

`StandardForm.tsx`'s three props, `Field.tsx`'s eight, `fieldProps.ts`'s
seven members of `AllFieldProps`, `fieldContract.tsx`'s `ContractProps` and
`Options` members, `TextField`'s `multiline`, `NumberField`'s `chars`,
`SelectField`'s and `CheckboxField`'s `children`, `CheckboxListOption`'s
members, `RadioRow`'s `prefix`, `PlayersField`'s `members` / `selfId` /
`onChange`. A note on one member takes `//`; the `/**` stays on the types, the
components and the exported functions. Same pass `members` and `lists` made.

## F-forms-2 · `archaeology-in-docstrings` · The docstrings tell how the field family came to be

Nearly every file spends its opening on the duplication it replaced rather
than on when to reach for it. The sites, and what each keeps:

- `StandardForm.tsx`: "every one of them used to be hand-rolled per component
  — `WordEditDialog` keeps a second copy of its fields purely to diff
  against". Archaeology, and the claim is stale: `WordEditDialog` holds the
  loaded row for `initialValues` and diffs nothing. The reason worth keeping is
  the sentence before it (clearing, resetting and "has anything changed" are
  questions about the form).
- `TextField.tsx`: the first two paragraphs ("Every form that needed one
  invented `.field` again… three of them byte-identical… the last one with no
  component"). The docstring's live content is the third paragraph.
- `TextField.module.css`: "These three came from CreateClubPage's members
  box". The reason (horizontal resize breaks out of the card) stands alone.
- `field.module.css`: the header's "four files had declared it and disagreed…
  I wrote it three times AGAIN in the first pass… on 2026-08-26", `.label`'s
  "Callers disagreed — 600 weight at inherited size…", `.entryHelp`'s "The
  anagram finder is what made the distinction visible". Each rule's reason is
  already stated beside the history.
- `SelectField.module.css`: "This file kept private copies of both until
  2026-08-26."
- `fieldProps.ts`: the whole first paragraph ("Before this type: `label` was
  `string` in three components…"). The second paragraph — never redeclare a
  member, because an intersection narrows silently — is the docstring.
- `fieldContract.tsx`: "Added after `PuzzleSourceField` was written with ad-hoc
  props and dropped exactly this pair" inside a test body.
- `Field.tsx`: "Two of them used to hand-place `data-field` on a control, which
  meant the other ten had nothing"; and the docstring closes on a quoted
  sentence in italics ("We want consistency between fields…") after the rule it
  quotes has already been stated.
- `NumberField.tsx`: "That is exactly how five games ended up hand-rolling the
  manual-board input, and how two hand-rolled the checkbox row."
- `CheckboxListField.tsx` and its module: "EditClubModal grew a private
  `.gameRow`… It lives here now."
- `RadioRow.tsx`: "the block every setup form was re-authoring".
- `PlayersField.tsx`: "It spent a day as the one field outside the section
  vocabulary".
- `ManualBoardField.module.css`: "Five games each wrote these four
  declarations under a different class name — `.letterInput`, `.baseInput`…";
  "boggle met this first and letterboxed copied its rule wholesale".

Not on the list: `NumberField`'s "MEASURED, after 2.6rem shipped and clipped a
single digit" — that is the evidence for a constant, on the line it defends.

## F-forms-3 · `finding-ids-in-a-module` · `ManualBoardField.module.css` cites `(F31)` and `(F33)`

Two finding IDs from a deleted audit in a durable file, and `groupTiles.ts`
says "the exact failure this area keeps finding" — the sprint itself, in a
docstring. The no-cite rule. In all three the sentence already carries the
reason; the cite goes.

## F-forms-4 · `stale-names-and-paths` · Names that no longer exist, and rosters that have moved on

- `CreateClubPage` in `Field.tsx`, `TextField.tsx` and `TextField.module.css`.
  It is `CreateClubModal`.
- `DictBandField.tsx`: "See `lib/game/difficulty.ts`". It is
  `setup-form/difficulty.ts`, which the file imports two lines up.
- `field.module.css` header: "imported by `<TextField>`, `<NumberField>`,
  `<ReadOnlyField>` and `<ColorField>`". Only `Field.tsx` imports it.
- `DateField.tsx`: "crosswords has two more of these". One
  (`NytPickerBlockingModal`).
- `NumberField.tsx`: "One caller today (bananagrams' bunch size)".
  `WordEditDialog` is the second.
- `SelectField.tsx`: "the other setup selects (boggle dice/ladder, wordle
  guesses, psychicnum word-count) compose it" — a roster of three where eight
  games do.
- `CheckboxField.module.css`, `RadioRow.module.css`, `SelectField.module.css`
  each cite `base.css:777`. A line number in a comment is true today and rots
  on the next edit above it; say the rule's name (base.css's `input, textarea`
  rule) and let the reader grep.

## F-forms-5 · `claims-the-code-contradicts` · Four sentences the file beside them disproves

- `CheckboxField.tsx`: "With no `label` and no `help` — which is every caller
  today — the wrapper adds nothing visible." wordwheel's and bananagrams' setup
  forms both pass `help`.
- `CheckboxField.test.tsx` header: "the one field not built on `<Field>`". It
  renders `<Field>` around its row; the component's own docstring says so.
- `Field.test.tsx` header: "The other two are `<CheckboxField>` and the group
  fields, and nothing tests them." This file tests them.
- `PlayersField.tsx`: "every other field a setup form has is one of these —
  `<SetupTimerSection>`, `<DictBandField>`, `<SetupCoopStyleSection>`". Two of
  the three are sections.

## F-forms-6 · `counts` · Tallies that were wrong when written or will be

- `StandardForm.test.tsx`: "the eight forms that use it" — nine.
- `StandardForm.tsx`: "the way the sixteen setup bodies are" — the game count.
- `Field.tsx`: "4 of the app's 43 carry a `<strong>` and 6 more an interpolated
  value"; "no caption at TODAY'S five call sites".
- `TextField.tsx`: "one edit rather than eleven".
- `CheckboxField.tsx`: "the six lines of markup around the box".
- `RadioRow.tsx`: "Three of these do it".
- `fieldContract.tsx`: "a table of fourteen rows in one file".
- `errorUnder.test.tsx`: "Six form tests use it, and seven of those assertions
  are NEGATIVE".
- `ManualBoardField.tsx` / `.module.css`: "Five games want it", "four of the
  five genuinely are boards", "only four of the five games take it".
- `DictBandField.tsx` and its test: "all six bands" — the data's shape rather
  than a caller census; listed so the decision is recorded.

Say the condition in each; where the number IS the point (the five games are
the reason the field exists), name the games or say "the board games".

## F-forms-7 · `vocabulary-conversion` · The raw values, and which are decisions

Per §5, silently where a value equals a step; the plan's §7 already rules
that every `0.4rem` becomes `--spacer-4` at its area's pass.

Silent:
- `field.module.css` `gap: 0.4rem` → `--spacer-4` (§7's ruling).
- `RadioRow.module.css` `.radio` `gap: 0.4rem` → `--spacer-4`; `.radioRow`
  `gap: 1rem` → `--spacer-2`.
- `CheckboxField.module.css` `gap: 0.5rem`, `DateField.module.css`
  `margin-top: 0.5rem`, `PlayersField.module.css` `gap: 0.5rem` → `--spacer-4`.
- `SelectField.module.css` `border: 1px` → `--border-width-line`.
- `PlayersField.module.css` `--dot-size: 0.7rem` — a dot size, `Dot`'s own
  scale; check what `members` settled before touching it.

**WORKED 2026-09-11 (Joel: "do the silent ones").** All six literal
conversions above are made and their guard rows removed. The dot size is
LEFT: `--dot-size` is set per site across the app in a mix of `em` and `rem`
(the home page, the menu, the strips, the pause overlay, the setup form's
players section, and this), and `core-css/todo.md` already records that mix
as one cleanup to make once, not a value to move here.

Decisions, for Joel:
- `field.module.css` `font-size: 0.9rem` on `.label`, `.help`, `.entryHelp`
  and `.error` — four rules, one value, against `--font-size-2` (0.85rem).
  One decision, because they were unified on purpose.
  **DECIDED 2026-09-11 (Joel: "1" — move to the step).** All four read
  `--font-size-2`; the guard's `0.9rem` row for the file is gone.
- `ReadOnlyField.module.css` `font-size: 1.05rem` — between `--font-size-1`
  and nothing; the comment says "bigger than the caption", which `1rem`
  already is against a 0.9rem caption.
  **DONE with the same decision:** `--font-size-1`, which is bigger than the
  0.85rem caption as the comment asks; the guard's `1.05rem` row is gone.
- `SelectField.module.css` `.select:disabled { opacity: 0.55; cursor:
  not-allowed }` — against `--chrome-disabled-opacity` (0.75). **The
  finding's other half was WRONG as written:** it said the app's disabled
  cursor is `default`, citing `SelectionList.disabled`. base.css's
  `button:disabled` rule says `cursor: not-allowed`, and every disabled
  control in the app follows it (`ShuffleButton`, `Menu`, `SetupTimerSection`,
  `WordEditDialog`, the on-screen keyboard); `default` is what a disabled
  non-button wears — a list row, a board tile, a wheel letter. A select is a
  control, so `not-allowed` is right and stays.
  **DECIDED 2026-09-11 (Joel: "use --chrome-disabled-opacity").** The
  opacity reads the token; a disabled select now fades exactly as a disabled
  button does. The guard's `0.55` row is gone.
- `TextField.module.css` `line-height: 1.4` against `--line-height-1` (1.5) /
  `-2` (1.25); `min-height: 3.5rem` bespoke.
  **DECIDED 2026-09-11 (Joel: "1.5").** `--line-height-1`; the guard's `1.4`
  row is gone.
- `field.module.css` `.label` and `CheckboxListField.module.css` `.label`
  `font-weight: 600` — there is no weight token; is one wanted?
  **DECIDED 2026-09-11 (Joel: "keep bespoke").** No weight token; the two
  `600`s stay as written.
- `PlayersField.module.css` `.self { font-size: 0.85em }` — the one `em`
  size in the area.
  **DECIDED 2026-09-11 (Joel: "--font-size-2").** Converted.
- `SelectField.module.css` `background-position: right 0.85rem center` and the
  chevron's own geometry — bespoke-by-intent, the control's furniture.
- `ManualBoardField.module.css` `letter-spacing: 0.2em` — bespoke-by-intent,
  and `ManualBoardField.tsx` repeats the `0.2em` in its width arithmetic, so
  the two have to agree by hand.
- Paddings stay parked (`CheckboxListField` `.list` / `.row`, `PlayersField`
  `.row`, `SelectField`'s — which matches base.css's control by design).

## F-forms-8 · `chevron-hex-in-data-uri` · `SelectField`'s chevron is a gray that cannot follow the theme

`SelectField.module.css` draws its chevron as an inline SVG data URI with
`stroke='%23555555'`, and the comment says "≈ `--field-muted-ink-color`". A
color inside `url()` is invisible to the token guard (it strips `url()`), so
this is the one painted color in the area that a theme cannot move — the
midnight theme would keep a mid-gray arrow on a dark field. Options: leave it
and say so as the theme seam; draw the arrow with `mask-image` +
`background-color: var(--field-muted-ink-color)`; or an inline `<svg>` with
`currentColor`, the way `FilterSelect`'s `Caret` does. The same rule's
`.select:focus` restates base.css's `input:focus` ring for the element base.css
leaves out, which is right and stays.

## F-forms-9 · `todo-soon-is-built` · Three of `forms/todo.md`'s four unbuilt patterns exist

Read first, per the process, and found mostly done:

- **Field** — `<Field>` is the component + module the item asks for, and the
  private `.field` / `.label` copies it names (`WordEditDialog`,
  `EditProfileModal`) are gone from those modules.
- **Choice row / choice group** — `<RadioRow>` and `<CheckboxField>`; no
  `.radio` / `.radioRow` / `.checkRow` copy survives in `setup-form/`'s CSS
  (one comment mentions the old names).
- **Text input** — base.css's `input, textarea` rule with the `--touch`
  16px floor IS "an element rule"; `WordLookupDialog.input` is layout only
  and `AnagramDialog` has no `.input` rule.
- **Section** — `<SetupSection>` exists. What the item still asks is whether
  the bordered group is one thing across `SetupSection`, `CheckboxListField`'s
  `.list` (the games group it names) and the info column's box.

Rewrite the file to what is still owed — the Section question, at most — and
the Maybe item (below).

## F-forms-10 · `form-errors-home` · Where `FormErrors` lives is a decision this area should make

`forms/todo.md` (Maybe): `setup-form/setupForm.ts` types
`SetupBodyProps.errors` as this folder's `FormErrors`, so the setup-form
contract depends on the form layer for one shape. The three-layer argument in
`formState.ts` (the SQL `column`, the RPC parameter and the field `name` are
one string) is the reason the shape is the form's; a setup body is a form
body. Either say that in `formState.ts` and delete the item, or move the type.
Joel's call; the item should not outlive the area either way.

## F-forms-11 · `small-leftovers` · Lines, blanks and a missing header

- `PlayersField.tsx` docstring, lines 29–31: a sentence broken across a line
  with a stray leading comma ("at all\n, so the border…").
- `ManualBoardField.tsx` line 35 and `groupTiles.ts` line 6 run far past the
  wrap.
- A doubled blank line in `TextField.test.tsx`, `PlayersField.test.tsx`,
  `ManualBoardField.test.tsx` and `DictBandField.test.tsx`.
- `DictBandField.test.tsx` is the one spec in the folder with no header
  docstring.

### Prose elsewhere, turned up by this area's reading

## F-forms-12 · `ui-md-real-forms-crosswords-tab` · docs/ui.md names a crosswords setup "tab" that is not one

docs/ui.md → Real forms lists "the setup dialog (including crosswords' date /
series / upload tab)". crosswords' puzzle source is `PuzzleSourceField` and
three picker modals; whether any of it is a tab wants checking against that
game's setup form when the finding is worked, and the sentence rewritten to
what is there.

### Ruled already, recorded so the re-read does not re-raise them

- **`SelectField` is a native `<select>` and takes focus** — docs/ui.md → Real
  forms: a real form's focused element owns the keyboard. Not `FilterSelect`'s
  rule; the two docstrings already say which is which.
- **`role`/`aria-invalid`/`aria-*`** stay: existing ARIA is kept, and
  `aria-invalid` is the invalid ring's state.
- **Monospace on the board fields** is `setup-form/todo.md`'s and the plan's
  §7: decided once, applied per game, not swept.

## Notes

- **`Field` makes `name` optional while `AllFieldProps` requires it.** Right
  as it is: `Field` is the wrapper and a caller outside the family may draw a
  caption over anything; every field forwards its required `name`.
- **`ManualBoardField.tsx` and its module share `0.2em`** (the tracking, once
  in CSS and once in the width calc). Recorded under F-forms-7; if the
  tracking ever becomes a token, both read it.
- **`fieldTests.test.ts` reads every `*Field.tsx` under `src/`**, so
  crosswords' `PuzzleSourceField` is in the family's contract without being in
  this folder. Fine; it is that game's file.
- **`StandardForm` forwards `ref` through `ComponentPropsWithRef<'form'>`**
  (React 19, ref as a prop), which is how `LoginScreen` hangs its tab ring on
  the form. No finding.

## Predicted test breaks

*(written when the area starts changing things)*

- F-forms-7 (vocabulary-conversion): the vocabularies guard's `pending` rows
  for `field.module.css` (`0.4rem`), `RadioRow.module.css` (`1rem`, `0.4rem`),
  `CheckboxField.module.css`, `DateField.module.css`, `PlayersField.module.css`
  (`0.5rem`) and `SelectField.module.css` (`1px`) shrink or go with the silent
  conversions.
- F-forms-1 (docstring-marker-pass), F-forms-2, -3, -4, -5, -6: comments only;
  nothing runs differently.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] both folders' `doc.md` Design written; their rows off `DESIGNS_OWED`
- [ ] each `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
