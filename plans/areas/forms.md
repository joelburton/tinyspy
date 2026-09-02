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

**Twenty findings. SEVENTEEN RESOLVED** — F8, F9, F13, F30, F31, F33, F34, F35,
F36, F38, F39, F40, F41, F42, F43, F45, F47 — **three CLOSED and moved out**
(F32 → the FreeBee pair, F37 → crosswords, F44 → crosswords + floating-panels)
— and **one parked** for the sprint's docs step, F46.

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

## The dead-token guard is expected to be red, and that is a ruling

**`--line-height-3` stays** (Joel, 2026-08-26). It has no consumer — its one
reader, the club delete button's hand-tightened `line-height`, was absorbed by
`<StandardButton>` — and the dead-token guard says so on every run.

**We are not quieting it, and not exempting the token either.** *"Just ignore
failing tests for guards until later. We're rolling out a bunch of new things,
so of course there will be unused tokens. Finding them is a cleanup step."*

A sprint that lands whole vocabularies before converting the surfaces that read
them WILL leave steps unread for a while; a guard that goes red on exactly that
is doing its job, and the answer is a sweep at the end rather than an exemption
per token as each one appears. So: **read the dead-token failure as a running
count of the cleanup owed, not as breakage.**

What that means for reporting test runs in this sprint: the honest baseline is
"1991 of 1993, both known" — `scripts/subset-font.py`'s deliberate missing stamp
and this. Neither is a regression, and neither gets fixed here.

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
that centers its own contents (10.59px from the row top either way). Both
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
difference helped. It differs on color and slant alone now.


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

## The e2e run — 221 passed, 9 failed, and only ONE was this area's

Run 2026-08-26 (9.8m) with Joel's standing rule attached: *"there are a lot of
things I haven't reviewed or blessed, so 'fixing the test' would just effectively
bless those things. What we're interested in here is actual breakage."*

**The prediction was wrong in the useful direction.** The table here expected
every game's setup e2e to break — the dialog's structure changed under all
sixteen. None did. What broke was narrower and more interesting.

### One real bug, and it was not a stale assertion

**`letterboxed` custom board.** `<ManualBoardField>` inserted separators without
ignoring them on the way back in, so every render re-grouped its own output.
Typing `BICAEMYUKLRF` gave `BIC-A` → `BIC--AE` → `BIC---A-EM` → …, broken from
the FIFTH letter for any caller that stores what the field hands it — which is
the ordinary way to write a controlled input, and what letterboxed does. The
field's own docstring already claimed the fixed behavior (*"a pasted board with
its own separators comes out looking like every other one"*); it was never
implemented. Fixed, plus `ManualBoardField.test.tsx` — four tests, PLANTED:
reverting the fix fails exactly the two that describe the bug.

### Four that predate this area, traced to the commit

| spec | cause | filed |
|---|---|---|
| `page-no-scroll` × 2 | locates a panel by `locator('header')`; the titlebar became a `<div>` in `a61092ae` | floating-panels **F32 (`titlebar-is-not-a-header`)** |
| `anagram-finder` | asserts the list scrolls in a *fixed* panel; `30377b99` gave the word dialogs `fitContent`, so the panel grows instead | floating-panels **F33 (`word-dialogs-grow-instead-of-scrolling`)** |
| `wordle-keyboard` | reads `--ink-on-dark-color`, deleted in `8e546cae`; the assertion compares the page's default ink against the key's correct white | `docs/games/wordle.md` → Deferred |

### Three punted to the games that own the decision (Joel, 2026-08-26)

