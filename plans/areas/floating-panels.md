# Area: floating-panels

The second area of the CSS sprint's step 7. The process is
[css-system-2.md](../css-system-2.md) §21; the plan holds the order, this file
holds everything else.

**Opened 2026-08-24 as `dialogs-and-forms`; SPLIT the same day.** The forms half
became its own area, [forms](../css-system-2.md) (§7 → The areas, in order,
position 3), which runs directly after this one. A floating panel and a form
share a container and nothing else — the same area holding both meant one file
carrying two vocabularies, and the name had stopped being true besides. "Dialog"
also went, because a dialog is one FAMILY of floating panel (§20) and this area
covers all five.

**Scope, set by Joel when the area opened:** this area is **the machinery and
the shared look**, not an audit of every panel in the app.

> "this area isn't a global audit of forms + dialogs, rather the machinery and
> shared look and features of them."

So the instances — `EditProfileDialog`, `EditClubDialog`, `FaultDialog`,
`WordEditDialog`, `GameScratchpad`, `HelpPanel`, `FloatingChat`, crosswords'
three, scrabble's `BlankPicker` — are **consumers**. A rename or signature
change here forward-fixes them in the same commit (§21's compile-break rule) and
**their stamps do not move**. If one of them turns out to be the only evidence
for a shared question, it gets surfaced and asked about, not audited.

**Twenty-four findings.** Seven RESOLVED (F1–F7), three MOVED to `forms` (F8,
F9, F13), two PUNTED (F14 → the first game area, F15 → crosswords), **twelve
OPEN** — F10, F11, F12 from the work, and **F16–F24 from the audit below**.

**F16 (`esc-closes-every-panel`) is the only live bug**, and it is measured: one
Escape closes every open panel, so dismissing Help throws away the setup form
under it.

**Every heading says its status**, the convention `plans/areas/homepage.md`
arrived at: a heading with **no status prefix means OPEN**.

## The roster — 14 files

Agreed 2026-08-24 before anything was read; **cut to the machinery when the
forms half split off.**

**The shell and the drag** — what every floating panel is made of:

```
src/common/components/floating-panels/FloatingPanel.tsx
src/common/components/floating-panels/FloatingPanel.module.css
src/common/hooks/ui/useDraggablePanel.ts
src/common/hooks/ui/useDraggablePanel.test.ts
src/common/hooks/ui/useFocusTrap.ts
```

**The blocking family** — the one family that is fully built here, because it is
the one that was hand-assembled at every site:

```
src/common/components/floating-panels/BlockingModal.tsx              (new)
src/common/components/floating-panels/ConfirmationBlockingModal.tsx
src/common/components/floating-panels/AcknowledgeBlockingModal.tsx   (new)
src/common/components/floating-panels/modalActions.module.css
src/common/hooks/ui/useConfirmation.tsx
src/common/hooks/ui/useAcknowledge.tsx                               (new)
```

**Read as evidence, not yet claimed** — `FloatingPanel` imports all three, and
each has consumers outside this area (`usePhone` and `useVisualViewport` reach
into games; `useCoarsePointer` into `DeviceBlockNotice`). Listed so the next
session doesn't rediscover them, NOT stamped:

```
src/common/hooks/ui/useCoarsePointer.ts
src/common/hooks/ui/usePhone.ts
src/common/hooks/ui/useVisualViewport.ts
```

**Deliberately NOT on the roster**, each with the reason:

| | why |
|---|---|
| the 16 `fields/` + `setup/` files, and `ActionButton` ×3 | **moved to the `forms` area** on the 2026-08-24 split |
| `SetupGameDialog` + `.module.css` | Joel: addressed at `club-page`, "since that's where they first appear". Which also means **F36 (`createclub-modal`) has no modal to land on here**, so `homepage` stays paused past this area |
| `CelebrationDialog`, `SuspendConfirmDialog` | punted to the first game area |
| every other floating panel — `Menu` (not one), `GameScratchpad`, `HelpPanel`, `FloatingChat`, `ClubHelp`, `DefinitionPopover`, the per-game `Help.tsx` | instances; this area builds what they sit on |

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

## MOVED · F8 · `confirm-buttons-are-raw` · The confirmation's buttons bypass the tone system

Both are `<button className="button primary">` / `"button secondary"`, not
`<ActionButton>`, while `ButtonTone` describes `destructive` as "End / Concede"
and `quiet` as "a dialog's Cancel" — and no floating panel uses either.

Joel, 2026-08-24: *"we're tackling floating panels before form buttons — so
leave them as raw, and we'll decide later on whether they become something
else."* **→ the `forms` area**, folded into F9. The numbers stay here so they are
never reused.

## MOVED · F9 · `action-button-text-only` · Are a form's buttons really different from action buttons?

Inherited from `homepage` as F44 and the reason `forms` exists as an area.
`<ActionButton>` requires a glyph, so it has an `iconOnly` and no `labelOnly` —
and a Cancel is hand-written seven times, one of them in this area's
`ConfirmationBlockingModal`. **→ the `forms` area.**

## MOVED · F13 · `setup-form-monospace` · Five setup forms set `font-family: monospace`

spellingbee, wordwheel, boggle, letterboxed, wordiply, all on the field that
previews letters or a board. **→ the `forms` area.** `GameScratchpad`'s
monospace stays HERE — it is the same unexamined choice, but it is a floating
panel's, and the two no longer have to be asked in one sitting.

---

# The audit — 2026-08-24

All 14 roster files read. F1–F15 came out of the *work*; these came out of the
*reading*, and they start at F16 so no number is ever reused.

## F16 · `esc-closes-every-panel` · One Escape closes every open floating panel, not the top one

**CONFIRMED by measurement**, and it is the worst thing in this area.

Each open `FloatingPanel` installs its **own window-level** `keydown` listener
(`FloatingPanel.tsx:151`). Two panels open means two listeners, and Escape fires
both. Driven for real — open a game's setup, open Help from its footer `?`, press
Escape once:

```
PANELS after setup opens:  1
PANELS after help opens:   2
PANELS after ONE Escape:   0
```

So closing Help throws away the setup form under it. §20 says Help-over-setup
"works today by accident, via DOM render order" — the stacking does; the
dismissal does not.

Only two panels escape it, and by opting out of Escape entirely
(`closeOnEsc={false}`): chat and the scratchpad. Every other panel is exposed,
including the blocking modals — a fault over a confirmation is the same shape.

Fixing it means Escape belongs to the **topmost** panel, which means the app
needs to know which panel is topmost — a stack. That is also what §20's Open 1
(the multiple-movable-things strategy) needs, so the two should be looked at
together.

## F17 · `backdrop-without-trap` · Three dimmed forms let Tab walk out behind them

`useFocusTrap` now has exactly **one** caller: `BlockingModal`. But `backdrop` is
passed by five components, and the other three — `SetupGameDialog`,
`EditProfileDialog`, `EditClubDialog` — do **not** trap. So the page is dimmed
and declared inert, and Tab leaves anyway, which is precisely the leak the hook
was written to stop.

The question is whether **`backdrop` should imply the trap.** They are the same
claim said twice: a scrim says "everything below is inert", and an untrapped
scrim makes that false for the keyboard. If they always travel together, one of
them should stop being a separate decision.

Related, and the reason this was not just fixed: `FloatingPanel` currently has no
opinion about focus at all, and giving it one touches every panel including the
non-modal ones, which must NOT trap (chat, the scratchpad — you would never get
back to the game).

## F18 · `three-scrims-by-construction` · Three scrim values, assigned by how each panel was built

§20 predicted this exactly — "currently assigned by how a thing was BUILT rather
than by what it means" — and the measurement is worse than the prediction:

| surface | family | scrim |
|---|---|---|
| every `FloatingPanel` with `backdrop` | normal **and** blocking **and** fault | `--scrim-light-color`, 40% |
| `CelebrationDialog` | modal-normal | `--scrim-color`, 45% |
| scrabble's `BlankPicker` | modal-normal | `--scrim-color`, 45% |
| crosswords' `NumberJumpDialog` | modal-blocking | `--crosswords-dialog-scrim-color`, **25%** |

So the shell paints one scrim for all three families, the two hand-rolled
*normals* take the dark one, the one hand-rolled *blocking* takes a third value a
game invented, and §20's intended split — light for normal, dark for
blocking/fault — is not expressed anywhere.

The two shared tokens are 40% and 45%, "a difference nobody can see" (§20), and
**whether they earn their keep at all is §20's Open 2**: immovability may already
signal the category, in which case the answer is one scrim, not two or three.

## F19 · `backdrop-doc-says-only-setup` · The prop's docstring names one caller and there are five

`Props.backdrop` and `.backdrop` in the stylesheet both say *"Only Setup uses
this today"*. Five components pass it. Worse than stale: the docstring justifies
the prop with a Setup-specific argument — *"you can't set up two games at once"*
— on a prop that now carries the whole blocking category. Whoever reads it next
learns the wrong rule.

## F20 · `dead-names-in-docstrings` · Three docstrings name things that do not exist

- `FloatingPanel.tsx:96` lists **`HintModal`** among the modals. There is no such
  component — connections' hint became an info-column readout (`HintList`), which
  is the same file whose misnaming produced F2.
- `FloatingPanel.module.css:5` says *"the future scratchpad"*. It shipped.
- `useDraggablePanel.ts:33` says *"(FloatingChat, future Scratchpad, etc.)"*.
  Same.

## F21 · `focus-trap-doc-stale` · `useFocusTrap`'s scope note now contradicts the code

It says the trap is *"opt-in per modal (call it from the dialog body), NOT baked
into every `<FloatingPanel>`"*. It is now baked into `BlockingModal`. Small on
its own, but it is exactly the note someone would read before deciding F17, and
it currently argues against the thing F17 is asking about.

## F22 · `shell-literals` · The two shared stylesheets are unconverted

`FloatingPanel.module.css`: header `padding: 0.3rem 0.7rem` and `gap: 0.5rem`;
`.title` `0.9rem` / `600`; `.closeButton` `1.4rem` square, `font-size: 1rem`,
`line-height: 1`; `.body` `padding: 0.4rem 0.5rem`; `border: 1px`.
`modalActions.module.css`: `gap: 0.75rem`, `margin-top: 1.5rem`,
`min-width: 6rem`.

Some already sit on `vocabularies.test.ts`'s pending rows (`0.5rem`, `0.9rem`,
`1rem`, `1`, `1px`, `0.75rem`, `1.5rem`); **the rest are on no row at all**,
which is worth knowing — the guard shrinks BY VALUE, so an unlisted literal in a
listed file already fails. These two files convert together with F11's titlebar
token, since that edit lands in the same rule.

