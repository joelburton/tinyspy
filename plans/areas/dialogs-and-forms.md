# Area: dialogs-and-forms

The second area of the CSS sprint's step 7. The process is
[css-system-2.md](../css-system-2.md) §21; the plan holds the order, this file
holds everything else.

**Opened 2026-08-24.**

**Scope, set by Joel when the area opened:** this area is **the machinery and
the shared look**, not an audit of every form and dialog in the app.

> "if we rename the react component for a prop setup form, we would consider
> forward-fixing that in the specific setup forms. But this area isn't a global
> audit of forms + dialogs, rather the machinery and shared look and features of
> them."

So the instances — `EditProfileDialog`, `EditClubDialog`, `FaultDialog`,
`WordEditDialog`, the sixteen game `SetupForm`s, crosswords' three, scrabble's
`BlankPicker` — are **consumers**. A rename or signature change here
forward-fixes them in the same commit (§21's compile-break rule) and **their
stamps do not move**. If one of them turns out to be the only evidence for a
shared question, it gets surfaced and asked about, not audited.

**Every heading says its status**, the convention `plans/areas/homepage.md`
arrived at: a heading with **no status prefix means OPEN**.

## The roster — 27 files

Agreed 2026-08-24 before anything was read.

**The panel machinery (8)**

```
src/common/components/floating-panels/FloatingPanel.tsx
src/common/components/floating-panels/FloatingPanel.module.css
src/common/components/floating-panels/ConfirmationBlockingModal.tsx
src/common/components/floating-panels/modalActions.module.css
src/common/hooks/ui/useConfirmation.tsx
src/common/hooks/ui/useDraggablePanel.ts
src/common/hooks/ui/useDraggablePanel.test.ts
src/common/hooks/ui/useFocusTrap.ts
```

**The shared form vocabulary (16)**

```
src/common/components/fields/CoopStyleField.tsx   + .module.css + .test.tsx
src/common/components/fields/DifficultyField.tsx  + .test.tsx
src/common/components/fields/NextPuzzleField.tsx  + .module.css
src/common/components/fields/RadioRow.tsx
src/common/components/fields/SelectField.tsx      + .module.css
src/common/components/fields/TimerField.tsx       + .module.css
src/common/components/fields/setupForm.module.css
src/common/components/setup/SetupSection.tsx      + .module.css
src/common/components/setup/SetupDisclosure.tsx
```

**F44's implementation site (3)**

```
src/common/components/buttons/ActionButton.tsx + .module.css + .test.tsx
```

**Added by the work (3, all new):** `floating-panels/BlockingModal.tsx`,
`floating-panels/AcknowledgeBlockingModal.tsx`, `hooks/ui/useAcknowledge.tsx`.

**Deliberately NOT on the roster**, each with the reason:

| | why |
|---|---|
| `SetupGameDialog` + `.module.css` | Joel, 2026-08-24: addressed at `club-page`, "since that's where they first appear". Which also means **F36 (`createclub-modal`) has no modal to land on here**, so `homepage` stays paused past this area |
| `CelebrationDialog`, `SuspendConfirmDialog` | punted to the first game area |
| `ClaimHandleScreen` | `simple-page`'s; F44's answer reaches it there |
| `Menu`, `GameScratchpad`, `HelpPanel`, `FloatingChat`, `DefinitionPopover`, `ClubHelp`, the per-game `Help.tsx` | floating panels, but none is a dialog or a form |

---

## RESOLVED · F1 · `workspace-implies-writing` · The companion layer was named after the one member you type into

`z-workspace` was picked off the scratchpad. Help, a setter's note and a clue
explainer are read-only; chat is the only other one you write in. Joel,
2026-08-24: *"'workspace' implies a kind of 'you can write here', but very few
of these allow that. 'companion' suggests something you keep nearby without the
implication of editing."*

**Shipped:** `--z-workspace` → `--z-companion`, its `DECLARED_AHEAD` entry, the
guard's fix-message, eleven sites in §20. Chat is classed a companion but does
**not** take the family word — it lives at `z-chat`, so a name saying companion
would point at the one layer it deliberately avoids.

## RESOLVED · F2 · `panel-means-nothing` · "Panel" named a kind of thing and the kind had no definition

Claude called connections' `HintList` a "panel" while cataloguing the
dialog-like things. It is a readout in the info column's flow — no rect, no
titlebar, no ✕, nothing to dismiss. The word invited the mistake.

**Shipped:** **floating panel** is the umbrella, in full, always — a window-like
thing that floats over the page. **"Panel" alone is banned** in prose, docs and
component names; a module-scoped CSS class may keep it. **"Draggable panel"** is
the prose name for the subset you can drag. `FloatingPanel` and
`useDraggablePanel` keep their names because they describe an implementation and
a behavior (Joel: the shell's whole subject IS its floating-ness).

The category and the component being the same words is normally the collision
§20 refuses for `modal`; it is safe here because the category is *defined as*
the things built on that shell.

## RESOLVED · F3 · `folder-by-target` · Two buttons were filed under what they open

**Shipped**, three folder moves:

- `components/panels/` → `components/floating-panels/`
- `Menu` → `components/menu/`, top-level. **Singular on purpose** (Joel):
  *"there's one menu, it contains different things."*
- `components/chrome/` → `components/page-header/`, taking
  `PageHeaderPlayersStrip` + `PageHeaderStatusSlot` from `game/` and
  **`ChatButton` + `ScratchpadButton`** — header marks that OPEN a floating
  panel rather than being one.

The follow-on worth remembering: **`vocabularies.test.ts`'s shrinking allowlist
is keyed BY FILE PATH.** A stale row fails as "listed but no longer offends"
*and* silently stops protecting a converted file.

## RESOLVED · F4 · `dialog-names-wrong-family` · "Dialog" named four different families

**Shipped for the strictest one:** `ConfirmDialog` → `ConfirmationBlockingModal`,
`useConfirmDialog` → `useConfirmation`, `confirmDialog` → `confirmationModal`.
40 files; every e2e change was a comment, since no selector used the name.

**"Confirmation" over "confirm"** (Joel): *"'confirm' is a general verb that
often means 'is this ok?'; 'confirmation' suggests more of a stop-and-ask."*

**The grammar this settles, for every later rename:** the member word appears in
a component name **when the member is MARKED** — `blocking`, `fault` — and
`normal` stays unmarked, so a modal-normal is just `…Modal`. A token cannot do
this (`z-modal` alone would be ambiguous, §20), but a component name is read at
a call site with its props visible, and the misread that matters is
blocking-vs-normal.

**The rest of the roster is §20's Open item 4**, deliberately not done one
rename at a time: `HelpPanel`, `CluePanel`, `infoPanel.module.css`,
`SuspendConfirmDialog`, `NoteDialog`, `ExplainDialog`, `AnagramDialog`,
`WordLookupDialog`, `WordEditDialog`, `EditProfileDialog`, `EditClubDialog`,
`NumberJumpDialog`.

## RESOLVED · F5 · `blocking-hand-assembled` · The strictest category was four props and a hook call, copied

`ConfirmDialog` and `FaultDialog` each wrote out `draggable={false}`,
`resizable={false}`, `backdrop`, a size, a `useFocusTrap` call, and a footer
`<div>` with the shared class. Four things that had to agree and nothing making
them.

**Shipped: `<BlockingModal>`.** It bakes all of it, and the docstring says why
none is a prop — `backdrop` because "dim" here literally means inert;
immovability because it IS the category's visible signal; the trap because
otherwise "nothing underneath is live" stops being true the moment you press
Tab.

**It takes an `actions` slot** rather than leaving each leaf to write the footer
row: the row's markup is written once, and "body above, actions below" becomes a
shape the modal guarantees rather than a convention three files follow.
`modalActions.module.css` now has an owner.

`ConfirmationBlockingModal` exposes **no** slot — a confirmation is always a
question, a body, and two buttons, and sixteen callers passing their own footer
is sixteen chances to disagree about order or weight.

**`primaryButton: 'confirm' | 'cancel'`**, one prop, because **primary = Enter**
(Joel): the filled button and the Enter target are one decision, never two.

## RESOLVED · F6 · `cancel-null-is-a-second-act` · A notice was smuggled through a flag

`cancelLabel: null` turned the confirmation into a one-button notice — a
different act wearing the same API, resolving a boolean no caller could act on.

**Shipped:** `<AcknowledgeBlockingModal>` + `useAcknowledge`, resolving `void`.
The flag is gone from `useConfirmation` entirely.

**Two callers, not one** — connections' "No more puzzles" and strands' "No
unplayed puzzle", whose comment cites connections as the shape it copied. Both
converted; they were the only compile breaks, exactly as predicted.

**Not a toast** (Joel, 2026-08-24), though it was raised: a dead end is worth
interrupting for — the player pressed New game and nothing happened, so
something has to say why, and be seen rather than glanced at.

## RESOLVED · F7 · `two-modal-sizes` · Two hand-written sizes, 420×240 and 460×280

Nothing in either file said why. The plausible reason is that the fault carries
three paragraphs where a confirmation carries one.

**The heights are gone.** §20's resize test says content knows the height here,
so `BlockingModal` sets `fitContent` and neither number survives.

**Measured, because `fitContent` governs HEIGHT ONLY** — width still comes from
`defaultSize`, whose default is 480, so the first cut silently widened both:

| | before | after | overflow |
|---|---|---|---|
| confirmation | 420 × 240 | 420 × 200 | none |
| fault | 460 × 280 | 460 × 200 | none |
| fault, 40× repeated message | 460 × 280, would clip | 460 × **552**, re-centered | none |

The third row was planted to prove the fit GROWS rather than sitting on the
floor. It does.

**The width is 420, and it is not a prop** (Joel, 2026-08-24): *"pick one of
420 or 460; I'm sure that is difference without distinction."* Two hands, no
decision — so the category gets ONE width, and a modal that needed to be wider
than its siblings would be claiming something about itself that isn't true. The
fault, the only 460, came down to 420 and re-measured clean:

| | box | overflow | button inside |
|---|---|---|---|
| fault, short | 420 × 200 | none | yes |
| fault, 40× repeated message | 420 × 552 | none | yes |

**One thing left unexamined, and it is small:** `minHeight: 200` is what both
modals actually sit at, since their content is ~165px — so in the ordinary case
the FLOOR is choosing the height, not the fit. The floor is inherited from
`FloatingPanel`'s resizable-panel defaults, where a minimum stops you dragging a
panel shut; a blocking modal cannot be resized, so it may not want one at all.
Nothing looks wrong today. Noted rather than changed.

## F8 · `confirm-buttons-are-raw` · The confirmation's buttons bypass the tone system

Both are `<button className="button primary">` / `"button secondary"`, not
`<ActionButton>`. Meanwhile `ButtonTone` describes `destructive` as "End /
Concede" and `quiet` as "a dialog's Cancel" — and no dialog uses either, while
`END_GAME_CONFIRM` and `RESTART_CONFIRM` are exactly the destructive cases.

Joel, 2026-08-24: *"we're tackling floating panels before form buttons — so
leave them as raw, and we'll decide later on whether they become something
else."* Folded into **F9**.

## F9 · `action-button-text-only` · Are a form's buttons really different from action buttons?

Inherited from `homepage` as F44 and still the area's headline question.
`<ActionButton>` requires a glyph, so it has an `iconOnly` and no `labelOnly` —
and **a Cancel is hand-written seven times**: `ConfirmationBlockingModal`,
`SetupGameDialog`, `EditClubDialog`, `EditProfileDialog`, `ClaimHandleScreen`,
`CreateClubPage`, scrabble's `BlankPicker`. `WordEditDialog:306` is an eighth
site but a **Delete**, and a separate decision.

Two knock-ons: making `icon` optional needs `.icon-button`'s `gap: 0.4em`
MEASURED with no icon, and it would give `tone="quiet"` its first caller.

## F10 · `fault-tier` · The fault rides the shared default, so an open chat covers it

It is a `modal-fault`, a rung above blocking, precisely so an error stays
readable mid-question. `BlockingModal` takes `zIndex` and **deliberately does
not default it**, so no pixel moved: moving one component alone ranks it against
neighbors that have not moved. This is §20 Open item 3's rung-by-rung migration.

## F11 · `titlebar-hover-gray` · `FloatingPanel`'s titlebar wears the HOVER gray at rest

`.header` is `--page-surface-hover-color` (`#f0f0f0`) permanently — chat, the
scratchpad and every modal. Joel, 2026-08-22: titlebars not being white *"makes
sense"*, but it is the hover gray by ACCIDENT and **the two must not be
coupled**. It wants its own token, at whatever value.

## F12 · `nine-body-classes` · Nine `.body` classes want real names

All nine mean "a floating panel's content area, as opposed to its titlebar":
`FloatingPanel`, `GameScratchpad`, `SetupSection`, `CelebrationDialog`,
`DeviceBlockNotice`, `FaultDialog`, `DefinitionView`, crosswords'
`ExplainDialog`. Shared with `shared-game-chrome`.

## F13 · `setup-form-monospace` · Five setup forms set `font-family: monospace`

spellingbee, wordwheel, boggle, letterboxed, wordiply — all on the field that
previews letters or a board, one decision written five times by five hands, none
of them writing down why. **Do NOT change them piecemeal** (Joel, 2026-08-22):
decide once, here, whether a letters preview wants a mono face at all now that
the app has a real one. `GameScratchpad` is monospace for the same unexamined
reason and gets asked at the same time.

## PUNTED · F14 · `helppanel-got-it` · Help is classed a companion but its button ends it

§20 calls `HelpPanel` a companion and describes it as "keep-open, no Save,
X-to-close" — but the code has a **"Got it" that closes it**, and §20's own
sharper test is *"does the button END the thing"*. By that test Help is a
dialog. The measurement §20 cites (scratchpad, setter-note, clue-explainer have
no buttons) did not include Help.

Joel, 2026-08-24: *"when we get to help, we'll decide. It's definitely a
companion."* → the first game area.

## PUNTED · F15 · `numberjump-tier` · A blocking modal riding the popover tier

crosswords' `NumberJumpDialog` is a hand-rolled `position: fixed` modal with its
own scrim at `--z-index-popover`, so a menu can open over it. It is also the
loudest candidate for `<BlockingModal>`. Punted to **crosswords** (Joel,
2026-08-24) — converting it moves its tier, which is a behavior change that
area should see. **Owed: a note in the crosswords roster.**

---

## Predicted test breaks

- **Two, both hit and both fixed**: `connections/PlayArea.tsx` and
  `strands/PlayArea.tsx` failing to compile on `cancelLabel: null`.
- **None in the unit suite**, and none appeared: 1968/1969 throughout, the one
  failure being the standing `scripts/subset-font.py` stamp.
- **`e2e/suspend-dialog.e2e.ts` 6/6** after the shell change, including *Tab
  cycles within the dialog and does not escape*, Enter confirms, Esc cancels.