`boggle` × 2 (the recap's dash separator) → `docs/games/boggle.md`;
`spellingbee` custom letters (two boxes became one) → `docs/games/spellingbee.md`.
Both changes are right; both are visible UI decisions that belong in front of
Joel during those games' own passes rather than certified by a spec edit from the
area that made them.

### The one spec this area did change

`word-edit`, and only because the rule changed: **an `aria-label` exists for
tests to find something, and is junk otherwise** (Joel, 2026-08-26). That dialog
carried five that CONTRADICTED their visible captions — the box reading "Note"
was named "Curation note", the one reading "Word" was named "New word". The
captions are the accessible names now, so the spec asks for what is on screen.
Only one line actually had to move: Playwright's `getByLabel` matches a
SUBSTRING, so `'Band'` still finds `"Band (1–6)"` while `'Curation note'` finds
nothing in `"Note"`. The `Word` lookups took `{ exact: true }` — the `~` lookup
dialog is still open behind the add dialog, and a loose `'Word'` would find its
"Word to look up" box and trip strict mode.

**Unit tests: 1995 of 1997**, the two being `scripts/subset-font.py`'s deliberate
missing stamp and the dead-token guard, which is expected to be red for the rest
of the sprint (see above).

---

## RESOLVED · F36 · `stack-repeated` · A flex column with a gap is the most-repeated shape in the area

**The measurement inverted the finding when it was filed.** I wrote it as
"declared three times". Counted app-wide, `display: flex; flex-direction:
column; gap:` appears at about **80 sites** — strong evidence for §7's *"not
patterns, though they look like it"*. A stacked column with a gap is not a
pattern; it is what CSS looks like.

**Resolved 2026-08-26 by deleting the one file that was left.**
`SetupCoopStyleSection.module.css` was thirteen lines holding a single
`.controls` stack, wrapping the style radio and the first-player dropdown in a
column nested inside `.sectionContent` — which is itself a gapped column since
the spacing fix earlier today. So the wrapper had stopped doing anything except
override the gap.

**And it overrode it to the wrong step, which is the part worth keeping.** Its
own comment justified `gap: 1rem` as *"the same 1rem rhythm the setup form uses
between its sections"* — the BETWEEN-SECTIONS step, applied between two fields
INSIDE one section. Written before the rhythm existed, it borrowed the only
number it could see. The two controls now sit at 0.75rem like every other pair
of fields, so the section reads the same as the sections around it.

**What's left is three stacks, and they are the three steps — one file each:**

| file | gap | what it spaces |
|---|---|---|
| `field.module.css` | `0.4rem` | caption → help → control, inside one field |
| `SetupSection.module.css` | `0.75rem` | field → field, inside one section |
| `SetupGameModal.module.css` | `1rem` | section → section, and the dialog's own column |

That is the finding landing somewhere better than it started: not "three copies
of a stack" but three declarations of a rhythm, each owned by the thing whose
spacing it is. A fourth copy is now visible as a fourth number, which is how the
`.controls` one was caught.

**`<SetupCoopStyleSection>` draws no layout at all now** — no stylesheet, no
wrapper element, just two fields in a section. That is the shape the area was
after: a component contributes controls, and the section spaces them.

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

## RESOLVED · F41 · `segmented-and-radiorow` · Two answers to "a few options, exactly one chosen"

**Resolved 2026-08-26 by Joel's rule, which turned out to be two axes rather
than one.** `patterns/segmented.css` and `<RadioRow>` looked like rival answers
to the same question. They aren't: they sit in different cells of a grid whose
fourth cell was already occupied and unnamed.

|  | **few** — show every choice | **many** — collapse into a menu |
|---|---|---|
| **sets a value** — the game reads it later | `<RadioRow>` · 12 sites | `<SelectField>` · 15 sites + every `<DictBandField>` |
| **switches the view** — tabs or a filter | `.segmented` · 3 sites | `<FilterSelect>` · 4 sites |

**WHAT IT DOES picks the row. HOW MANY OPTIONS picks the column.** Joel:
*"radiorow is useful on forms to let someone pick one of a set of choices, used
later... segmented act like tabs; it changes the thing below it."* And on the
column: *"we could make the all/co-op/compete a drop-down; i don't because it's
a short list, it saves opening a menu to pick a choice when all are shown."*

**Checked at all 15 sites, and there are no crossovers.** Every `<RadioRow>`
writes a key the RPC consumes — hand size, word check, min word length, turns,
first clue-giver, guesses, AI count, deck, palette, extra swaps, co-op style,
timer kind. All three `.segmented` change the content below them.

**The exception this finding was filed on doesn't exist.** I wrote that
crosswords' setup form using segments meant the line couldn't be "segments are
for the club page" — true, but the line was never about WHICH PAGE. Crosswords'
puzzle-source picker is a tab bar by the rule, and its own markup already says
so: `.tabStack` / `.tabBody` / `.tabHidden`, all four bodies mounted, inactive
ones hidden. It is the rule's best example, not its counterexample.

**Two things worth recording because I nearly wrote them wrong:**

- **"Nothing stores the choice" is FALSE** for the view row. `ModeFilter`
  persists through `useStickyChoice`. The distinction is not storage, it is
  whether the choice is an ANSWER — the game reads `hand_size`; nothing reads
  which tab you were on but the tab bar.
- **Revealing a follow-up is not switching a view.** Three radio rows change
  what is below them: "turns" reveals the first-player dropdown, `ai_count > 0`
  reveals Skill, the timer's "Down" enables its MM:SS box. Read literally,
  "changes the thing below it" would sweep those into the segmented family.
  A further question that exists only for one answer is not an alternative view
  of the same job.

**Where it's written:** a short "WHICH CONTROL" block in each of the four,
naming that file's cell and pointing at its two neighbors, so whichever one you
open answers the question. The census stays here — a docstring shouldn't carry
site counts that rot. It goes to `docs/ui.md` at the sprint's docs step, which
is also where F46 (`ui-doc-describes-deleted-classes`) gets settled.

**One observation, not a proposal.** The club page shows both columns of the
grid at once — `ModeFilter` segmented, `GametypeFilter` a menu, side by side
doing the same job in two shapes. That is what the count rule asks for, and it
probably reads as drift to anyone who doesn't know the rule.

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
guarded color vocabulary held. Two checks, both PLANTED to prove they
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
already accepts for a reserved cell in a color family.

The history, for whoever reads the token later: it had exactly ONE consumer in
the repo — `ClubGameDeleteButton.module.css`, hand-tightening the corner delete
button's line-height — and `<StandardButton>` absorbed that on 2026-08-25 when
the button started declaring its own type.

**Left over:** `src/guards/cssTokens.test.ts` → "every defined token is
referenced (no dead tokens)" is RED on it, and stays red. The guard has a
mechanism for a reserved COLOR cell (`palette.ts` reads every one) and none for
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

## RESOLVED · F45 · `four-dismiss-glyphs` · The ✕ problem `TitlebarCloseButton` solved, surviving at nine more sites

**Filed as a census, not a conversion** (Joel, 2026-08-25): *"x-to-close buttons
aren't normal buttons — we don't put borders on them and we may not decide that
they have the same hover/is-clicked look. We can handle those when we meet
them."* Then we met them, and the census is what made the answer obvious.

**Ten hand-written dismiss controls, three glyphs, four boxes:**

| where | glyph | box | count |
|---|---|---|---|
| floating-panel titlebar | Lucide `IconClose` | 0.7 × bar height, hover wash | 1 |
| history-viewer banner exit | `✕` U+2715 | `padding: .15rem .35rem`, 1rem, `--radius-sm` | **8** |
| `Toast .close` | `×` U+00D7 | absolute, 1.2rem, muted→full ink on hover | 1 |
| `GenericFeedbackPill .close` | `×` U+00D7 | 1.1rem square, `opacity: .7` on hover | 1 |

**And the app already had a rule for the character**, in `TrashButton`: *"`×` is
deliberately not this button's glyph. An ✕ means *close this*."* Written down —
and then written as `×` at two of the ten sites.

**`TitlebarCloseButton` was never coupled to a titlebar.** That is what made the
answer cheap: strip its two titlebar-specific lines — the bar-relative size and
the border kill — and what's left (Lucide glyph, quiet tone, `iconScale`, hover
wash) is what a dismiss looks like anywhere. So it became
`common/components/buttons/CloseButton.tsx` and the component `TitlebarCloseButton`
was **deleted**, not renamed: after the extraction its whole body was
`<CloseButton className={styles.close} />`, and a file for that isn't worth
keeping. `FloatingPanel.module.css .close` holds the one line that is genuinely
the bar's.