## F23 · `viewport-margins-unchosen` · Five numbers about "how close to the edge"

`edgePadding = 8` · `SOFT_MIN_VISIBLE = 60` · the fit's cap at
`window.innerHeight - 16` · its floor at `Math.max(8, …)` · `FloatingPanel`'s
`minWidth: 240` / `minHeight: 200` defaults, against `BlockingModal`'s 320/200.

Each is defensible alone; together they are one question — how much of a panel
must stay reachable, and how much air does it keep at the viewport edge — asked
five times by four hands. **F7 left `minHeight: 200` noted for this reason**: it,
not the content fit, is choosing the height of both blocking modals today.

## F24 · `closebutton-copies-a-deleted-component` · A cross-component coupling maintained by prose

`.closeButton`'s comment says *"The hover treatment matches the ClubGameCard
delete button's idle state."* `ClubGameCard` was split into `ClubGameRow` plus a
standalone callout by the homepage area's F38, and the delete button became
`ClubGameDeleteButton`. So the sentence points at a component that no longer
exists in that shape, and the coupling it describes has nothing keeping it true.
Either the two share a class or they are independent; a comment is neither.

---

**Audit scoreboard: nine new findings, F16–F24, all OPEN.** F16
(`esc-closes-every-panel`) is the only one that is a live bug rather than a
question, and F16 + F17 + F18 are all really the same question — *what does a
floating panel claim about the thing underneath it, and does anything enforce
that claim?*

## Predicted test breaks

- **Two, both hit and both fixed**: `connections/PlayArea.tsx` and
  `strands/PlayArea.tsx` failing to compile on `cancelLabel: null`.
- **None in the unit suite**, and none appeared: 1968/1969 throughout, the one
  failure being the standing `scripts/subset-font.py` stamp.
- **`e2e/suspend-dialog.e2e.ts` 6/6** after the shell change, including *Tab
  cycles within the dialog and does not escape*, Enter confirms, Esc cancels.
