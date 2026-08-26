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

**Nineteen findings. FOUR RESOLVED** — F8, F9 (the button work), F38, F40 — **one
CLOSED and moved out** (F32 → the FreeBee pair) — **fourteen open:** F13, F30,
F31, F33–F37, F39, F41–F46. F43–F46 were raised by the button
work rather than by the audit, which is expected: §21 says a finding is not
required to have come from the audit, and takes the next free number.

## The roster — 20 files

Agreed 2026-08-25 before anything was read. All paths under `src/common/`.

**The shared field vocabulary (13)**

```
components/fields/CoopStyleField.tsx      components/fields/CoopStyleField.module.css
components/fields/CoopStyleField.test.tsx components/fields/DifficultyField.tsx
components/fields/DifficultyField.test.tsx components/fields/NextPuzzleField.tsx
components/fields/NextPuzzleField.module.css components/fields/RadioRow.tsx
components/fields/SelectField.tsx         components/fields/SelectField.module.css
components/fields/TimerField.tsx          components/fields/TimerField.module.css
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
hooks/game/useGameTimer.ts   (formatTimerSeconds — TimerField)
lib/game/timerLabel.ts       (the disclosure summary — TimerField)
lib/game/difficulty.ts       (DIFFICULTY_LABELS + samples — DifficultyField)
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
   the area itself**: `<TimerField>` hand-writes the radio group that
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

## MOVED-IN · F13 · `setup-form-monospace` · Five setup forms set `font-family: monospace`

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

## F30 · `timerfield-hand-radios` · The one hand-written radio group left in the app is inside the area

`<RadioRow>` exists to render exactly this markup, and **adoption is otherwise
complete**: measured across `src/`, there is not one `type="radio"` outside
`components/fields/`. The single hold-out is `TimerField.tsx:91–129`, which
hand-writes the None / Up / Down triple.

It pays for that with a duplicate stylesheet. `TimerField.module.css` vs
`setupForm.module.css`:

| rule | setupForm | TimerField | differs by |
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

## F31 · `letter-input-unnamed` · The same field type, declared four times under four names

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

## F33 · `placeholder-copied` · A placeholder treatment lifted wholesale, and the file says so

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

## F34 · `label-above-control` · Three copies of "a small bold label above a control", differing by a hair

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

## F35 · `two-box-chromes` · `.fieldset` and `<SetupSection>` claim to match and don't

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
`TimerField` and `CoopStyleField`), while **4 use the raw `.fieldset`**
(codenamesduet, spellingbee, wordwheel, and `NextPuzzleField`). Several forms use
both.

The question is not which values win — it's whether a setup form has ONE box
type with a collapsible variant, or genuinely two. If it's one, the padding
difference is the only thing to reconcile, and it exists because the summary is a
click target and the legend isn't.

## F36 · `stack-repeated` · A flex column with a gap is the most-repeated shape in the area

`display: flex; flex-direction: column; gap: 1rem` is declared three times —
`setupForm.module.css .setup`, `CoopStyleField.module.css .controls`, and
crosswords' own `.setup` — and `CoopStyleField`'s comment justifies its copy by
pointing at the original (*"the same 1rem rhythm the setup form uses"*). Near
misses at other gaps: bananagrams `.dictRow` (0.6rem), spellingbee/wordwheel
`.field` (0.3rem), `SelectField .field` (0.35rem).

`CoopStyleField.module.css` is a 13-line file whose entire content is one such
stack. **§7's "not patterns, though they look like it" may well cover this** —
check it before proposing a `.stack`; the answer may be that the shared `.setup`
should simply be reachable, not that a new utility is owed.

## F37 · `crosswords-rolls-its-own-field` · A third copy of the puzzle picker, and a control that re-declares the field chrome

crosswords' `SetupForm` is the one form that opts out of the shared vocabulary,
and it is worth stating precisely because the DECISION is this area's even though
the EDIT lands in crosswords':

- **Two raw `<select>`s** (`SetupForm.tsx:326`, `:378`) — the only ones left in
  the app outside `fields/`. Both wear a local `.search` class instead of
  `<SelectField>`.
- **`.search` re-declares the field chrome, and drifts on every axis**:
  `border-radius: 6px` (a literal — `--radius-md` IS `6px`, base.css:85),
  `border: 1px solid var(--page-surface-border-color)` where every other field
  uses `--field-edge-color`, `padding: 0.4rem 0.6rem` vs `SelectField`'s
  `0.6rem 0.9rem`, `font-size: 0.95rem` vs inherited.
- **`.nextDate` is `NextPuzzleField`'s `.next`**: same `--page-text-color`, same
  `min-height: 1.4em`, same stated reason (don't let the timer below jump when
  the RPC lands). crosswords also hand-rolls the date-override input beside it.
- **`.dropzone` carries `border-radius: 8px`**, a second unconverted literal.

crosswords has a real reason not to use `<NextPuzzleField>` — its archive is a
catalogue, not a queue (a Monday puzzle and a Saturday one differ), so it picks a
WEEKDAY. But the fixed-height preview line and the date override are the same
mechanism, and its own comment says so: *"the same shape connections and strands
carry"*.

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

## F39 · `wrapper-tones-are-fiction` · Seven purpose buttons document tones that have never existed

**Re-slugged 2026-08-25, not silently** (§21 allows it when the subject genuinely
changes). It was `actionbutton-says-action`, and that subject is gone:
`ActionButton`'s stale docstring and the orphaned `/** */` block went with the
file. The problem did not go with it — and it is larger than the original
finding said.

`ButtonTone` is, and has only ever been, five words: `quiet · normal · caution ·
destructive · success`. Seven wrapper docstrings name something else:

| tone named | files | what the code actually passes |
|---|---|---|
| `info` | `ExchangeButton` · `NewGameButton` · `RestartButton` · `SharePreviewButton` | `normal` |
| `error` | `EndGameButton` · `RevealButton` | `destructive` |
| `action` | `BackToClubButton` | `normal` |

`info` and `error` are the OUTCOME palette's words — which is the confusion the
bucket split exists to prevent: *"a control saying 'this is irreversible' is a
different question from a game saying 'you lost', even where the two hexes agree
today."* A docstring that calls a button's red the `error` red teaches exactly
the coupling the tokens were separated to deny.

`action` is the retired name, and it retired because it collided with one of the
fourteen KINDS. Mechanical fix, no decision attached.

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
| sites | club page's mobile tabs + its coop/compete/all filter, crosswords' source picker | 8 setup forms + `CoopStyleField` |

Both files argue their own shape well (segmented's comment: *"Separate buttons
with a gap read as independent toggles you could press several of — which is
exactly what these aren't"* — which, read straight, is an argument against
`RadioRow`'s spacing). Neither says when to reach for which, and **crosswords'
setup form uses the segmented control** — so the line is not "segments are for
the club page".

The answer may well be "radios inside a form, segments for filtering a view".
That is a one-sentence rule the area can write; today it isn't written anywhere.

## F42 · `local-module-alias-drift` · The shared setup stylesheet is imported under four names

Measured across the 15 importing files: **`styles` ×11**, **`form` ×3**
(bananagrams, wordle, strands), **`shared` ×1** (boggle). A game's own module
then takes whichever name is left — `local` in wordwheel, `styles` where there is
no shared import. So `styles.checkRow` means the shared class in one file and a
local one in the next.

Cosmetic, and listed only because it defeats the obvious grep: searching for
`form.fieldset` finds three of the seven `.fieldset` sites.

---

## Predicted test breaks (§21 — predict, write them down, leave them)

Nothing has been changed yet, so this is the watch-list rather than a prediction
of damage. The specs that pin this area's current shape:

| spec | what it pins | how it breaks |
|---|---|---|
| `src/guards/vocabularies.test.ts` | the per-file allowlist of unconverted literals — five roster files are named (lines 268–272, 348, 422–423, 522–523, 539) | **any** value converted here must DELETE its allowlist entry, or the guard fails on an entry that no longer matches |
| `src/guards/csStamps.test.ts` | every file has one of the seven stamps | a NEW file (the F31 component, the F9 button) fails until stamped |
| `src/common/components/buttons/ActionButton.test.tsx` | the tooltip contract (`data-tooltip` defaults to label; no native `title`; `iconOnly` keeps `aria-label`) | F9 adding a label-only form button must keep the contract or extend the spec |
| `src/common/components/fields/CoopStyleField.test.tsx` | renders nothing for compete/solo; the re-seed effect | F30's `RadioRow` API change touches this component's markup |
| `src/common/components/fields/DifficultyField.test.tsx` | all six bands listed as `N: Label: SAMPLES`, out-of-range disabled | only if `SelectField`'s option rendering moves |
| `src/guards/setupRows.test.ts` | every game's setup recap — **not this area's markup**, but it is the other place a setup field's existence is asserted | adding/removing a setup FIELD (none proposed) |

**No e2e spec references this area's components or classes** (measured across
`e2e/` for `SetupSection`, `setupForm`, `RadioRow`, `SelectField`, `TimerField`,
`ActionButton`, `letterInput`, `checkRow`). The setup dialog is driven in e2e by
role and label, not by class — so a rename here is cheap and a MARKUP change
(F30's `<label>` nesting) is the one to watch.

## Notes

- **`vitest` CSS modules are proxies**: `css: false` fabricates any class name
  asked for, so a render test can never prove a class EXISTS. Anything F31/F34
  consolidate needs a static guard, not a render assertion.
- Every CSS rule in all 20 files still carries `/* @@ */`. Per §15 that means
  **undecided until Joel removes it** — the audit read them, it did not bless
  them.
- **F30, F31, F32, F34, F36 are one shape seen five times**: a component that
  exists (or should) and a stylesheet that re-declares it anyway. If they resolve
  together, two whole game stylesheets (spellingbee's and wordwheel's) and one
  shared one (`CoopStyleField.module.css`) are deleted rather than edited.

## F43 · `line-height-3-orphaned` · A vocabulary step with no consumer left

**Raised by this area's own work, and the guard is red on it.**
`src/guards/cssTokens.test.ts` → "every defined token is referenced (no dead
tokens)" now fails on `--line-height-3` (`base.css:159`).

Measured at the commit before: it had **exactly one consumer in the whole repo**
— `ClubGameDeleteButton.module.css:27`, hand-tightening the line-height of the
corner delete button — and `<StandardButton>` absorbed that when the button
started declaring its own type. So the step was one edit from dead before we
touched it.

**Why it was left red rather than fixed.** The standard button takes
`line-height: normal`, chosen after measuring: `1` shaves 2px off every button in
the app. And no ramp step fits — `normal` computes to about 1.12 for this face,
between steps 2 and 3. So the honest choices are to delete the step or to find it
a real home, and **deleting a step from a declared vocabulary is not this area's
call**. Inventing a consumer to make the guard green is the thing
[[verify-guards-by-planting]] exists to forbid.

## F44 · `field-tokens-on-buttons` · Two authors independently painted a button out of a form field

`crosswords/components/Controls.module.css .btn` (three uses — the pencil/pen
toggles and the clear-scope control) and
`floating-panels/GameScratchpadCompanion.module.css .takeOver`. Neither shares a
line of code with the other, and they agree on every paint decision:

| | `.btn` | `.takeOver` |
|---|---|---|
| border | `1px solid var(--field-edge-color)` | `1px solid var(--field-edge-color)` |
| background | `var(--field-fill-color)` | `var(--field-fill-color)` |
| color | `var(--page-text-color)` | `var(--page-text-color)` |
| radius | `6px` literal | `6px` literal |
| size | `--iconButton-size` square, `padding: 0` | `padding: 0.15rem 0.5rem` |

**Two things are wrong and they are different.** The literal `6px` IS
`--radius-md` (`base.css:85`) — plain unconverted debt, and the same literal F37
finds in crosswords' `.search` and `.dropzone`. The tokens are the more
interesting half: `--field-*` is a form FIELD's edge and fill, and these are
buttons. The two vocabularies happen to sit close in light mode, which is
precisely why nobody noticed; they are separate names because they answer
different questions and are free to diverge.

`.btn` is the sharper case — it sizes itself with `--iconButton-size`, so it is
literally the standard button's icon-only box wearing a field's paint.

`GameScratchpadCompanion` was already flagged for this in docs/ui.md as *"one
case genuinely unsettled … could reasonably be `button secondary` in the quiet
tone"*, deferred to "next time the scratchpad is open". This is that time for the
decision, even if the edits land in two other areas.

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

## F46 · `ui-doc-describes-deleted-classes` · docs/ui.md documents a component and five classes that no longer exist

`docs/ui.md` names `ActionButton` 6 times, `` `.button` `` 12, `icon-only` 12,
`icon-button` 3, `button-small` 3, and `patterns/button.css` once — all of them
deleted on 2026-08-25. The button taxonomy, the iconography section and the
semantic-button roster all describe the old arrangement.

**Not a defect to fix now.** The sprint distributes into `docs/` at the END
(§13), and rewriting a doc that the remaining nine findings will move again is
work done twice. Filed so the rewrite is a known, sized piece of the sprint's
docs step rather than a discovery — and so nobody reads that section in the
meantime and believes it.

