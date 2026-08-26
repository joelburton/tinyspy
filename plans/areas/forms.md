# Area: forms

The third area of the CSS sprint's step 7. The process is
[css-system-2.md](../css-system-2.md) §21; the plan holds the order, this file
holds everything else.

**Opened 2026-08-25**, split out of `floating-panels` on 2026-08-24. **Scope,
set by Joel when the roster was agreed:**

> "this area is about fixing the machinery of forms (field types,
> forms-in-general) and the same things for buttons (stuff common, not
> bespoke-buttons in other areas)."

So the sixteen game `SetupForm`s, the seven Cancel sites, and every wrapper
button are **consumers**. They were read as EVIDENCE and **their stamps did not
move** (§21 — a file opened as evidence is not "found").

**Every heading says its status**; a heading with **no status prefix means
OPEN**.

**Numbering.** Three findings arrived from `floating-panels` carrying their
numbers (**F8**, **F9**, **F13**) — they are never renumbered and never reused.
This area's own findings therefore start at **F30**, so no number in this file is
ambiguous and an inherited finding is recognizable on sight (≤ F13 came from
elsewhere; ≥ F30 was raised here).

**Twenty findings. FOURTEEN RESOLVED** — F8, F9, F13, F30, F31, F33, F34, F35,
F38, F39, F40, F42, F43, F47 — **three CLOSED and moved out** (F32 → the FreeBee
pair, F37 → crosswords, F44 → crosswords + floating-panels) — **three open:**
F36, F41, and the two parked, F45 and F46.

F43–F47 came from the work rather than the audit, which is expected: §21 says a
finding is not required to have come from the audit and takes the next free
number.

## The roster — 20 files

Agreed 2026-08-25 before anything was read. All paths under `src/common/`.

**The shared field vocabulary (13)**

```
components/setup/SetupCoopStyleSection.tsx      components/setup/SetupCoopStyleSection.module.css
components/setup/SetupCoopStyleSection.test.tsx components/fields/DictBandField.tsx
components/fields/DictBandField.test.tsx components/setup/SetupNextPuzzleSection.tsx
components/setup/SetupNextPuzzleSection.module.css components/fields/RadioRow.tsx
components/fields/SelectField.tsx         components/fields/SelectField.module.css
components/setup/SetupTimerSection.tsx          components/setup/SetupTimerSection.module.css
components/fields/setupForm.module.css
```

**The setup scaffolding (2)**

```
components/setup/SetupSection.tsx         components/setup/SetupSection.module.css
```

**The button machinery (5)**

```
components/buttons/ActionButton.tsx       components/buttons/ActionButton.module.css
components/buttons/ActionButton.test.tsx  patterns/button.css
patterns/segmented.css
```

The first four are gone as of 2026-08-25 — see "What shipped" below. They are
listed as they were when the roster was agreed, because the roster is a record of
what was read, not of what currently exists.

### What was excluded, and why

| excluded | goes to |
|---|---|
| `setup/SetupGameModal.tsx` + `.module.css` | **`club-page`** (Joel, 2026-08-25) — a container that happens to hold a form; the machinery is in the fields inside it. Also unblocks homepage F36 (`createclub-modal`) |
| `setup/SetupDisclosure.tsx` | **`shared-game-chrome`** — it is not a form. It is the info-column "Setup options" recap shown WHILE PLAYING, and it imports `game/PlayArea.module.css`. Only its name links it to setup; its own docstring distinguishes it from `SetupSection` |
| the 16 game `SetupForm`s | consumers; each game's own area. F13 and F31 are decided once, here |
| the ~24 wrapper buttons (`SubmitButton`, `PassButton`, `HintButton`, …) | each a two-line `ActionButton` wrapper supplying a glyph + tone. Whatever `ActionButton` decides propagates for free |
| `PauseButton`, `ShuffleButton`, `SubmitWithScore` (+ modules) | the three that carry their own CSS and don't route through `ActionButton`; game chrome |
| the seven hand-written Cancels' hosts | each their own area's — but **F9 sets the rule for all seven** |
| `EditProfileModal`, `EditClubModal`, `ColorChoiceList` | instances; `account` / `club-page` |
| `ClaimHandleScreen`, `LoginScreen` | `simple-page` |

### Dependencies — listed, not audited (§21)

Stamped `cs-found` by this area's reading; whether each becomes an area is
Joel's call.

```
hooks/game/useGameTimer.ts   (formatTimerSeconds — SetupTimerSection)
lib/game/timerLabel.ts       (the disclosure summary — SetupTimerSection)
lib/game/difficulty.ts       (DIFFICULTY_LABELS + samples — DictBandField)
components/icons.ts          (the glyph registry — the button machinery)
```

Already `cs-found` before this area: `lib/util/cls.ts`, `base.css`,
`themes/daylight.css`, `patterns/focus-ring.css`.

---

# The audit — 2026-08-25

All 20 roster files read. Joel's three going-in guesses, checked against what is
actually there:

1. *"forms look decent; I don't expect many changes to how they look or feel"* —
   **agreed, and the audit is deliberately shaped around it.** Nothing below
   proposes a new look. F31, F32, F34 and F36 are all "the same appearance,
   declared once instead of two-to-four times", which is invisible when it lands.
2. *"we're underutilizing React components where those would bring together more
   than a set of raw CSS classes"* — **confirmed, and the sharpest case is inside
   the area itself**: `<SetupTimerSection>` hand-writes the radio group that
   `<RadioRow>` exists to render (F30). The four letter-inputs (F31) and the
   fixed-height puzzle line (F37) are the same shape one layer out.
3. *"a lot of bespoke values and differences-without-distinction"* — **confirmed,
   and it is already written down**: `src/guards/vocabularies.test.ts` carries a
   per-file allowlist of unconverted literals, and five of the area's files are
   named in it. That list IS the debt, enumerated.

## RESOLVED · F8 · `confirm-buttons-are-raw` · The confirmation's buttons bypass the tone system