**Sized in `em`, which was the blocker Joel named.** The mechanism already
existed — `.iconOnly` reads `--iconButton-size`, and re-pointing it is the
supported ask (`small` does exactly this at 1.6rem). The shared default is
`1.4em`, which is what the titlebar's ✕ already measured (0.7 of a 2rem bar) —
the value the one converted site had reached by hand, not a new opinion.

**What each site keeps is PLACEMENT**, the same split as `<Field>`'s `className`:
the toast pins its own to the corner, the titlebar sizes its own to the bar. One
exception, deliberate: the pill re-states `color: inherit`, because a pill is
TONED and the shared button paints from the quiet family — a gray ✕ on a colored
pill would be wrong.

**Two of ten converted; eight FILED, not swept** — `docs/deferred.md` → Common /
architecture. The banner exits live in eight games' `BoardCol.tsx`, each of which
has its own CSS pass scheduled, and this area doesn't touch other games' code.

**`.chainRemove` stayed out**, which is the question this finding raised and
answered: it means "take back the last word" — an *undo* — and is in the group
only by shape. That decides the family's name: **dismiss**, not "small glyph
button".

**One thing to look at rather than argue about:** the shared hover is a WASH
(a background tint of the button's own family), where the toast used ink and the
pill used opacity. On a toned surface a quiet wash may read as a smudge. Not
guessable from the CSS.

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

---

## F48 · `form-state-and-field-errors` · A form is one keyed object, and errors are too

**Raised 2026-08-27, from the error sprint** (the error/envelope sprint),
which needs a server-side validation to land **under the field it is about**
rather than on the form's bottom line. Tracing the plumbing found the missing
piece is not in the error system at all — it is that a form has no consistent
idea of what its fields are called.

**The rulings (Joel, 2026-08-27):**

> "we should make all forms use a single object piece of state, keyed by name…
> that forces fields to have names, which is good… this should make the
> form-error design be easy: an object, keyed-by-name, with one key for
> not-a-field-specific-error."

### The four pieces

1. **`name` is required on every field component**, and forwarded to `<Field>`.
   It already exists and already means the same thing — *"the `name` on the
   underlying input"* — on `TextField`, `NumberField`, `SelectField`,
   `CheckboxField` and `RadioRow`. Six have none: `ColorField`, `DateField`,
   `PlayersField`, `ManualBoardField`, `ReadOnlyField`, and `DictBandField`
   (which is a preset wrapping `SelectField`, so it only threads the prop
   through). **`ReadOnlyField` gets one too** — Joel: *"a read-only field can be
   invalid… plus, perhaps the server wants to set an error on the read-only
   field. who are we to argue?"* Its signature already carries `label`, `help`,
   `entryHelp` and `error`; only `name` is missing.

2. **A form's values are ONE object keyed by name.** The sixteen setup forms are
   already halfway there — they read and write keys inside `SetupGameModal`'s
   `setup` object — so for them the key exists in the state and in the
   `onChange` but not on the component. The six dialog forms hold a `useState`
   per field (`CreateClubModal`'s `name` / `usernamesInput`) and are the real
   conversion.

3. **Errors are one object keyed by name, plus one key for the form-level
   message.** That key must be one a field cannot be named, since `name` is
   about to be required and free-form. Fields read `errors[name]`; the form
   renders the form-level entry on its bottom line.

   This shape does something a single message could not: **client-side
   validation can flag several fields at once**, while a server raise gives
   exactly one. Both write into the same object.

4. **`<Field>` does the matching, once.** Ten of the eleven field components
   render through it and it already owns the caption / control / error stack, so
   the lookup lives there rather than in eleven places.

### What the error system contributes

A `not-ok` envelope carries `severity: 'validation'` and an optional `field`,
taken from the raise's `COLUMN`
([docs/envelopes.md](../../docs/envelopes.md) → Field-level validation). So the form's
handler writes **one entry**: `errors[field]` when `field` is set, the
form-level key when it isn't.

**The name matching is free if `COLUMN` names the RPC's parameter.**
`common.anagrams(letters text)` raising `column = 'letters'`, an input named
`letters`, and `db.rpc('anagrams', { letters })` are then all one string derived
from the function signature — nothing invented on either side for the other to
guess.

### The setup dialog's own half — DONE 2026-08-28

The four dialog forms wrote field-keyed errors from the day they converted
(`CreateClubModal`: *"Same object as the server's answers — whoever noticed the
problem writes into one place"*). The **setup** dialog only did the server half.
Its frontend check runs through `manifest.setupForm.validate`, which returned a
bare `string | null` — no field name in it — so every game's own check landed on
`'_'` however specific it was. wordle's *"Legal guesses must reach at least band
5"* went to the bottom line while `<DictBandField name="legal_guess">` sat above
it already wired to `errors.legal_guess`.

`validate` now returns `FormErrors`, and the modal merges rather than inventing
a key. Nine games plus crosswords, thirteen validator functions. Two things fell
out of it:

- **scrabble's dictionary rule flags two fields**, which is the shape's
  advantage over a raise made concrete. Only the selects actually below the
  band are rung.
- **crosswords keeps `'_'` on purpose.** Its setup form is the un-converted
  layout exception and none of its controls carry a `name` yet, so a key naming
  a field that does not exist would draw nothing at all — a refusal with no
  message anywhere, which is worse than the bottom line.

**The name goes in the markup twice, both stamped by `<Field>`** (Joel, and his
second point is the one that widened it):

- **`data-field` on the WRAPPER** — the whole block, caption through error, is
  one addressable field. A test scopes to it and asks what THIS field says,
  rather than searching the page and hoping nothing else matches. Two components
  used to hand-place this on a control, which left the other ten with nothing
  and the wrapper — the part a caption assertion wants — with nothing anywhere.
- **`data-field-error` on the error span** — inside that block the error and the
  entry help are both spans of prose, and only the attribute tells them apart.
  `<FailureLine>` stamps itself `'_'`, since that is the key it renders.

`errorUnder(name)` and `fieldBox(name)` then read attributes instead of walking
up from a control guessing which span is the message: identity, not position.
And the form line is reachable at all, which it never was — it has no control to
walk up from.

**`fieldNames` reads the boxes now, not the controls**, which is what a setting
actually is. `player_user_ids.<uuid>` (a checkbox per friend) and `timer.seconds`
(the MM:SS box inside the timer's radio row) are parts, not settings; both left
the inventories, and `player_user_ids` and `timer` each appear once however many
controls they draw.

The shared field contract asserts all of it, so a component that forgets goes
red. Without it the tests were green through the whole defect: they handed a
component an error and checked it drew, which tests the wiring and never the
routing.


### Size, and why it is its own pass

**94 field instances, 72 without a name**, across every game's setup form:

| field | uses | missing `name` |
|---|---|---|
| `DictBandField` | 20 | 20 |
| `SelectField` | 18 | 12 |
| `RadioRow` | 17 | 8 |
| `TextField` | 14 | 14 |
| `ManualBoardField` | 7 | 7 |
| `NumberField` | 6 | 4 |
| others | 12 | 7 |

The names are not invented — a setup field's natural name is the key it already
binds to (`difficulty`, `word_count`, `band`) — but it is a sweep across sixteen
games, and **none of it blocks the RPC conversions**. Until it lands, a server
validation shows on the form's bottom line, which is where it shows today.

**Verification is the forms' own vitest tests**, not a runtime fallback — Joel:
*"field names change rarely; we can find out if errors work in the vitest tests
for the forms, which is arguably better anyway."* A runtime "show unclaimed
messages at the bottom" fallback was considered and rejected as overkill.

**One guard is worth having** on the SQL half: `column = 'x'` must name a
parameter of the function raising it, which is statically checkable in the same
vitest guard that checks the `PA`/`PN` codes.

### The bottom line itself: six sites still hand-write it

The form-level message has a component — `<FailureLine>` — and six surfaces
don't use it, writing `<p className="error">` against the `.error` utility
instead: `ChatBody`, `LoginScreen`, `ClaimHandleScreen`, `EditProfileModal`,
and, with literal text rather than a state variable, `SetupTimerSection` and
`SetupGameModal`. The two club modals converted with their RPCs
(2026-08-27); **the remaining six convert here, in this area** (Joel).

Each needs its parent's spacing checked rather than a blind swap: `.error`
carries `margin-top: 1rem` while `.failureLine` is `margin: 0` and leaves the
gap to the column it sits in, and `.failureLine` also sets
`var(--font-size-2)` where `.error` inherits. The two setup sites may want a
reserved line rather than a reflowing one.

## F49 · `setup-sections-become-fields` · A setup form is sections wrapping fields, and nothing else

**Raised 2026-08-28, from the error sprint.** Converting `create_game` game by
game kept running into the same shape: `setup/` holds four components that are
neither a field nor a plain wrapper, and each takes an ad-hoc slice of the
props a field would.

| | props it takes | `label` | `entryHelp` | `disabled` |
|---|---|---|---|---|
| `SetupTimerSection` | `help value onChange errors` | computed | — | — |
| `SetupCoopStyleSection` | `help mode players coopStyle firstTurnUserId onChange errors` | computed + one baked in | — | — |
| `SetupNextPuzzleSection` | `help brand seenBy load loadByDate onPick errors` | computed | — | — |
| `PlayersSection` | `members selfId value onChange numberOfPlayers error disabled` | computed (dots) | — | yes |

All four swallow `label` and compute their own caption; none takes `entryHelp`;
three cannot be disabled. `help` means two different things — the SECTION's
sentence in the timer, and in the next-puzzle section the section's while its
inner `<DateField>` carries a second, hardcoded one.

**The target (Joel, 2026-08-28):**

> "keep SetupSection, which is a light visual wrapper that has a summary that
> can be changed when the form value changes (perhaps by having Field
> subclasses take a callback for 'update summary', which the section uses to
> show the summary). And the specific sections … should disappear and become
> Field subclasses, and when the setupForm wants to put things in a setup, they
> do it the same way other parts do: put a SetupSection in the setupForm with
> the Field subclass in it."

So every setup body reads one way — sections wrapping fields — and `setup/`
holds `SetupSection` and nothing else of this kind.

### What the summary callback is actually for

A summary is usually derivable from the value — `Timer: none`, `Guesses: 7` —
and a pure `summaryFor(value)` beside each field would serve those. What it will
not serve is the puzzle field, whose summary is `2026-08-20: soup, spoon`: that
string does not exist until something fetches it, and the only component holding
it is the field that asked. So the field has to TELL the section, and that is
the case the callback is for.

**A fetching field is therefore not an obstacle to this design — it is the case
that motivates it.** "No field does I/O" describes the twelve that exist today;
it is not a property worth defending, and `load` / `loadByDate` are already
injected props, so the field would ask the question without knowing who answers.

The open question is the DIRECTION of the write. A child calling `onSummary` is
the shape recorded in [[project_no_setstate_in_effect]] — a prop callback evades
the lint rule and loops — but the fix recorded there ("parent derives instead")
is unavailable precisely because the parent cannot derive this one. Two
mechanisms that settle:

- **guard on change** — send only when the text differs from the last, so it
  settles after one pass; the loop comes from calling unconditionally;
- **a slot rather than a callback** — `<SetupSection>` renders a `summary` slot
  and the field fills both, so no parent state exists to loop.

### The one component that does not collapse

**`SetupCoopStyleSection` draws TWO fields** — `coop_style` and
`first_turn_user_id`, separate setup keys with different lifetimes (one
round-trips into the club's saved default, the other is stripped by
`create_game`). It has no single value to be a field around. Either it stays a
group, or the reveal-the-first-player conditional moves into each body — which
Joel has already called leakage.

`PlayersSection` collapses cleanly and is the obvious first conversion: already
one field (`player_user_ids`) plus a section.

**Not scheduled.** Raised while the error sprint was mid-roster; it touches all
sixteen setup bodies, so it waits for its own pass.

---

## F50 · `puzzle-source-picks-in-a-dialog` · Four ways to get a puzzle, four dialogs

**Raised 2026-08-28 by Joel**, while crosswords was the last game left in the
error sprint's `create_game` roster and the only one still unable to put a
setup message under a field.

> "the setup form is challenging because of the tab between the various puzzle
> sources… Validation for a puzzle source can be hidden when on a different tab
> [and] the form gets really complex because of needing to handle several ways
> to get puzzles *and* all of the UI which is hidden 2/3rd of the time."

### The problem, stated exactly

`src/crosswords/components/SetupForm.tsx` is **472 lines** and holds four
puzzle-source bodies at once — library, NYT, Guardian, upload — behind a
segmented control writing `setup.source`.

**All four stay MOUNTED**, stacked in one grid cell with the inactive three
`visibility: hidden` (`.tabStack`), so the block is always as tall as the
tallest (the library's 8-row list) and switching tabs never resizes the dialog.
That is a real problem solved a real way, and it is also why the file is what
it is: four `useState`s that belong to one tab each, four `onClick` handlers
that clear `board` + `filename` on the way out, and two `useEffect` fetches.

**The structural fault is the hidden one.** A refusal about a source is
attached to controls that may not be on screen — the setup dialog can be told
"that board needs dictionary 5" while showing the library list. Nothing in the
error system can fix that from the outside: it is what a tab model permits.

It is also why crosswords is the one game whose `validate` still returns
`'_'`. None of its controls carry a `name`, so there is nothing for a message
to land under (see [F48](#f48--form-state-and-field-errors--a-form-is-one-keyed-object-and-errors-are-too) → the setup
dialog's own half).

### The design (Joel's)

**One field, `source`: four buttons.** Pressing one opens a
modal-blocking dialog specific to that source. Its whole job is to let the
player choose — or cancel — and hand back what starting a game with that puzzle
needs.

**Choosing CLOSES it.** No "Use this puzzle" footer button, because that would
make the common path two presses where it is one today. Clicking a library row
picks and dismisses; so does Enter on it. Joel, 2026-08-28:

> "our SelectionList is always better when we can use RETURN to mean 'do the
> thing' (so you can arrow + press return to choose and close, just like
> clicking)"

`SelectionList` already has exactly these two modes as a discriminated union:
`selected` / `onSelect` (Enter records a choice) versus `onActivate` (Enter does
the thing). The library picker is on the first arm today **because** Start lives
in the dialog around it. Inside its own dialog it moves to the second, which is
the arm the component was built for. No component change — the other arm of a
union that already exists.

### Why this shape and not the others

| | fixes the 472 lines | fixes hidden validation |
|---|---|---|
| extract each tab body into a component, keep tabs | yes | **no** |
| source becomes a field, render only the ACTIVE body | yes | **no** — the error still hangs off a body that may not be shown |
| **four dialogs** | yes | **yes** — what is validated and what is on screen are the same thing |
| a wizard: the setup dialog BECOMES the picker | yes | yes, but hides players + timer while picking |

**Nesting is already proven here**: `SetupGameModal:298` opens Help on top of
itself and stays open behind it.

### What the field's value is

**No change to `setup`'s keys and none to `create_game`.** Each dialog writes
the keys its source already writes — `puzzle_id` · `date` + `weekday` ·
`series` · `board` + `filename` — through the same `set()` the form uses now.

What the FIELD shows is a **sentence**, built from whichever keys are set.
`Puzzle:` because `SetupNextPuzzleSection` already uses exactly that word for
connections and strands — the same idea, so the same prefix.

| state | summary |
|---|---|
| nothing chosen | `Puzzle: choose one` |
| library | `Puzzle: Bee Season · Patrick Berry` |
| NYT by weekday | `Puzzle: NYT Monday · 2026-08-24` |
| NYT, that weekday used up | `Puzzle: NYT Monday · none left` |
| NYT by explicit date | `Puzzle: NYT 2026-08-24` |
| Guardian | `Puzzle: Guardian Quiptic` |
| upload | `Puzzle: Bee Season · moth.puz` |

**That summary is load-bearing, not decorative**, and it is the one thing this
design can get wrong. The NYT picker's entire value is the resolved date — which
Monday you will actually get, or that Mondays are used up. Once that lives
inside a dialog you have closed, the summary is the only place it exists. A
summary reading "NYT" would lose the thing the player opened the picker for.

**Upload names the puzzle AND the file** (Joel, 2026-08-28: *"both"*). It can,
because the file is parsed at DROP, not at Start — `importCrosswordFile` runs in
`handleFile` and `setup.board` holds the whole grid from that moment, which is
also why a bad file is refused there rather than at Start. So the title is known
by the time the picker closes. Both halves earn their place: the title is what
the puzzle IS, and the filename is what you would check to know you grabbed the
right one — a `.puz` title is often absent or machine-written ("NY Times, Mon,
Aug 24, 2026") while the filename is the thing you recognize. A file whose meta
carries no title falls back to the filename alone.

Two facts are deliberately dropped, both because they are guidance for CHOOSING
and so belong where you choose: the NYT "back to 1993-11-21" tail on the
used-up line, and the Guardian series' character hint ("each clue is wordplay +
a definition"). The dialogs still say them in full.

### The pieces

1. **`PuzzleSourceField`** — four buttons, `name="source"`, its value the
   sentence above, wearing `error={errors.source}`. This is what closes
   the crosswords half of F48: a server validation naming `source` draws
   beside the buttons, visible whichever source was used.
2. **Four dialogs**, one file and one test each:
   `LibraryPickerDialog` (owns `library_for_club` + the filter box),
   `NytPickerDialog` (the weekday choice and the date override),
   `GuardianPickerDialog` (the series list),
   `UploadPuzzleDialog` (owns the drop zone, `importCrosswordFile`, and the
   three upload `useState`s).

   **`next_nyt_date_for_club` stays in the FIELD, not the dialog** — the
   resolved date depends on `seen_by`, the player set, which lives in the setup
   form. Unchecking someone after picking NYT Monday changes which Monday you
   get, and a date computed once inside a closed dialog would be quietly wrong.
   So the dialog chooses a weekday and the field asks what that weekday resolves
   to, re-asking when the player set changes — which is what
   `SetupNextPuzzleSection` already does for connections and strands, including
   the three-state handling that keeps "still asking" from reading as "none
   left".
3. **The setup form shrinks** to the players picker, `PuzzleSourceField`, and
   the timer.

### What it deletes

- `.tabStack` / `.tabBody` / `.tabHidden` and the always-mounted stack
- the four `onClick`s that clear `board` + `filename` when leaving a tab —
  canceling is a real affordance now, rather than a silent side effect of
  pressing a different tab
- `uploadBusy` / `uploadError` / `dragOver` / `query` from the setup form
- both `useEffect` fetches, into the dialogs that need them

### Accepted losses

- **The library list's scroll position** across a round trip. A dialog that
  unmounts loses it; today `.tabStack` preserves it deliberately.
- **The dialog's fixed height.** The `.listBox` height exists so the three tabs
  agree; with one field and no stack, the setup dialog is as tall as its own
  content and the pickers size themselves.

### Sequence

Crosswords' `create_game` is the last entry in the error sprint's board-builder
run, and it is BLOCKED on this: converting it without this would leave its
messages on the form line, which is where they already are, so there would be
nothing to show for it. Do F50 first, then convert `create_game` against a form
that has a field to route to.

### BUILT 2026-08-28

`SetupForm.tsx` went from **472 lines to 66** — the players picker,
`PuzzleSourceField`, and the timer. What it grew instead is four picker
components with a test each, which is the trade the finding argued for.

Named for what they ARE. Joel, mid-build: *"the pickers are going to be blocking
modals, not dialogs. putting 'Dialog' in their name is a mistake."* `dialog` is
a different `FloatingPanel` family — draggable, no scrim — so the four are
`*BlockingModal`, matching `CelebrationBlockingModal` and this game's own
`CrosswordsNumberJumpBlockingModal`.

Three things the build settled that the design did not:

- **No new setup key for the library title.** The caption needs a puzzle's NAME
  and only its id is in `setup` — but `create_game` strips `puzzle_id` from the
  club's saved default (`setup - 'puzzle_id' - 'date'`), so a reopened dialog
  never arrives holding a puzzle whose title would have to be looked up. It is
  chosen and shown within one lifetime of the field, which is local state.
- **The Guardian hint stopped being its own thing.** One hint used to sit under
  the `<select>`, describing whichever row was chosen; as a list every row
  carries its own, so they are `.rowNote` like the NYT weekday notes. The
  dead-class guard is what pointed this out.
- **`summarize` and the weekday table left the component files** — `lib/
  puzzleSummary.ts` and `lib/nytDays.ts`. Fast refresh only works when a file
  exports components alone, which is the compiler making the same point about
  where data belongs.

**A picker must be PORTALED, and that is the one thing here that had to be
found by looking.** It read as the layer system failing — the screen dimmed and
nothing appeared on top. But `--z-modal-blocking` (5000) is correctly above
`--z-modal-normal` (2200); a z-index only ranks a node against its siblings
inside the nearest stacking context, and the setup panel makes one, because it
is draggable and react-rnd inlines a `transform` on it. A picker rendered as a
child is pinned inside the setup dialog's own 2200 and paints underneath it,
while its scrim — fixed-position and full-viewport — dims the screen perfectly
well.

`SetupGameModal` sidesteps this for the game's Help by rendering it as a SIBLING
of the panel rather than a child. A FIELD cannot: it is several levels inside
the form. So it leaves the tree with `createPortal`, which is safe here because
the game's tokens are on `:root` and still resolve from the body.

**Open question this raises, not answered:** should `BlockingModal` portal
ITSELF? The category's whole claim is "nothing underneath is live", which is
false whenever one is opened from inside any draggable panel — a trap the next
person will fall into exactly as this did. It is a change to a shared shell with
six existing consumers, all currently working because they happen to be mounted
at the top level, so it wants its own decision.

**The field takes `AllFieldProps`, and it did not at first.** Joel, on reading
it: *"why does the PuzzleSourceField, which is a field, not use the
AllFieldProps? all fields are supposed to have compatible signatures. it missing
things (at least two that I noticed: help and helpEntry)."*

It had grown its own props — `values` + `set`, no `help`, no `entryHelp`, no
`disabled`, no `className`. Its value is a `PuzzleChoice`: every key the four
pickers write, replaced whole rather than patched key by key, so that "nothing
from the source you left survives" is a property of the TYPE instead of a rule
the caller keeps. That matters most for `board` — an uploaded solution grid left
behind would leak the answers.

**Two guards were missing the class of mistake entirely**, which is why nothing
caught it:

- **`expectFieldContract` never asserted `help` or `entryHelp`** — the exact two
  Joel spotted. It checked the caption, the error, the name and `disabled`, so a
  component could forward four of six and pass. It asserts both now, for all
  thirteen fields.
- **`fieldTests.test.ts` only read `common/components/fields/`.** A field in a
  game folder was invisible to it — no test file required, no contract required.
  It walks every `*Field.tsx` under `src/` now, and separately requires that
  each one outside `fields/` actually CALLS the contract, since having a test
  file and being held to the family's terms are different things.

**A picker must TAKE FOCUS**, and this was the second thing that looked like a
shared-system bug and was not. Joel: *"when the puzzlesource blocking modal is
up, pressing escape closes that AND the puzzle setupGame modal."*

`usePanelEscape` answers Escape with "the panel focus is IN, else the topmost"
— one listener, one panel closed, exactly as designed. But you open a picker by
CLICKING a source button, and that button lives in the setup dialog, so focus is
still there: Escape resolves to the setup dialog, closes it, and the picker goes
with it, because a field inside that dialog is what renders it. Two panels, one
key, and neither component is at fault.

`useFocusTrap` says so outright — *"initial focus lives elsewhere: the leaf's
`autoFocus` on its primary button"* — and both shared blocking modals do exactly
that. The pickers could not: `SelectionList`'s `autoFocus` yields to anything
already focused, which is right for a list on a page and wrong inside a modal
that owns the keyboard. Each picker focuses on mount now — the LIST, not Cancel,
so the arrows work the moment it opens; the upload picker focuses its drop
target.

**Two e2e files were rewritten and NOT RUN.** `puzzle-pickers.e2e.ts`'s
crosswords test drove the tabs in detail — a `<select>` for the weekday, a
`p[class*="nextDate"]` state line — and none of that exists now; it reads the
caption instead, and gained a cancel test for the affordance the tabs never had.
`crosswords.e2e.ts`'s upload test waited on "click to replace" inside the
dropzone, which cannot appear now that a parse closes the picker.

Related: [F48](#f48--form-state-and-field-errors--a-form-is-one-keyed-object-and-errors-are-too) (the errors object and the
`data-field` stamps), [F49](#f49--setup-sections-become-fields--a-setup-form-is-sections-wrapping-fields-and-nothing-else) (a fetching
field is still a field — these four dialogs are that argument at full size),
and `plans/selection-lists.md` (the crosswords library row, which moves from
`select` to `activate`).