From `floating-panels`. `ConfirmationBlockingModal`'s pair are
`<button className="button primary">` / `"button secondary"`, not
`<ActionButton>`. Joel, 2026-08-24: *"leave them as raw, and we'll decide later
on whether they become something else."* **Folded into F9** — same decision.

## RESOLVED · F9 · `action-button-text-only` · Are a form's buttons really different from action buttons?

From `floating-panels`, inherited there from `homepage` as F44. **This is the
reason the area exists.**

**An action button MAY have a label, an icon, or both** (Joel, 2026-08-25 —
stated repeatedly before today). Nothing in `docs/ui.md` says otherwise: the
taxonomy defines `action` as "a purpose button (Submit, Hint, Reveal, End game,
Peel)" with no mention of a glyph, and the roster notes `BackToClubButton`
"carries a text label".

**The implementation is what forbids it, in one line.** `ActionButton.tsx:57`
declares `icon` non-optional and `:130` renders it unconditionally, so there is
an `iconOnly` flag and no way to say the opposite. **This is the DEFECT F9
names, not a property of action buttons** — a distinction that got lost as the
finding was restated from `homepage` F44 → `floating-panels` F9 → here, each hop
keeping the sentence and shedding the framing.

Because a Cancel cannot be expressed, it is hand-written. **Seven sites,
measured:**

```
club/CreateClubPage.tsx:243              account/EditProfileModal.tsx:92
club/EditClubModal.tsx:129               auth/ClaimHandleScreen.tsx:199
setup/SetupGameModal.tsx:300             scrabble/ScrabbleBlankPickerBlockingModal.tsx:37
floating-panels/ConfirmationBlockingModal.tsx (F8)
```

Their commit partners are eight more `className="button primary"` sites. See
**F40** — the tone vocabulary already reserved a slot for exactly this button.

## RESOLVED · F13 · `setup-form-monospace` · Five setup forms set `font-family: monospace`

**Resolved with F31 (`letter-input-unnamed`), exactly as predicted.** The
finding described a symptom: four of the five were one unnamed field type and
the fifth was a deliberate exception. `<ManualBoardField>` owns the treatment
now, and boggle's `uppercase={false}` is the exception, stated as a prop.


From `floating-panels`. **Superseded in substance by F31**: the finding as
written ("five forms set monospace") describes a symptom. The five are not five
independent choices — four of them are one unnamed field type, and the fifth is
a deliberate exception. Resolve F31 and F13 goes with it.

---

# What shipped — `<StandardButton>`, 2026-08-25

**F9's answer is "one component", and the distinction it removes was never
real.** Joel: *"should we decide that ActionButton just means 'normal button'?
… is there a reason, semantically or practically, to consider 'action button'
separate from 'normal button'?"* There wasn't. `action` was already one of the
fourteen KINDS in docs/ui.md, so the component had been named after its first
customer while implementing the machinery for all of them — the same collision
the `action` → `normal` tone rename removed in August, still standing one layer
up. The 27 sites that hand-wrote `className="button secondary"` were not
choosing a different button; they were reaching for this one and finding a
required `icon` prop in the way.

**The name is `StandardButton`** (Joel, 2026-08-25). Not `Button` — this
codebase has 89 raw `<button>` elements, and a component differing from the
element by one capital is a real misreading hazard. Not "normal button" either:
`normal` is a tone.

## The six axes

`tone` · `weight` · `icon` · `label` · `tooltip` · `small`.

**`undefined` = "use the default"; `null` = "don't."** So `<RestartButton />`
and `<RestartButton icon={undefined} />` are the same button, and
`<RestartButton icon={null} />` is that button with no glyph. The two only
differ where a default exists, which is inside a purpose button. `small` is a
boolean and needs no `null`: `false` already plays that part — and it is NOT
`size="normal"`, because `normal` is a tone and 95% of buttons would have to
type a word that says nothing.

**A button has three text-ish roles, and they are three props now.** This was
the gap that stopped the build mid-way: `label={null}` had to mean "draw
nothing" without the button ceasing to BE anything, since 146 call sites draw no
text and 457 test selectors (170 unit, 287 e2e) find buttons by name.

| prop | role |
|---|---|
| `name` | what the button IS — identity. The one thing a purpose button always supplies |
| `label` | what is DRAWN. Defaults to `name`; `null` draws nothing (this replaces `iconOnly`) |
| `tooltip` | the bubble. Defaults to the name **only when the name isn't drawn** — a bubble reading "Cancel" over a button reading "Cancel" is noise |

`name` shadows the DOM `name` attribute deliberately; measured first — no button
in the app uses native form submission with a named button.

**Purpose buttons supply defaults as DEFAULT PARAMETERS, not by spreading over
them**, which is what makes `undefined` behave: a default parameter treats an
explicitly-passed `undefined` like an omitted prop, and a JSX spread does not.
Joel's requirement was that a subclass stay overridable on every axis
individually — and it wasn't: `PurposeButtonProps` declared only `label`,
`iconOnly` and `tooltip`, so `<RestartButton tone="caution" />` was a typecheck
error. Three of the four axes were unreachable.

## `small` is a prop, and it fixes a live bug

The old `.button-small` and `.icon-only` were two global classes composed by
hand, and `.button-small` was declared 17 lines later at equal specificity — so
**its padding beat `.icon-only`'s `padding: 0` while the fixed box stayed.**
Measured on the club page's delete button, before and after:

| | box | glyph | padding |
|---|---|---|---|
| before | 25.6 × 25.6 | **4.4 × 18** | `4px 9.6px` |
| after | 25.6 × 25.6 | 15.6 × 15.6 | `0` |

The trash can was not scaled down, it was **crushed to a 4px sliver**. Same
footprint now, a glyph that fills it. `ClubGameDeleteButton` loses its
`'button-small'` string, its `--iconButton-size: 1.6rem` override (which is
exactly what `small` supplies) and a `padding: revert-layer` that existed only to
undo the fight.

**Most of the shrink is padding** (Joel's instruction), and the glyph follows the
text: `iconSize` in pixels became `1.15em` in CSS, with per-glyph tuning as an
`iconScale` MULTIPLIER. A multiplier stays right when the button changes size;
`iconSize={22}` did not, and would have recreated the crushed glyph somewhere
new.

## The type is the button's own

`base.css` gives the bare `<button>` `font: inherit`, which is right for the
accidental kinds — a `.link-button` or a list row IS the surrounding prose. A
standard button is not, so it takes back weight and line-height (Joel: *"a button
happening in a paragraph of bold text shouldn't get bold"*). It was incoherent
as it stood: `.button-small` declared `font-weight: 500` while its full-size
sibling inherited whatever was around it.

Size still inherits, written as `font-size: 1em` — an info-column button is
0.95rem because the column is, and `.small`'s `0.85em` then reads as the same
kind of statement rather than an exception.

**`line-height: normal`, not a ramp step, and measured before choosing.** `1`
would shave 2px off every button in the app (32.78px → 30.78px). That is an
unrequested change, and it broke a marginal e2e assertion on first try.

## The pattern retired rather than moved

`patterns/button.css` is **deleted**, not renamed. §7's table puts "a pattern
with structure or behavior" in *a React component + its module*, and the rule
under it says a shared stylesheet with many consumers and no component is a
component waiting to be written. `ActionButton.module.css` folded in too: one
component, one stylesheet. The five modifier classes (`.primary`/`.secondary`,
`.icon-button`, `.icon-only`, `.button-small`) stopped being public, which is
what kills the declaration-order fragility — every selector now carries
`.standardButton` and wins on weight.

`.button` is FREED, not reused. If a looser "reads as a button in a general way"
class is ever wanted, the name is sitting there unused (Joel, 2026-08-25).

## What this resolved, and what it didn't

- **RESOLVED F9** (`action-button-text-only`) and **F8**
  (`confirm-buttons-are-raw`) — `<CancelButton>` exists; all seven hand-written
  Cancels and their eight commit partners are `<StandardButton>`s.
- **RESOLVED F40** (`tone-quiet-claims-cancel`) — the `quiet` tone finally has
  the caller its own documentation described.
- **RESOLVED F39** (`actionbutton-says-action`) for the base; the wrappers'
  docstrings still carry stale tone names (`RestartButton` says "info",
  `RevealButton` says "error"; neither is a tone). **Still open.**
- **Untouched: F13, F30–F38, F41, F42.** This was the button half of the area.

## Rulings taken along the way (Joel, 2026-08-25)

- `Toast`'s action, `WordEditDialog`'s Save + Delete, `WordLookupDialog`'s and
  `AnagramDialog`'s submits are all standard buttons. The Delete's hand-set
  `--button-slot-secondary-*` pair is now `tone="destructive"`.
- **The celebration is not special.** Its roomier padding, its heavier primary
  label and its private copy of the focus ring are all gone. *"If we need chunky
  buttons, we'd make a chunky prop, not put it on this button."* Visible
  consequence, accepted: that dialog's buttons are smaller than they were.
- **A link is not a button.** HomePage's "+ New club" `<Link>` is ignored as a
  design question — it becomes a real button at homepage F36
  (`createclub-modal`), when creating a club becomes a modal. Until then it
  borrows the module directly, written in the file as the stopgap it is.
- **✕ dismiss glyphs are not standard buttons** and are out of scope: *"we don't
  put borders on them and we may not decide that they have the same
  hover/is-clicked look."*
- **`SubmitWithScore` is scrabble's to decide** — filed in
  `docs/games/scrabble.md` → Deferred, and deliberately not carried here.

## One decision owed

**`--line-height-3` is now a dead token and the guard says so.** Measured: it had
exactly ONE consumer in the whole repo — the club delete button's hand-tightened
`line-height` — and the component absorbed it. So the third ramp step either goes,
or needs a home. Deleting a step from a declared vocabulary is not this area's
call, so the guard is left red rather than a fake consumer invented for it.

---

## RESOLVED · F30 · `timerfield-hand-radios` · The one hand-written radio group left in the app was inside the area

**Resolved 2026-08-26.** `<TimerField>` — now `<SetupTimerSection>` — calls
`<RadioRow>`, with the MM:SS box as the Down option's label. Its module lost
`.timerRow`, `.radio` and `.radio input`.

**I filed it with a blocker that did not exist**, and that is the part worth
keeping. I wrote that `RadioRow`'s `{ value, label }` shape could not express
the Down option because the box must sit INSIDE the `<label>`. It does sit
inside — that is exactly where `RadioRow` renders `opt.label`, and `label` is a
ReactNode. Then I said the leftover `align-items: center` was a styling
decision; measured, it changes nothing, because each `.radio` is an inline-flex
that centres its own contents (10.59px from the row top either way). Both
mistakes were the same one: seeing a declaration in one file and not the other,
and writing it up as a difference without asking whether it did anything.

Five tests went in with it — nothing had rendered `TimerField`, or any setup
form, so everything done in this area until then was checked by `tsc` alone.


`<RadioRow>` exists to render exactly this markup, and **adoption is otherwise
complete**: measured across `src/`, there is not one `type="radio"` outside
`components/fields/`. The single hold-out is `SetupTimerSection.tsx:91–129`, which
hand-writes the None / Up / Down triple.

It pays for that with a duplicate stylesheet. `SetupTimerSection.module.css` vs
`setupForm.module.css`:

| rule | setupForm | SetupTimerSection | differs by |
|---|---|---|---|
| the row | `.radioRow` — flex, wrap, gap 1rem | `.timerRow` — flex, wrap, gap 1rem, **`align-items: center`** | one declaration |
| the option | `.radio` — inline-flex, center, gap .4rem, pointer | `.radio` — identical | **nothing** |
| the input reset | `.radio input` — margin 0, padding 0 | `.radio input[type='radio']` — identical + a tighter selector | **nothing** |

The reason it can't just call `<RadioRow>` today is real and worth naming: the
Down option's label CONTAINS the MM:SS input, which `RadioRow`'s
`{ value, label }` shape can't express — `label` is a `ReactNode`, but the input
must sit *inside* the `<label>` element, not beside it. So this is a genuine
question about `RadioRow`'s API, not an oversight. **The two candidate answers:**
let an option carry trailing content inside its label, or let `RadioRow` take
`children` rendered after the last option.

## RESOLVED · F31 · `letter-input-unnamed` · The same field type, declared four times under four names

**Resolved 2026-08-26 by `<ManualBoardField>`**, and it took F13 and F33 with
it. Four stylesheets were deleted outright — spellingbee's and wordwheel's
(which is what F32's move to the FreeBee pair was waiting for), wordiply's and
letterboxed's — and boggle's kept only its constraints grid.

Two things the component settled beyond the CSS:

- **spellingbee and wordwheel take ONE field**, `A-CHIROT`, where they had a
  1-character box beside a 6-character one. The setup KEYS did not change:
  `custom_center` and `custom_letters` stay separate because `create_game`
  validates them, and the form splits on entry.
- **The field owns the dashes** (Joel, 2026-08-26), which is what let an earlier
  `echo` callback go. Type `ABQU` into a 4-wide boggle board and the dash lands
  a tile early, because `QU` read as two tiles where `Qu` would be one — the
  miscount is visible in the box itself. `boggle`'s written board form gained
  dashes to match, and `parseCustomBoard` now walks the same `readTiles` split
  the field groups by, so the reading shown and the reading used cannot diverge.


This is F13's real answer. Four games each define a "type the letters you'll see
on the board" input, and the four declarations are the same four lines:

```
text-transform: uppercase;  letter-spacing: 0.2em;
font-family: monospace;     text-align: center;
```

| game | class | width | anything else different |
|---|---|---|---|
| spellingbee | `.letterInput` | (unset; `.centerInput` 3.5rem / `.outerInput` 10rem) | no |
| wordwheel | `.letterInput` | (same two) | no |
| wordiply | `.baseInput` | 6rem | no |
| letterboxed | `.sidesInput` | 17rem | no |

Width is the ONLY axis anyone actually chose on, and each width has a stated
reason (four letters max; twelve letters plus separators). **boggle's
`.boardInput` is the fifth and the only real difference** — full width, tighter
tracking, and deliberately NOT uppercase, because `Qu` is one tile and `QU` is
two. Its comment says so.

So: one field type with a width prop, and one documented exception. The
component is missing, and every comment in the four files already gestures at
it — wordiply's says "Matched to spellingbee's `.letterInput`", letterboxed's
names both siblings.

## CLOSED · F32 · `freebee-twins-byte-identical` · Two stylesheets that differ in two comment words

**Moved to the FreeBee pair on 2026-08-25** (Joel) — the full entry is now
`docs/games/spellingbee.md` → Deferred, with a pointer from
`docs/games/wordwheel.md` → Deferred, which owns the pair's shared-vs-not ledger.

The measurement, kept here because the shared findings cite it: the two files are
42 lines and six rules each, and `diff` reports two changed lines, both inside
comments ("spellingbee-local" / "wordwheel-local", "read like the honeycomb" /
"read like the wheel"). Every value is identical.

**It closes here because deleting those two files is the pair's own work, not the
shared vocabulary's.** What is IN them still belongs to this area: F31
(`letter-input-unnamed`) owns `.letterInput` / `.centerInput` / `.outerInput`,
F34 (`label-above-control`) owns `.field` / `.field > span`, and F36
(`stack-repeated`) owns what is left, `.customRow`. Resolve those three and the
pair's entry becomes a deletion rather than a decision.

## RESOLVED · F33 · `placeholder-copied` · A placeholder treatment lifted wholesale, and the file said so

**Resolved with F31.** boggle's rule and letterboxed's copy of it are one rule
inside `<ManualBoardField>`, which is the exit boggle's own comment named: *"If
placeholders ever get a global treatment, this rule folds into it."*

One change of substance: the placeholder keeps the field's LETTER-SPACING (Joel,
2026-08-26), where both copies had dropped it on the theory that a third axis of
difference helped. It differs on colour and slant alone now.


boggle's `.boardInput::placeholder` and letterboxed's `.sidesInput::placeholder`
are the same three declarations (`--field-placeholder-ink-color`, italic,
`letter-spacing: normal`). letterboxed's comment states the provenance outright:
*"Lifted wholesale from boggle's `.boardInput::placeholder`, which met the same
problem first."*

Both files also state the trigger precisely — a placeholder in the same mono
face, tracking and case as real input can be mistaken for a board someone
already typed — which is a property of **the field type in F31**, not of either
game. And boggle's comment names the exit: *"If placeholders ever get a global
treatment, this rule folds into it."* This area is that moment.

## RESOLVED · F34 · `label-above-control` · Copies of "a caption above a control", differing by a hair

**Resolved 2026-08-26 by `<Field>`**, after resolving twice by accident and
coming back.

It was three copies at 0.3 / 0.35rem. Two died with spellingbee's and
wordwheel's stylesheets — but the SHAPE did not go away, it turned out to live
in four more files in three other areas, three of them byte-identical
(`gap: 0.4rem; border: none; margin: 0; padding: 0; min-width: 0`). So the app's
most common field had no component: `<ManualBoardField>` is a SPECIALISED text
field, and its existence is why the absence went unnoticed.

**Then I wrote it a third time.** Building `<TextField>`, `<ReadOnlyField>` and
`<ColorField>` in one sitting, I declared `.field` and `.label` in all three —
the same finding one layer along. `field.module.css` holds the shape now.

**And a fourth**: five components still laid out the caption in MARKUP even with
the CSS shared, and only one could show help or an error at all. Joel: *"that's
a lot of repetition and chances for this to drift — should have a Field
component that lays out the label/input/entryHelp/error?"* `<Field>` does, and
its render prop is the load-bearing part: it generates the id and hands it to
the control, so no component writes the association itself. That association had
just been got wrong — a wrapping `<label>` absorbed the help and the error into
the control's accessible name.

**The lesson the four rounds teach**: a shared stylesheet is not a shared shape,
and a shared component is not one either until the SHAPE lives somewhere too.


| where | gap | label size | weight |
|---|---|---|---|
| `SelectField.module.css` `.field` / `.label` | 0.35rem | 0.9rem | 600 |
| spellingbee `.field` / `.field > span` | 0.3rem | 0.85rem | 600 |
| wordwheel `.field` / `.field > span` | 0.3rem | 0.85rem | 600 |

Nobody chose 0.3 over 0.35, or 0.85 over 0.9 — and `SelectField` already OWNS
this shape as a component (`label` prop → `<span class="label">` above the
control). The two games hand-roll it because their control is a text input and
`SelectField` only wraps a `<select>`.

Note both numbers are in the `vocabularies.test.ts` allowlist
(`SelectField.module.css: ['0.35rem']`, and `['0.9rem']` in the font-size list),
so the guard is already carrying them as known debt.

## RESOLVED · F35 · `two-box-chromes` · `.fieldset` and `<SetupSection>` claimed to match and did not

**Resolved 2026-08-26, and the answer was neither box's values.** Joel's
ruling: everything is a `<SetupSection>`, and its summary states the value, so a
player reads the whole form without opening anything.

Nine boxes converted, `.fieldset` and its legend were deleted, and letterboxed
and wordiply lost a THIRD shape nobody had noticed — two controls in no box at
all. `<NextPuzzleField>` converted too, its summary carrying the puzzle, which
is the point of a preview being allowed behind a disclosure.

Two bugs of mine fell out of it and are worth keeping:

- `picked === null` meant BOTH "still looking" and "no puzzle that day", so for
  the instant between typing a date and the answer arriving the field claimed
  there was nothing there.
- **`SetupSection`'s `defaultOpen` was not a default.** `open={defaultOpen ||
  undefined}` hands React the attribute, so every re-render re-imposed it and a
  flip back to false SLAMMED THE SECTION SHUT — with the date box you were
  typing into inside it. It seeds a `useState` and reads `opened || defaultOpen`
  now.

**boggle's "Board constraints" is the one summary that still doesn't say what is
set**, filed in `docs/games/boggle.md`: it heads a 3×2 matrix where every other
summary describes one value.


Two boxes do the same job — a bordered, titled group of setup controls — and
`SetupSection.module.css`'s comment says it is "a bordered box (matching the
setup form's `.fieldset` chrome)". Measured, it doesn't match:

| | `.fieldset` (setupForm) | `<SetupSection>` |
|---|---|---|
| border / radius | 1px `--page-surface-border-color`, `--radius-md` | identical |
| title | `legend`, weight 600, padding `0 0.25rem` | `summary`, weight 600, padding `0.6rem 0.75rem` |
| body padding | `0.75rem 1rem 1rem` | `0.25rem 1rem 0.85rem` |
| collapsible | no | yes, closed by default, summary carries the live value |

Usage is lopsided and mixed: **15 files use `<SetupSection>`** (13 games plus
`SetupTimerSection` and `SetupCoopStyleSection`), while **4 use the raw `.fieldset`**
(codenamesduet, spellingbee, wordwheel, and `SetupNextPuzzleSection`). Several forms use
both.

The question is not which values win — it's whether a setup form has ONE box
type with a collapsible variant, or genuinely two. If it's one, the padding
difference is the only thing to reconcile, and it exists because the summary is a
click target and the legend isn't.

# What shipped — the field vocabulary, 2026-08-26

The button half is above. This is the other half, and it ended somewhere the
audit did not predict: not "these five findings are fixed" but **a setup form is
now a list of components with their words as props.**

## Eleven fields, one shape

`<Field>` lays out **caption → `help` → control → `entryHelp` → `error`**, and
every field renders its control inside it. Five components — `<TextField>`,
`<NumberField>`, `<ReadOnlyField>`, `<ColorField>`, `<PlayersField>` — did not
exist when the area opened; the app's most common field type had no component at
all.

| | |
|---|---|
| `<TextField>` | a caption over an input, or a textarea with `multiline` |
| `<NumberField>` | a number, sized in characters of its largest value |
| `<SelectField>` · `<DictBandField>` | a dropdown; the band picker is one over the six bands |
| `<DateField>` | a date, always an override |
| `<ManualBoardField>` | type the board yourself — five games, one component |
| `<CheckboxField>` · `<RadioRow>` | one setting, or one of a set |
| `<ColorField>` · `<PlayersField>` | a GROUP: swatches, and who is playing |
| `<ReadOnlyField>` | a caption over a value you cannot change |

**`label` is optional on all of them**, because a field inside a section whose
summary already names it needs no second caption. Where there is no caption the
control is named by `ariaLabel` — eight sites, every one deliberate, and its
only live consumer is the test selectors (screen readers are out of scope and a
field has no tooltip).

**Two text slots, because they are two jobs.** `help` says what the setting IS;
`entryHelp` says how to GIVE it. Both, when both — losing the instructions the
moment you make a mistake takes them away exactly when they matter.

**Errors ring the control and say why**, via `aria-invalid`, which is the
attribute `<TimerField>`'s MM:SS box had always keyed on: state in the DOM
rather than a class the markup and the styling must keep in step. **A setup form
does not use it** — its errors collect at the bottom beside the Start they gate
(Joel), and both the prop's docstring and the CSS say so. Joel, 2026-08-26:
*"one day we'll try to move errors in setup closer to the field; not in scope
now."*

## Everything else is a section

`<SetupSection>` is the only box a setup form has. `.fieldset` is deleted, and
three components that were never fields are named for what they are —
`<SetupTimerSection>`, `<SetupCoopStyleSection>`, `<SetupNextPuzzleSection>` —
and live in `components/setup/`. **Their missing text props were the type system
saying the names were wrong**: `entryHelp` and `error` are about A CONTROL, and
each of these owns several.

The player picker is an ordinary section now, `defaultOpen`, its summary a row
of the players' dots. It had spent a day as the one field outside the vocabulary
— a bordered box of its own — and an `alwaysOpen` prop written for it was
deleted the same day when `defaultOpen` turned out to be enough.

## 43 hand-written paragraphs became 3

| | then | now |
|---|---|---|
| a field's help | 26 hand-written `<p>` | `help` props |
| a game's intro | 13, inside each form, rendering BELOW the player picker | `GameSetupForm.intro`, drawn first by the modal |
| a section's help | 4 | 3 — F47 |

The intro move deleted twelve `{mode === 'coop' ? … : …}` branches with it: a
manifest is already per-mode, so each states its own sentence.

## And the shared stylesheet ended

`setupForm.module.css` is deleted. Every rule went to the component that draws
it — the radio row to `<RadioRow>`, the help text to `<SetupSection>`, the
form's column to `<SetupGameModal>` — along with sixteen imports and the guard
check that policed how they were named. That check went WITH ITS SUBJECT: a
guard whose subject no longer exists is not a guard.

## Predicted test breaks (§21 — predict them, write them down, LEAVE them)

**No e2e has been run against any of this**, deliberately (Joel, 2026-08-26:
ask before running any e2e; mid-area red carries no information). The specs
below are where I would expect breakage, and the diff against this list is what
says whether something broke that shouldn't have:

| spec | why |
|---|---|
| every game's setup e2e | the dialog's structure changed: intro first, players in a section, fields relabelled |
| `coop-setup.e2e.ts` | `<SetupCoopStyleSection>`'s markup and its section |
| `puzzle-pickers.e2e.ts` | already updated once for the disclosure; the date box is `<DateField>` now |
| `auth.e2e.ts` / `claim-handle.e2e.ts` | LoginScreen's two boxes gained captions; the handle field's rules line is `entryHelp`/`error` |
| `club-*.e2e.ts` | EditClubModal's gametype checkboxes |
| `anagram-finder.e2e.ts` · `word-edit.e2e.ts` | converted dialogs — the second's names changed, and its UNIT tests were updated |
| `tap-targets.e2e.ts` | field and control sizes moved |

Unit tests are green throughout: **1991 of 1993**, the two failures being
`scripts/subset-font.py`'s deliberate missing stamp and F43's dead
`--line-height-3`.

---

## F36 · `stack-repeated` · A flex column with a gap is the most-repeated shape in the area

**The measurement inverted the finding.** I filed it as "declared three times".
Counted app-wide, `display: flex; flex-direction: column; gap:` appears at about
**80 sites** — which is strong evidence for §7's *"not patterns, though they look
like it"*. A stacked column with a gap is not a pattern; it is what CSS looks
like.

**Inside the area it is now down to three, and two of them are deliberate**:
`<Field>`'s own column (`gap: 0.4rem`), and the setup dialog's two — `.body`
holding intro / picker / form and `.formBody` holding the fields. Those two came
from FIXING a bug: each piece of the dialog used to space itself, and when the
player picker lost its box the hole appeared under it.

**So what is actually left is one file.**
`SetupCoopStyleSection.module.css` is thirteen lines whose entire content is one
such stack, justified in its own comment by pointing at the setup form's rhythm.
Either it uses the shared column or the file goes.

## CLOSED · F37 · `crosswords-rolls-its-own-field` · A third copy of the puzzle picker, and a control that re-declares the field chrome

**Moved to crosswords on 2026-08-25** (Joel) — the full entry, with the measured
drift, is `docs/games/crosswords.md` § 9 → Deferred features.

It closes here for the reason it was flagged here: crosswords is the one form
that opts out of the shared vocabulary, so the DECISION belonged to the area that
owns the vocabulary — but every edit lands in that game's files, and this area
does not touch other games' code.

The short version, kept so the shared findings have their sibling to point at:
two raw `<select>`s (the app's last outside `fields/`), a `.search` class that
re-declares the field chrome and disagrees on all four of radius, border token,
padding and size, a `.nextDate` that is `<SetupNextPuzzleSection>`'s `.next` re-typed,
and two unconverted radius literals.

**What travels with it as a warning:** crosswords has a REAL reason not to use
`<SetupNextPuzzleSection>` — its archive is a catalogue, not a queue, so it picks a
weekday rather than "the next one nobody has played". Only the fixed-height line
and the date override are the same mechanism. A fix that folds the whole field in
would be wrong.

**Still open here:** F44 (`field-tokens-on-buttons`) covers that game's
`Controls.module.css .btn` — same raw `6px`, plus a form field's tokens on a
button — because that one is a question about BUTTONS, which is this area's.

## RESOLVED · F38 · `theme-css-pointers-rotted` · Comments pointed at a stylesheet that no longer holds the rule

Nine comments named `theme.css` for rules that moved when the stylesheet split.
**Four died with `ActionButton.tsx`** (they pointed at the button classes, now in
`StandardButton.module.css`); the remaining five were in `fields/` and are fixed
here. They were wrong twice:

- **Wrong file, and misleadingly so.** `theme.css` still exists — SIXTEEN of
  them, one per game — so a reader follows the pointer to a real stylesheet,
  searches for `input`, finds nothing, and assumes they have misread something.
  Checked all sixteen: none contains the rule. It is `base.css:777`.
- **The quoted selector said `input, textarea, button`.** It is `input,
  textarea`. `button` left that rule when chrome became opt-in.

**The `button` half is NOT a defect to chase downstream** (Joel, 2026-08-25).
An unstyled `<button>` having no standard look is the correct arrangement, and
`.standardButton` declaring its own padding is right *because* the element does
not hand one down: *"it would be bad if instead we set that on all
button-elements, and .standardButton inherited. it couples these things when
there would be no reason to do so."* The neutral reset and the standard button's
look have to be able to move independently — and the accidental kinds (a list
row, a chat bubble, a `.link-button`) depend on the element staying bare.

So this was only ever five pointers to repoint. The comments' SUBSTANCE was
correct all along: all five are about inputs — the radio padding override, the
select's sizing — and an input genuinely is covered by that rule.

## RESOLVED · F39 · `wrapper-tones-are-fiction` · Seven purpose buttons documented tones that have never existed

**Re-slugged 2026-08-25, not silently** (§21 allows it when the subject genuinely
changes). It was `actionbutton-says-action`; that subject went with the file.

`ButtonTone` is, and has only ever been, five words: `quiet · normal · caution ·
destructive · success`. Seven wrapper docstrings named something else, and all
seven now say what the code passes:

| documented | files | fixed to |
|---|---|---|
| `info` | `ExchangeButton` · `NewGameButton` · `RestartButton` · `SharePreviewButton` | `normal` |
| `error` | `EndGameButton` · `RevealButton` | `destructive` |
| `action` | `BackToClubButton` | `normal` |

**Why it mattered more than a typo.** `info` and `error` are the OUTCOME
palette's words, and the buckets were split precisely so that *"a control saying
'this is irreversible' is a different question from a game saying 'you lost',
even where the two hexes agree today."* A docstring calling a button's red the
`error` red teaches the coupling the tokens exist to deny. `action` is the
retired name, retired because it collided with one of the fourteen KINDS.

Checked after: no word outside the five appears as a tone in `buttons/`, and the
tones the wrappers actually pass are `normal` ×7, `destructive` ×4, `caution` ×3,
`quiet` ×1.

## RESOLVED · F40 · `tone-quiet-claims-cancel` · The tone vocabulary reserves a slot for a button that never arrives

`ButtonTone`'s docstring: *"`quiet` = gray (a dialog's Cancel)"*. `button.css`
on `.secondary`: *"Its family defaults to `quiet` (the way out of a dialog)"*.
`ActionButton.tsx:23`: *"The cancels don't come through here at all."*

All three are accurate, together they say the vocabulary was designed with the
form button in mind and the form button went elsewhere. **This is F9 seen from
the token side**, and it is the strongest evidence that F9's answer is "yes, one
family" rather than "no, two": the machinery for a text-only quiet button is
built, documented, and unused.

## F41 · `segmented-and-radiorow` · Two answers to "a few options, exactly one chosen"

`patterns/segmented.css` and `<RadioRow>` solve the same problem differently:

| | `.segmented` | `<RadioRow>` |
|---|---|---|
| markup | `<button>`s in a frame | native `<input type=radio>` in `<label>`s |
| chosen state | `aria-pressed="true"` → filled in the normal family | `:checked` |
| shape | joined, one shared border, ends clipped by `overflow: hidden` | separate options, `gap: 1rem` |
| sites | club page's mobile tabs + its coop/compete/all filter, crosswords' source picker | 8 setup forms + `SetupCoopStyleSection` |

Both files argue their own shape well (segmented's comment: *"Separate buttons
with a gap read as independent toggles you could press several of — which is
exactly what these aren't"* — which, read straight, is an argument against
`RadioRow`'s spacing). Neither says when to reach for which, and **crosswords'
setup form uses the segmented control** — so the line is not "segments are for
the club page".

The answer may well be "radios inside a form, segments for filtering a view".
That is a one-sentence rule the area can write; today it isn't written anywhere.

## RESOLVED · F42 · `local-module-alias-drift` · The shared setup stylesheet was imported under four names

Measured across the 15 importing files: **`styles` ×11, `form` ×3, `shared` ×1** —
and the game's own module then took whichever word was left, `local` in four
files. So `styles.checkRow` meant the SHARED class in one file and a local one in
the next.

**The rule, which already held in 171 of 178 places before anyone wrote it
down:** a module named after the importing file is that file's OWN and is
`styles`; anything else is somebody else's and is named for what it IS.
`setupForm.module.css` is `form`, at all 15 sites.

Twelve files changed. The four that had it inverted — wordiply, wordwheel,
letterboxed, spellingbee — were the ones using `styles` for the shared sheet and
`local` for their own.

**Guarded, not just documented** (`src/guards/cssClasses.test.ts`), which is the
point: this is exactly the kind of convention that rotted `--radius-md` while the
guarded colour vocabulary held. Two checks, both PLANTED to prove they
discriminate — renaming wordle's `form` to `shared`, and wordwheel's own module
back to `local`, each failed the right one.

The narrowing that took two tries is worth recording. "Nobody else's module is
`styles`" is FALSE and the guard said so: `HandCard` imports
`PlayerBoard.module.css` as `styles` and there is nothing to confuse it with —
the ambiguity needs two sheets. And "own" has to mean same-DIRECTORY, not same
basename: every game's `PlayArea.tsx` imports both its own `./PlayArea.module.css`
as `styles` and `common/components/game/PlayArea.module.css` as `shared`, which
is the convention working.

## RESOLVED · F43 · `line-height-3-orphaned` · A vocabulary step with no consumer left

**Not a problem** (Joel, 2026-08-25): *"we are not going to delete
`--line-height-3` or give it an artificial home. who cares that it's currently
unused, midsprint. not me."*

So the finding is answered, and the answer is that its premise was wrong. A
declared vocabulary step is not the same kind of thing as a stray token somebody
forgot to delete — the ramp is meant to be complete, and "nothing happens to read
step 3 this week" is a fact about this week. That is the same argument the guard
already accepts for a reserved cell in a colour family.

The history, for whoever reads the token later: it had exactly ONE consumer in
the repo — `ClubGameDeleteButton.module.css`, hand-tightening the corner delete
button's line-height — and `<StandardButton>` absorbed that on 2026-08-25 when
the button started declaring its own type.

**Left over:** `src/guards/cssTokens.test.ts` → "every defined token is
referenced (no dead tokens)" is RED on it, and stays red. The guard has a
mechanism for a reserved COLOUR cell (`palette.ts` reads every one) and none for
a reserved ramp step. Teaching it that a declared ramp step is reserved rather
than dead would be a change to a guard's premise, which is not something to do
off the back of a finding — **open question, not this finding's business.**

## CLOSED · F44 · `field-tokens-on-buttons` · Two authors independently painted a button out of a form field

**Moved out on 2026-08-25** (Joel: *"it's about that area"*). The finding named
two sites in two different areas, so it closes here and travels as two entries:

| site | went to |
|---|---|
| `crosswords/components/Controls.module.css .btn` (3 uses) | `docs/games/crosswords.md` § 9 → Deferred features, beside F37 |
| `floating-panels/GameScratchpadCompanion.module.css .takeOver` | `plans/areas/floating-panels.md` → **F31**, that area being open |

**The scratchpad half did not go to crosswords**, because it isn't crosswords' —
it is a shared floating panel in `common/`, and `docs/ui.md` already flags it as
*"one case genuinely unsettled … could reasonably be `button secondary` in the
quiet tone"*, deferred to "next time the scratchpad is open".

The observation that made it one finding is worth keeping in both: two authors
who shared no code reached the same non-standard answer — `1px solid
var(--field-edge-color)`, `var(--field-fill-color)`, `var(--page-text-color)`,
`border-radius: 6px` — which says the shared button was not reachable, not that
either of them wanted something different. `--field-*` is a form FIELD's edge and
fill; these are buttons. The two vocabularies sit close in light mode, which is
exactly why nobody noticed.

## F45 · `four-dismiss-glyphs` · The ✕ problem `TitlebarCloseButton` solved, surviving at four more sites

**NOT a conversion this area performs** (Joel, 2026-08-25): *"x-to-close buttons
aren't normal buttons — we don't put borders on them and we may not decide that
they have the same hover/is-clicked look. We can handle those when we meet
them."* Filed because the CENSUS belongs here, and because the shape of the
problem is already documented as solved.

`TitlebarCloseButton`'s own docstring states the case for existing: *"`InfoSheet`
shipped `✕` (U+2715) against this `×` (U+00D7) with its own hand-written
aria-label, and a class can only make two different characters look alike."* Two
floating panels use it. Four other dismiss-shaped controls do not, and they
reproduce the exact defect:

| site | glyph | name | box |
|---|---|---|---|
| `Toast .close` | `×` U+00D7 | "Dismiss" | `padding: 0.15rem 0.35rem`, 1.2rem |
| `GenericFeedbackPill .close` | `×` U+00D7 | "Dismiss" | 1.1rem square, no padding |
| `historyViewer .bannerExit` (8 games) | **`✕` U+2715** | "Exit viewing" | `padding: 0.15rem 0.35rem`, 1rem, `--radius-sm` |
| letterboxed `.chainRemove` | `<IconRemove>` | "Take back WORD" | `all: unset`, 2.1rem, `999px` |

**Two different characters, one Lucide component, and four sizes** — the same
mix, at eight times the spread, since `bannerExit` ships in eight games.

**`.chainRemove` is probably not one of them**, and that is worth saying rather
than assuming: it means "take back the last word", which is an UNDO, not a
close. It sits in the group only by shape. Whoever picks this up should decide
whether the family is "dismiss" or "small glyph button", because the answer
changes whether letterboxed is in it.

## F46 · `ui-doc-describes-deleted-classes` · docs/ui.md documents components and classes that no longer exist

**Parked for the sprint's docs step, and it has grown.** When filed it named
`ActionButton`, `` `.button` ``, `.icon-button`, `.icon-only`, `.button-small`
and `patterns/button.css`. Since then the same doc has also been overtaken by
`DifficultyField` (now `DictBandField`), `.checkRow`, `.fieldset`,
`setupForm.module.css`, freebee's two-input custom-letters layout, and the
player picker's bordered box.

Still not a defect to fix now: the sprint distributes into `docs/` at the END
(§13), and rewriting a section the remaining findings will move again is work
done twice. Filed so the rewrite is a known, sized piece of that step — and so
nobody reads those sections meanwhile and believes them.

## RESOLVED · F47 · `section-help-has-no-prop` · A section's help was hand-written, and three sections could not forward one

**Resolved 2026-08-26.** `<SetupSection>` takes `help` — under the summary,
above the controls — and `<SetupTimerSection>`, `<SetupCoopStyleSection>` and
`<SetupNextPuzzleSection>` all forward one, so the three sections have
compatible interfaces.

**The three remaining paragraphs split two ways, and the tell was the same each
time: does a clause belong to the PAIR, or to a FIELD?**

- **boggle's became two field helps.** It was two bolded halves, one per band —
  and the `<strong>`s existed ONLY to tell those halves apart inside one
  paragraph. The field captions do that now, so the markup went with the split.
- **wordwheel's stayed the section's**, and it is superficially the same
  paragraph. Its last clause is *"both are length-agnostic (examples just show
  the band)"*, which is about the pair: split it and that sentence has to be
  said twice or dropped.
- **scrabble's stayed too.** It reports the COMBINED choice — count and level
  together — then reaches out of the section entirely, to the dictionaries
  above. Neither half is any one field's.

So: **zero hand-written help paragraphs, and no `<p>` at all in any setup form
outside crosswords.** A game's `SetupForm.tsx` is components and props.

**And it surfaced the gap it left behind.** With every field's margins gone, two
fields in a section sat flush — Joel saw "Required words" running into "Legal
(bonus) words". `.sectionContent` is a gapped column now, which settled a rhythm
the area had never stated: **0.4rem inside a field, 0.75rem between fields in a
section, 1rem between sections.** A field holds together more tightly than a
section, and a section more tightly than the form.
