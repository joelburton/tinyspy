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

So the instances — `EditProfileModal`, `EditClubModal`, `FaultModal`,
`WordEditDialog`, `GameScratchpadCompanion`, `GameHelpCompanion`, `Chat`, crosswords'
three, scrabble's `ScrabbleBlankPickerBlockingModal` — are **consumers**. A rename or signature
change here forward-fixes them in the same commit (§21's compile-break rule) and
**their stamps do not move**. If one of them turns out to be the only evidence
for a shared question, it gets surfaced and asked about, not audited.

**Thirty-one findings.** Twenty-six RESOLVED (F1–F7, F16, F17, F18, F19, F21,
F25, F28), three MOVED to `forms` (F8, F9, F13), two PUNTED (F14 → the first
game area, F15 → crosswords), **nine OPEN** — F10, F11, F12, F20, F22, F23, F24,
F26, F27 — plus two filed on 2026-08-25 and also open: **F30** from a bug report,
and **F31** moved IN from `forms`.

**A plan for eight of them is agreed** — see "The plan, agreed 2026-08-24" below.
F16/F17/F18 turned out to be one question, and the answer is that a panel
declares its FAMILY and the shell enforces what follows.

Steps 1 and 2 of the plan are done. **F16 (`esc-closes-every-panel`) — the one
live bug — is fixed and pinned** by `e2e/panel-escape.e2e.ts`.

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
| `SetupGameModal` + `.module.css` | Joel: addressed at `club-page`, "since that's where they first appear". Which also means **F36 (`createclub-modal`) has no modal to land on here**, so `homepage` stays paused past this area |
| `CelebrationBlockingModal`, `SuspendConfirmationBlockingModal` | punted to the first game area |
| every other floating panel — `Menu` (not one), `GameScratchpadCompanion`, `GameHelpCompanion`, `Chat`, `ClubHelpCompanion`, `DefinitionPopover`, the per-game `Help.tsx` | instances; this area builds what they sit on |

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
rename at a time. **The roster was settled and executed on 2026-08-25** — every
name in this list moved except the three that were already right
(`AnagramDialog`, `WordLookupDialog`, `WordEditDialog`, the only correctly-named
dialogs in the app) and `infoPanel.module.css`, which is a filename and
`shared-game-chrome`'s.

## RESOLVED · F5 · `blocking-hand-assembled` · The strictest category was four props and a hook call, copied

`ConfirmDialog` and `FaultModal` each wrote out `draggable={false}`,
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

**The `minHeight: 200` floor turned out to matter, and Joel saw it before the
measurement did.** It was noted here as "small" and "nothing looks wrong today";
removing the titlebar in step 3 made it a visible band of empty white under the
buttons. Measured: a confirmation's content is **117px** inside a body of
**198px** — 81px of nothing.

A minimum exists so a RESIZABLE panel cannot be dragged shut. A card cannot be
resized, so a floor is only the shell overruling the content — and the content is
what knows the height here, which is the whole reason `fitContent` is on. So
`<BlockingModal>` passes `minHeight={0}`:

| | before | after |
|---|---|---|
| confirmation | 420 × 200 | 420 × **132** |
| fault, short | 420 × 200 | 420 × **158** |
| fault, 40× repeated | 420 × 552 | 420 × 519 |

The 13px that remains in each is the body's own padding, not slack.

**The general case is F23 (`viewport-margins-unchosen`)** and is NOT settled
here: `SetupGameModal` also passes `resizable={false}` with `fitContent` and a
`minHeight: 300`, so it has the same floor overruling the same fit. That is
`club-page`'s surface, so it is described rather than changed.

## RESOLVED · F10 · `fault-tier` · The fault rode the shared default, so an open chat covered it

It is a `modal-fault`, a rung above blocking, precisely so an error stays
readable mid-question. **RESOLVED 2026-08-25 when the ladder landed.** Measured in the browser: chat
paints at 3100 and the fault at 5100, so an open conversation no longer covers an
error. It could not be fixed alone — moving one component ranks it against
neighbors that have not moved — which is why it waited for the whole ladder.

## RESOLVED · F11 · `titlebar-hover-gray` · The titlebar wore the HOVER gray at rest

`.header` read `--page-surface-hover-color` (`#f0f0f0`) permanently — every
floating panel's titlebar and every hover in the app were one decision by
accident, so nudging the hover would have moved every panel header with it.
Joel, 2026-08-22: titlebars not being white *"makes sense"*, but the two must
not be coupled.

**Resolved 2026-08-25 with `--floatingPanel-titlebar-color`**, its own token in
both themes, **starting at the value it inherited** (`#f0f0f0` daylight,
`#3a4459` midnight) — Joel: *"can default to same value."* Nothing repaints;
the point is that they can now diverge. Measured after the change:
`rgb(240, 240, 240)`, unchanged.

Its bucket follows `--pageHeader-border-color`, the existing one-token bucket
for the page's own strip.

**Only the titlebar moved.** The other two readers in this area are real hovers
and correctly still read the hover token: `.closeButton:hover`, and the
scratchpad's `.takeOver:hover`.

## RESOLVED · F12 · `nine-body-classes` · Nine `.body` classes, and they were not one thing

Recorded as *"all nine mean a floating panel's content area, as opposed to its
titlebar"* — so the fix looked like a rename to one better word. Reading them
says otherwise. They were **three concepts wearing one word**, plus a fourth
that has nothing to do with panels:

- **the shell's content region** — `FloatingPanel`. The one place the word is
  true, and the thing the others were borrowing.
- **a layout stack inside a panel** — `GameScratchpadCompanion`, `FaultModal`.
- **body COPY, a paragraph of prose** — `CelebrationBlockingModal`,
  `DeviceBlockNotice`, `DefinitionView`, `CrosswordsExplainCompanion`. These
  read as containers and are text.
- **a disclosure section's content** — `SetupSection`, which would mean the same
  on a page with no panel anywhere.

**The recorded finding got it wrong itself, and that is the evidence**: a name
that made three concepts look like one fooled the audit written to catch exactly
that.

**Resolved by splitting, not renaming** (Joel, 2026-08-25):

| file | was | now |
|---|---|---|
| `FloatingPanel` | `.body` | `.body` — kept |
| `GameScratchpadCompanion` | `.body` | `.notepad` |
| `FaultModal` | `.body` | `.report` |
| `CrosswordsExplainCompanion` | `.body` | `.explanation` |
| `CelebrationBlockingModal` | `.body` | `.subline` |
| `DeviceBlockNotice` | `.body` | `.reason` |
| `DefinitionView` | `.body` | `.definition` |
| `SetupSection` | `.body` | `.sectionContent` |
| `SetupGameModal` | `.bodyReserve` | `.optionsReserve` |
| `CodenamesduetAISuggestModal` | `.cluePanel` | `.suggestion` |

The last two are the strays folded in: a fifth sense of "body" (a lazy-load
height reserve) and a class named after a component that no longer exists.

**The collision that proves the point cost a compile error on the way.**
`GameScratchpadCompanion.tsx` had `styles.body` and `sp.body` — a class and the
scratchpad's TEXT CONTENT — four lines apart, so a `\.body\b` rename hit both
and `tsc` caught `sp.notepad`. Two things called body in one file, meaning
completely different things, is the whole finding in miniature.

**Not renamed, and deliberately:** the celebration's `body` PROP and the
scratchpad's `sp.body` field. Those are component and store APIs; F12 is about
classes.

## PUNTED · F14 · `helppanel-got-it` · Help is classed a companion but its button ends it

§20 calls `GameHelpCompanion` a companion and describes it as "keep-open, no Save,
X-to-close" — but the code has a **"Got it" that closes it**, and §20's own
sharper test is *"does the button END the thing"*. By that test Help is a
dialog. The measurement §20 cites (scratchpad, setter-note, clue-explainer have
no buttons) did not include Help.

Joel, 2026-08-24: *"when we get to help, we'll decide. It's definitely a
companion."* → the first game area.

## PUNTED · F15 · `numberjump-tier` · A blocking modal riding the popover tier

crosswords' `CrosswordsNumberJumpBlockingModal` is a hand-rolled `position: fixed` modal with its
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
previews letters or a board. **→ the `forms` area.** `GameScratchpadCompanion`'s
monospace stays HERE — it is the same unexamined choice, but it is a floating
panel's, and the two no longer have to be asked in one sitting.

---

# The audit — 2026-08-24

All 14 roster files read. F1–F15 came out of the *work*; these came out of the
*reading*, and they start at F16 so no number is ever reused.

## RESOLVED · F16 · `esc-closes-every-panel` · One Escape closes every open floating panel, not the top one

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

**Fixed 2026-08-24 by `usePanelEscape`** — ONE module-level listener with a
registry of open panels, replacing one listener per panel. **What you're IN,
else what's on TOP**: focus inside a panel routes Escape to that panel and stops
there (a swallow does NOT fall through to the panel below, which would be the
most confusing outcome available); otherwise it goes to the highest FAMILY rank,
later-mounted breaking ties. Each panel is matched by focus through
`data-floating-panel`, which now carries the panel's id as its value — the
selector is unaffected, since `[data-floating-panel]` matches with or without one.

Measured, and pinned by `e2e/panel-escape.e2e.ts` — every case opens TWO panels,
because a one-panel assertion passes against the bug:

| | before | after |
|---|---|---|
| Help over setup, one Escape | 2 → **0**, the form gone | 2 → **1**, the form survives |
| chat + a confirmation, focus outside both | — | the confirmation closes, **chat survives** |
| a fault with chat open | — | Escape closes **nothing**, both remain |

The registry also answers "which movable thing is on top", which §20's Open 1
needs for the same reason.

## RESOLVED · F17 · `backdrop-without-trap` · Three dimmed forms let Tab walk out behind them

`useFocusTrap` now has exactly **one** caller: `BlockingModal`. But `backdrop` is
passed by five components, and the other three — `SetupGameModal`,
`EditProfileModal`, `EditClubModal` — do **not** trap. So the page is dimmed
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

## RESOLVED · F18 · `three-scrims-by-construction` · Three scrim values, assigned by how each floating panel was built

§20 predicted this exactly — "currently assigned by how a thing was BUILT rather
than by what it means" — and the measurement is worse than the prediction:

| surface | family | scrim |
|---|---|---|
| every `FloatingPanel` with `backdrop` | normal **and** blocking **and** fault | `--scrim-light-color`, 40% |
| `CelebrationBlockingModal` | modal-normal | `--scrim-color`, 45% |
| scrabble's `ScrabbleBlankPickerBlockingModal` | modal-normal | `--scrim-color`, 45% |
| crosswords' `CrosswordsNumberJumpBlockingModal` | modal-blocking | `--crosswords-dialog-scrim-color`, **25%** |

So the shell paints one scrim for all three families, the two hand-rolled
*normals* take the dark one, the one hand-rolled *blocking* takes a third value a
game invented, and §20's intended split — light for normal, dark for
blocking/fault — is not expressed anywhere.

The two shared tokens are 40% and 45%, "a difference nobody can see" (§20), and
**whether they earn their keep at all is §20's Open 2**: immovability may already
signal the category, in which case the answer is one scrim, not two or three.

## RESOLVED · F19 · `backdrop-doc-says-only-setup` · The prop's docstring named one caller of five

`Props.backdrop` and `.backdrop` in the stylesheet both say *"Only Setup uses
this today"*. Five components pass it. Worse than stale: the docstring justifies
the prop with a Setup-specific argument — *"you can't set up two games at once"*
— on a prop that now carries the whole blocking category. Whoever reads it next
learns the wrong rule.

## RESOLVED · F20 · `dead-names-in-docstrings` · Three docstrings named things that do not exist

- `FloatingPanel.tsx` listed **`HintModal`** among the modals. No such component
  — connections' hint became an info-column readout, which is the same file whose
  misnaming produced F2. **Gone with the step-1 rewrite.**
- `FloatingPanel.module.css` said *"the modals, the always-on Chat, the future
  scratchpad"*. The scratchpad shipped long ago, and by now the sentence could
  name the families instead of guessing at a cast list: the companions, the
  dialogs and all three modal families.
- `useDraggablePanel.ts` said *"(Chat, future Scratchpad, etc.)"*. Same, and it
  can now say something true and useful rather than "etc.": the six companions
  remember position AND size, the three dialogs remember only a position,
  because they cannot be resized.

Both rewritten 2026-08-25 rather than patched — a list of examples goes stale
every time the roster moves, where a statement about the FAMILIES does not.

## RESOLVED · F21 · `focus-trap-doc-stale` · `useFocusTrap`'s scope note now contradicts the code

It said the trap was *"opt-in per modal (call it from the dialog body), NOT
baked into every `<FloatingPanel>`"* — the note someone would have read before
deciding F17, arguing against the answer F17 arrived at. **Rewritten**: the
shell calls it, for the families that dim, because the trap FOLLOWS THE SCRIM.
It also now records why chat is unaffected by a modal's trap while sitting above
it — the listener is on the modal's own subtree, so a Tab inside chat never
reaches it.

## RESOLVED · F22 · `shell-literals` · The two shared stylesheets were unconverted

Recorded as "some of their literals are on NO allowlist row at all, which
already fails". **That was wrong** — the suite was green, and every literal was
on a row. They were EXCUSED, not converted, which is a smaller claim.

Sorting the nine by what the sprint's own conversion rule says:

**Six were exact vocabulary matches, so they converted silently** — nobody chose
the literal over the token:

| | was | now |
|---|---|---|
| `.titlebar` | `gap: 0.5rem` | `--spacer-4` |
| `.titlebar`, `.shell`, `.closeButton` | `1px` borders | `--border-width-line` |
| `.closeButton` | `line-height: 1` | `--line-height-3` — its FIRST reader, so it came off `DECLARED_AHEAD` |
| `.modalActions` | `gap: 0.75rem` | `--spacer-3` |
| `.modalActions` | `margin-top: 1.5rem` | `--spacer-1` |

**Three paddings are PARKED, not debt.** `base.css` says so: *"padding is
deliberately not on this ramp yet… the guard checks gap and margin only."*
`.titlebar`'s horizontal, `.body`'s, and the card's stay literals until an area
decides whether padding earns a ramp.

**The titlebar's own numbers became ONE number** (Joel, 2026-08-25): *"pick a
height for the titlebar; the title-text and close-button derive from that."*
`--floatingPanel-titlebar-height: 2rem` in `base.css`, and the two readers take
ratios rather than tokens of their own — a global `--titlebar-font-size` would be
clutter for two rules in one file:

    .title       font-size  × 0.45   (0.9rem, what it measured)
    .closeButton width/height × 0.7  (1.4rem)
    .closeButton font-size  × 0.5    (1rem) — the ✕ glyph scales with the BAR,
                                      not with the type ramp

The vertical padding that used to CREATE the height is gone; `align-items:
center` was already doing the centering, so the height is now stated instead of
implied.

**Measured, and one pixel did move.** The ✕ (22.39px), both font sizes (16px,
14.4px), the gap (8px) and the action row (12px / 24px / 96px) are all
identical. The titlebar itself went **33px → 32px**: it used to be
`0.3rem × 2 + 1.4rem` PLUS a 1px bottom border, and `height: 2rem` under
`box-sizing: border-box` includes that border. The token now means *the strip is
2rem tall, border included*, which is the cleaner definition — but it is a
change, not a no-op.

**`min-width: 6rem` stays bespoke**, with its reason in the file: there is no
vocabulary for a control's minimum width, and whether one is owed is the `forms`
area's question (Joel, 2026-08-25).

**And `.header` became `.titlebar`** — the last place in the area still using the
old word, while the token, the docs and the CARD/WINDOW split all said titlebar.
It was also ambiguous against the app's PAGE header (`components/page-header/`,
`--page-header-height`), which is a different thing entirely. The `<header>` tag
went with it: calling it a header inside a panel is the same ambiguity in HTML.
Joel: *"so much more obvious; I wouldn't have needed to ask."*

## CLOSED · F23 · `viewport-margins-unchosen` · Five numbers answering one question

It turned out to be **three** questions, and only one of them was a problem.

### A · The edge margin — DONE

One idea written three times, once doubled:

    useDraggablePanel   edgePadding = 8
    FloatingPanel fit   Math.min(desired, innerHeight - 16)     ← 2 × 8, unstated
    FloatingPanel fit   Math.max(8, … innerHeight - target - 8)

All three mean *the gutter a floating panel keeps at every viewport edge when
THE APP places it* — on mount, on window resize, and when a card grows. **Not**
when you place it: a drag may park a panel half off-screen on purpose, which is
(B). The `16` was only correct because it was twice the `8`, and nothing said so,
so changing one would have desynced the other in silence.

Now `VIEWPORT_EDGE_MARGIN`, exported, with five readers and no literals left.

**And `edgePadding` was misnamed by the app's own vocabulary** — `base.css` draws
the line explicitly: padding is space INSIDE a box, a margin is space BETWEEN
things, and this is between the panel and the viewport edge. Renamed
`edgeMargin`; nothing passes one.

### B · `SOFT_MIN_VISIBLE` → `MIN_VISIBLE_WHEN_PARKED` — DONE

How much of a floating panel stays on screen when you park it partly off the
edge, so you can grab it back. The value is fine and always was; the NAME was
opaque, because "soft" names the clamp MODE and means nothing until you know
there are two clamps. "Parked" is the word the docstring already used for the
gesture, so the constant and the prose finally agree (Joel, 2026-08-25).

### C · Minimum panel size — OPEN, and deliberately left

Eleven floating panels, twelve distinct numbers, every one picked by eye:

    CodenamesduetAISuggestModal 240×140    ClubHelpCompanion        280×180
    CrosswordsNoteCompanion     300×200    Chat                     260×240
    CrosswordsExplainCompanion  320×220    GameScratchpadCompanion  240×200
    SetupGameModal              320×300    EditClubModal            320×300
    EditProfileModal            320×340    BlockingModal            320×0
    FloatingPanel default       240×200    GameHelpCompanion        per-game

**CLOSED HERE 2026-08-25, moved to §7's carried-forward checklist** against
"each surface, as its area comes up", with the seven pairs listed and the RULE
to apply — the number comes from what the body needs, not from what looked about
right. Joel: *"ignore for now; as we get to these individually in areas, we can
figure out."* Widths cluster at 240/260/280/300/320 — five values for one
idea — but the numbers are also the one thing a RESIZABLE panel genuinely
differs on: chat can go narrow, a form cannot.

**And I was wrong that `SetupGameModal`'s `minHeight: 300` bites**, which I had
said twice. Measured across the four shortest setups in the app:

| | panel | content | slack |
|---|---|---|---|
| TinySpy | 535px | 488px | 13px |
| WordNerd | 438px | 391px | 13px |
| StackDown | 404px | 357px | 13px |
| SyrupSwap | 438px | 391px | 13px |

Every one is well clear of 300, and the 13px is body padding rather than slack.
The floor is dead code, not a live bug — it WOULD overrule the fit for a shorter
setup, and there isn't one.

## RESOLVED · F24 · `closebutton-copies-a-deleted-component` · A cross-component coupling maintained by prose

`.closeButton`'s comment said *"the hover treatment matches the ClubGameCard
delete button's idle state"*. Checking it turned up **three errors, not one**:

| | `.closeButton:hover` | the delete button |
|---|---|---|
| background | `--page-surface-hover-color` | same — but on its **hover**, not its idle |
| color | `--page-text-color` | same, also on hover |
| border-color | `--field-edge-color` | **`--field-strong-edge-color`** — different |

So it named a component the homepage area had dissolved (into
`ClubGameDeleteButton`), named the wrong STATE, and asserted a match that was
never quite true.

**Resolved by letting the resemblance be a resemblance.** Two quiet icon buttons
lighting up the same way is a house style, not a dependency — and a comment is
the one mechanism that can neither enforce it nor survive it changing, which is
what this finding is really about. If they should genuinely move together they
want a shared class, and that is a question for whoever owns both: this file is
`floating-panels`, `ClubGameDeleteButton` is `club-page`'s.

## Escape ranks by TIER, and chat is the one exception (2026-08-25)

The first version of `usePanelEscape` carried its own five-entry rank table
keyed by FAMILY. It was a second copy of an order that already exists in
`base.css`, and it disagreed with it the moment Help got a rung: Help paints at
`--z-help` (2300), above the setup modal at 2200, but its FAMILY is companion —
so it ranked **bottom**. With focus outside both panels, one Escape would have
closed the form underneath and left the rules hanging over nothing.

**So the rank is the tier, read from the ladder** (`getComputedStyle` on
`:root`, cached — no theme moves a z- layer). One list, one direction, bigger is
higher.

**Chat states otherwise, and it is the only thing that does.** It paints at
`--z-chat` (3100) so a conversation stays reachable over every dim below it, and
ranks at its family (2000) so a modal you just opened takes Escape first
(Joel, 2026-08-24). One prop, `escapeRank="family"`, one caller.

### Two traps this spec fell into, and the planting that found them

`e2e/panel-escape.e2e.ts` passed against a deliberately broken build twice
before it was right:

1. **Clicking outside a modal does not move focus.** The scrim
   `preventDefault()`s its own mousedown ON PURPOSE, so a click cannot blur the
   panel's focused control — which means a test that clicks the page and thinks
   it has reached the "what's on TOP" branch is still in the "what you're IN"
   branch, and any ranking passes. It has to blur programmatically.
2. **The pairing has to be one the ranking can get wrong.** Chat against a
   BLOCKING modal proves nothing: family (2000) and paint (3100) both lose to
   5000. The two orderings disagree in exactly one place — chat against a
   `modal-normal` at 2200 — and that is the pairing the test now uses.

Verified by planting both wrong implementations. Ranking everything by family
fails the Help case and nothing else; ranking everything by paint fails the chat
case and nothing else.

---

# The plan, agreed 2026-08-24

F16, F17 and F18 turned out to be one question — *what does a floating panel
claim about the thing underneath it, and does anything enforce the claim?* — and
the answer is that **the panel declares its FAMILY and the shell enforces
everything that follows from it.** Joel took this over the cheaper alternatives
knowing it implies a forward sweep of every consumer: *"if this involves a
forward-sweep, that alone shouldn't block us from considering C."*

## What `family` drives, and what it deliberately does not

**Derived — these stop being props:** the scrim (present? which shade) ·
draggable · the focus trap · Escape · centered-fresh vs restored-where-you-left-it.

**Stays a prop, on purpose:**

- **`persistKey`** — the family says *remember your rect*; the key is per-instance.
- **`resizable` / `fitContent`** — §20's resize test is *who knows the size*, and
  that is orthogonal: chat (the user knows) and Help (the content knows) are both
  companions.
- `title`, `onClose`, `defaultSize`, `minWidth`/`minHeight`, `reserveKeyboard`.

Three independent questions instead of eight loose props: **family = what this
panel claims about the page beneath it; sizing = who decides how big; layer =
the family's, via the ladder.**

## The decisions behind it

**The trap follows the scrim** (F17). A `backdrop` already blocks the pointer on
everything below, so a modal that does not trap hands a keyboard user Tab access
to controls they cannot click — focus on a dimmed, inert button. Trapping
restricts nothing that was usable; it makes the keyboard agree with the mouse.
So **modal-normal, modal-blocking and modal-fault trap; companion and dialog do
not** — they never dim, the page behind them is live, and you must be able to
leave. Chat survives this: it sits above the scrim so it stays clickable, and
`useFocusTrap` listens on its own panel's subtree, so a Tab inside chat never
reaches a modal's handler.

**Two scrims, assigned by family** (F18, Joel): *"I may like having the blocking
modals have a darker scrim, so let's leave room for that."* The VALUES stay as
they are for now (40% / 45%) — §20 wants roughly 35% / 55%, and that wants
looking at on a real board.

**Movable, but modals still center** (F175). "If it's movable we remember where
it was" collided with `SetupGameModal`'s written *"No persistKey — each open
lands centered"*, and Joel settled it: **companions and dialogs remember;
modal-normals are movable and do not.** A modal is a fresh task each time.

**Escape: what you're IN, else what's on TOP.**

1. Focus inside panel P → Escape acts on P, and stops there.
2. Focus nowhere in a panel → Escape closes the top panel, ranking chat as its
   FAMILY (companion) rather than its layer.

**The fault SWALLOWS Escape** — consumes the key, closes nothing, and nothing
below it moves, because closing a fault by accident is a real problem. Ties break
by later-mounted-wins. **`closeOnEsc={false}` stops being a taste knob**: chat's
and the scratchpad's opt-outs are bugs by this rule (F25).

**The celebration joins the shell** once the shell can say *stay a card on a
phone*. The objection was never that it is the wrong family — it is that
`FloatingPanel` becomes a full-screen sheet at `@media (--phone)` while
`CelebrationBlockingModal` is `max-width: min(90vw, 420px)` with **no media query at
all** (verified: zero `@media` in that file). That is a missing capability in the
shell, not a property of the celebration. Joel: *"'stay a card' is something that
FloatingPanel should offer as a possibility on phones, though almost all will be
full-page."*

## The ladder lands here too

Measured before deciding, and it is far smaller than it reads: **8 tokens, 13
declarations, 11 files** — ten in `common/`, one in crosswords. Everything else
writing `z-index` in `common/` is 0–5, which §20 defines as local layering rather
than a tier.

| token | value | readers |
|---|---|---|
| `--z-index-infoSheet` | 40 | `InfoSheet` |
| `--z-index-panel` | 500 | `FloatingPanel` (default), `Chat` |
| `--z-index-popover` | 1500 | `Menu` ×2, `FilterSelect`, `DefinitionPopover`, crosswords' `CrosswordsNumberJumpBlockingModal` |
| `--z-index-chatPanel` | 10000 | `Chat`, the backdrop's `calc` |
| `--z-index-scratchpad` | 10000 | `GameScratchpadCompanion` |
| `--z-index-celebration` | 10001 | `CelebrationBlockingModal` |
| `--z-index-toast` | 12000 | `ToastHost` |
| `--z-index-tooltip` | 12000 | `TooltipHost` |

**Zero drift is the point** (Joel, on 169): there is **no table in TypeScript**.
The shell writes `var(--z-<family>)`, so the code carries the NAME and `base.css`
carries every VALUE. The `zIndex` prop is deleted.

It fixes three known problems on the way: **F10** (blocking 5000 / fault 5100
land above chat 3100, so an open chat stops covering an error), the celebration
coming down off 10001, and toast/tooltip un-tying at 12000.

**`CrosswordsNumberJumpBlockingModal`'s TIER moves here; its STRUCTURE stays crosswords'.** The
tier move is a bug fix and it cannot be left behind on a retired token; converting
it onto `<BlockingModal>` is the visible change its own area should see (F15).

**Scratchpad vs chat**: they tie at 10000 today and DOM order decides. The ladder
separates them — chat 3100 over companion 2000 — which is consistent with chat
being the one panel that can open itself.

## The order, and what each step closes

| | what | closes |
|---|---|---|
| 1 | **`family` on `FloatingPanel`** — five values; `backdrop`, `draggable`, `closeOnEsc` and the hand-called trap all go. ~14 call sites | F17, F18, F19 |
| 2 | **The Escape policy** + a spec pinning Help-over-setup | F16, F21, F25 |
| 3 | **WINDOW vs CARD** — the titlebar and the phone shape derive from family too; `CelebrationBlockingModal` reclassified to `modal-blocking` and moved onto the shell. Designed 2026-08-25, see below | part of F20 |
| 4 | **The rungs** — 8 tokens → the new ladder, 11 files, `zIndex` deleted | F10 |
| 5 | **The satellites** — homepage's F22.1 contract slot for `Menu`, `FilterSelect`, `DefinitionPopover` | — |
| 6 | **F26** — ephemeral panels re-clamp, and the two paths agree about overwriting | F26 |

**Two visible changes to expect in the diff**, both intended: blocking and fault
scrims darken 40% → 45%, and the celebration stops painting over chat.

## Step 3, designed 2026-08-25: a floating panel is a WINDOW or a CARD

Step 3 started as "add a stay-a-card trait for the celebration" and turned into
a second thing family derives, which is why it grew a section of its own.

**The question that produced it** (Joel): *"are there things that are floating
panels that might want the same behavior? Something with just a quick 'confirm'
message, and for which the full-screen and title bar might be useless?"* There
are five, and they are already a family.

### The split

|  | **CARD** — you ANSWER it | **WINDOW** — you MOVE it |
|---|---|---|
| families | `modal-blocking`, `modal-fault` | `companion`, `dialog`, `modal-normal` |
| drag | never, on any device | desktop yes; phone no (already forced) |
| titlebar + ✕ | **none** — the title is a heading in the body | yes, on both |
| on a phone | stays a card | full-page sheet, square corners |
| the way out | a button, or Escape | the ✕, or Escape |
| scrim | dark (45%) | none for companion/dialog, **light (40%) for modal-normal — unchanged** |

**Everything in it derives from the family.** There is one override —
`phone: 'sheet'` — for a card member that outgrows a card, and today nothing
passes it (see below).

### Why the titlebar goes, and why it is a derivation rather than a taste

**The titlebar IS the drag handle** — not conceptually, literally:
`dragHandleClassName={draggable ? styles.dragHandle : undefined}`, and
`.dragHandle` is only ever applied to the `<header>`. No titlebar, no drag.

So for a family that can never be dragged, the header's only remaining job is
showing a title, which the body does better and bigger — and the ✕ becomes a
THIRD way out duplicating a button already on screen. **`FaultModal` proves
it**: it renders `title="Error"` and `<p className={styles.heading}>Error</p>`
four lines apart, and nobody noticed, because a titlebar reads as chrome rather
than as content. That duplicate disappears for free.

**The phone side falls out of the same split, and its second reason is the
stronger one.** On a coarse pointer every panel is forced non-draggable, so a
full-screen sheet has no dismiss affordance except the titlebar ✕ — chat and
Help have no Cancel to fall back on. The families that go full-screen are
exactly the families that need the ✕ there. A card always has a button.

**And a card preserves the context the question is about** (Joel): a
confirmation is *about* something, and "End this game?" means less with the game
replaced by a full-screen sheet. Same for a fault — "couldn't save your word"
reads differently when the word is still visible in the entry box.

### Measured: no card member needs the override

`fitContent` caps at `window.innerHeight − 16` and lets the body scroll past it,
so **a card degrades into a sheet on its own exactly when the content earns
one.** At 560×844 — just above the `--phone` breakpoint of 34rem, so card
geometry at a phone's height:

```
confirmation          420 × 200    no scroll
fault, short          420 × 200    no scroll
fault, 30× repeated   420 × 647    no scroll — it simply grew
```

A longer fault caps at 828 with an internal scroll, which is a sheet but for the
scrim showing at the edges. **The card never breaks.**

The one member that cannot be measured yet is scrabble's `ScrabbleBlankPickerBlockingModal` — 26
letter buttons at ~390px — because it is still hand-rolled. That is what the
override is for, and if scrabble comes out fine the override should be deleted
rather than kept as decoration.

### The decisions this settles

- **`CelebrationBlockingModal` becomes `modal-blocking`** (Joel, 2026-08-25),
  superseding §20's families table, which put it at `modal-normal` because "it
  looks like one, it already dims, and you can still chat". Under the split it
  is plainly a card you dismiss rather than a window you move, and reclassifying
  costs nothing where a `card`/`window` axis orthogonal to family would be a
  whole second thing to declare. **It gets no bespoke traits**: no titlebar and
  card-on-phone both fall out of the family. Joel: *"there's nothing special
  about celebrationmodal."*
- **§20's ⚠️ "the celebration must NOT be unified onto FloatingPanel" is
  answered, not ignored.** Its objection was the phone sheet; the split removes
  that, and the titlebar objection it never raised goes with it.
- **One body padding for the shell**, card and window alike. A panel wanting more
  overrides it in its own module, which is already the convention — so the
  celebration keeps its `2rem` the way every panel keeps its own.
- **The scrim does not move.** Assigned by family in step 1 and unchanged here;
  the values are still open and are to be judged on a real board.

### What is left over, and it is small

Two visible residues on the celebration, neither special to it: it takes the
shell's `--shadow-panel` (`0 8px 24px / 12%`) where it used `--shadow-dialog`
(`0 12px 48px / 35%`), and its `cardIn` scale-up moves from the card onto the
body content. If the flatter shadow reads wrong, that is **CAT A's setting to
change**, not the celebration's.

Also collected on the way: `CelebrationBlockingModal`'s two §7 rows — the `<h2>` at
h1's size, and the `:focus-visible` that re-declares the shared ring — land here
rather than waiting for the first game area, since the component is being opened
anyway.

## RESOLVED · F25 · `esc-opt-outs-are-bugs` · Two panels opted out of Escape

`Chat` and `GameScratchpadCompanion` pass `closeOnEsc={false}`. Joel, 2026-08-24:
*"it is a bug that scratchpad doesn't handle escape (other things might not
handle them now); all floating panels should handle esc-to-close, following the
rule we just confirmed about the 'focus-or-top'."* Both opt-outs go; the fault's
swallow is the only exception left.

## RESOLVED · F29 · `x-means-close` · Three ✕s, doing two different jobs and two different glyphs

Came out of F24, and turned out to be the bigger finding.

**The app had three close-ish ✕s** and they were not one thing:

| where | glyph | what it actually did |
|---|---|---|
| `FloatingPanel`'s titlebar | `×` U+00D7 | dismiss this floating panel — the real one, rendered once for all fourteen |
| `ClubGameDeleteButton` | `×` U+00D7 | **delete a game, irreversibly** |
| `InfoSheet` | `✕` U+2715 | nothing — `display: none` in every state |

**The delete was the problem** (Joel, 2026-08-25): *"'x' normally means 'close
this thing'; deleting a game is a subtly different act than closing a dialog."*
And it was worse than a wrong glyph: the button was a neutral gray corner icon
that only turned red once you had already pressed it, so the one signal saying
"this destroys something" arrived after the click that needed it.

**Now a `<TrashButton>`** — a purpose button on `ActionButton`, `Trash2` from
lucide, destructive by default. `ClubGameDeleteButton` renders it and keeps only
what is genuinely local: the corner position, the hover reveal, the two-step
state. `iconOnly` IS the shape change, so the same button grows a label beside
the same glyph rather than a pill replacing it.

**The titlebar ✕ became a real quiet button.** It hand-wrote a muted ink, a
`--page-surface-hover-color` background and a `--field-edge-color` border — a
form FIELD's edge on a button, which is the least defensible of the three. Now
`button secondary icon-button icon-only`, where a bare `.secondary` IS the quiet
family, with **no border** (Joel: *"it doesn't get a border"*). What actually
changed on screen is the HOVER outline, which used to appear and no longer does —
the rest border was already transparent.

**Its size is re-set, not out-cascaded** — and that answers "why does `icon-only`
fix the size?" It reads `--iconButton-size`, so the element re-sets that token to
`calc(titlebar × 0.7)` and the class picks up the new value. Same discipline as
the button tones and the tiles (`code-conventions.md` → state classes win by
re-setting tokens). No wart, and no need to skip `icon-only`.

**`InfoSheet`'s was deleted**, not fixed. It was `display: none` in every state,
kept "for any future context that has no header" — a context that does not
exist — and it carried the second glyph nobody could see and therefore nobody
would ever fix. Escape still closes the sheet.

**No shared close class was added**, and the check is why: there is only ONE live
✕ in the app now, because the shell renders it once for every floating panel. A
global class would have exactly one caller.

**Scope:** this reached two other areas' files. `ClubGameDeleteButton` is
`club-page`'s, `InfoSheet` is `shared-game-chrome`'s; both were done at Joel's
direction.

## RESOLVED · F26 · `ephemeral-panels-dont-reclamp` · The floating panels that persist were protected; the ones that don't, weren't

`useDraggablePanel` hard-clamps on mount AND re-clamps on every window resize, so
the seven floating panels that persist a rect could never come back off-screen.
`EphemeralPanel` — every dialog and every modal — clamped **on mount only**, with
no resize listener at all. The protection sat on the panels that needed it least.

**Resolved 2026-08-25** by lifting that listener into a shared
`useReclampOnResize`, which both paths now call. Only `onReclamp` differs: a
persisted panel stores the correction, an ephemeral one just holds it in state.
It fires only when the rect actually moves, so an ordinary resize where the panel
already fits stays quiet — no re-render, no storage write.

**The goals it was built to** (Joel, 2026-08-25):

> *"We shouldn't hide floating panels on viewport resize. We need to listen and
> move them as needed."* · *"We do not need to remember anything more than 'where
> was this the last time?'… whichever is easier is fine."* · *"But, obviously, IF
> I then move/resize, it should remember the new location."*

The middle one cancelled half the fix I had proposed: the two paths disagree
about whether a viewport correction is written back, and it does not matter, so
the persisted path keeps the write it already did. The third is untouched — a
user's drag goes through the SOFT clamp, which is allowed to park a panel half
off-screen, and the viewport re-clamp is a different call.

**Pinned by `e2e/panel-viewport.e2e.ts`, and verified by planting.** With the
listener removed, a confirmation on a 1200px viewport shrunk to 600 keeps
`x = 390` and its right edge lands at **810** — 210px of a modal you cannot
reach. With it, 172 and 592.

**It also did not need to be dragged anywhere**, which is the part the finding
missed: a CENTRED panel is off-screen the moment the window is narrower than the
panel. "It clamped once on mount" was never the same claim as "it is on screen".

**And that exposed a second half, which Joel caught by asking whether I had made
a claim and not done the work.** Pulling a panel back inside is not the same as
putting it back where it belongs: the confirmation landed at `x = 172` on a 600px
viewport — flush against the right margin — where centred is 90. The cause is
that `defaultPosition: 'center'` is resolved into concrete x/y ONCE at mount, and
nothing afterwards remembers the position was an intent rather than a choice.

**The rule, in two passes.** Joel first: *"if it's not draggable and we resize,
we should re-calc its position"* — better than the version I proposed, which
listed the two card families, because it states the REASON rather than the
members. Then he widened it, and the wider one is the keeper:

> **Re-centre unless the panel REMEMBERS where you put it** — `!remembersRect ||
> !draggable`.

**`modal-normal` is in the set even though you CAN drag one** (Joel): they always
open centred and never save a position, so *"the players think 'these start at
the center' — which is true — and therefore should re-center on viewport
resize."* Shoving one aside is a transient act to see something behind it, not a
placement. That is a field the family table already had, so the rule needed no
new information.

The `!draggable` clause is what still covers a COARSE POINTER, where every panel
is forced non-draggable: a tablet rotation re-centres chat, because the rect it
restored was chosen in some desktop session and is not an intent on that device.

Only the POSITION is recomputed; the size is left alone, because a `fitContent`
panel's height is its content's answer rather than the viewport's. Measured:

| | before resize | after |
|---|---|---|
| blocking modal, 1200 → 600 | 390 (centred) | **90** (centred) — was 172, flush right |
| setup dialog, DRAGGED to 560, 1200 → 1000 | 560 | **260** (centred) |
| chat, dragged, resize it still fits in | 670, 250 | **670, 250** — untouched |

## RESOLVED · F28 · `help-rect-per-game` · Help is a companion, so it remembers — but sixteen games size it differently

`GameHelpCompanion` and `ClubHelpCompanion` declare `companion`, so the family says they open
where you left them; neither passed a `persistKey`, so neither did. Help is the
awkward case because it is shared by sixteen games with different `defaultSize`s,
and one remembered rect overrides all of them.

**Settled** (Joel, 2026-08-24): *"help dialogs can share a key; that's fine. They
should remember the location."* One `HELP_RECT_KEY` for the game guides and the
club's "About clubs" alike — help is one habit, not sixteen. **The consequence,
recorded where the key is declared**: a remembered rect carries a SIZE too, so
after the first drag a game's own `defaultSize` stops applying; those seeds only
ever fire on a fresh browser.

## CLOSED · F27 · `cluepanel-clue-for-what` · `CluePanel` names neither its game nor its job

Joel, 2026-08-24: *"'CluePanel' is a terrible name: CLUE FOR WHAT?"*

**And the answer I gave was wrong, which is the more important half.** I said it
was codenamesduet's AI clue suggester. It is not: `CluePanel.tsx` held **two**
components — the below-board clue strip (the giver's form, the guesser's clue
display, the Pass button) and, separately, the AI suggestion floating panel. The
strip is not a floating panel at all.

That error propagated: the rename sweep shipped `CodenamesduetAISuggestModal`
onto a component that is not AI, not a suggester and not a modal. **Reverted
2026-08-25** — `CluePanel` is `CluePanel` again, including the `.cluePanel` class
the F12 pass had renamed to `.suggestion`, which was wrong twice over (it styles
the strip, and it was one character from the real `.suggestionBody`).

**The AI panel is now named and reclassified**:
`CodenamesduetAISuggestCompanion`, in its own file with its own module — a
COMPANION, not a modal (Joel, 2026-08-25): *"on a small screen you want to see
the board to understand the advice; you should be able to drag it to cover the
infoCol area and resize it to see the board."* A scrim denies exactly that, and
the family rollout had briefly given it one. It also is not asking anything — a
modal-normal is a question worth thinking about; this is information you
requested and act on the board with.

**CLOSED HERE 2026-08-25, moved to codenamesduet.** The strip's own name is
still owed — Joel: *"change it back to CluePanel; we'll consider a better name
when we work on it"* — and it is on §7's carried-forward checklist against
`codenamesduet`, which is where an item with a future owning area goes. It is not
a floating panel, so neither `Panel` nor `Modal` belongs in whatever it becomes.

**The general lesson is filed against its own audit** (§7 → carried forward):
four other files export more than one component, so "the filename is the
component" is false in four more places, and that is precisely what let a table
built by scanning filenames attach the wrong name.

## Predicted test breaks

- **Two, both hit and both fixed**: `connections/PlayArea.tsx` and
  `strands/PlayArea.tsx` failing to compile on `cancelLabel: null`.
- **None in the unit suite**, and none appeared: 1968/1969 throughout, the one
  failure being the standing `scripts/subset-font.py` stamp.
- **`e2e/suspend-dialog.e2e.ts` 6/6** after the shell change, including *Tab
  cycles within the dialog and does not escape*, Enter confirms, Esc cancels.

## F30 · `wordedit-scrolls-and-underfits` · `WordEditDialog` scrolls when it shouldn't and isn't tall enough

Reported by Joel, 2026-08-25, on a screen with plenty of vertical room: the
edit-word dialog **scrolls when nothing about the viewport requires it**, and it
is **not sized right for fit-content — it isn't tall enough.**

Not investigated. Filed on report so it isn't lost; the diagnosis belongs to
whoever picks it up.

## F31 · `takeover-wears-a-field` · The scratchpad's "take over" is a button painted as a form field

Moved in from `forms` on 2026-08-25 (it was that area's F44,
`field-tokens-on-buttons`), because this panel is this area's.

`GameScratchpadCompanion.module.css .takeOver` draws itself with
`border: 1px solid var(--field-edge-color)`, `background: var(--field-fill-color)`,
`color: var(--page-text-color)` and `border-radius: 6px` — a form FIELD's edge
and fill on a control that is a button, and a literal where `--radius-md` IS
`6px` (`base.css:85`).

**Already flagged once, and this is the evidence that closes the argument.**
docs/ui.md calls it *"one case genuinely unsettled … a small inline text button,
currently a white fill with a gray border, which could reasonably be
`button secondary` in the quiet tone"*, and defers it to "next time the
scratchpad is open". What is new: crosswords' `Controls.module.css .btn`, written
by a different hand and sharing no code with this, reached the SAME four
decisions. Two independent authors landing on the same non-standard answer says
the shared button was not reachable — not that either of them wanted something
different. (That half stayed with crosswords: `docs/games/crosswords.md` § 9.)

It is reachable now. Since 2026-08-25 `<StandardButton>` takes a label, an icon,
or both, and has a `small` variant — the two things this control needed and could
not ask for.

## F32 · `titlebar-is-not-a-header` · Two `page-no-scroll` specs look for an element this area renamed away

`e2e/page-no-scroll.e2e.ts` locates a panel by `page.locator('header')` — the
setup dialog at line 69, the chat panel at line 88 — and a floating panel's
titlebar is `<div className={styles.titlebar}>`. It stopped being a `<header>`
in **`a61092ae`** ("the titlebar is one number, and `.header` becomes
`.titlebar`"), which is this area's commit.

**Both specs have been red since then**, found by the first e2e run of the
`forms` area (2026-08-26) and traced back rather than fixed there: the element is
this area's to name, so the assertion is this area's to correct.

What they guard is not cosmetic — a panel dragged off-viewport must not extend
the document (the page-never-scrolls invariant) — so the specs matter and are
currently protecting nothing. Whoever picks it up should decide whether the
titlebar wants to BE a `<header>` again (it is a header, semantically) or
whether the specs should locate it by its class.

## F33 · `word-dialogs-grow-instead-of-scrolling` · `fitContent` beat the anagram list's scroll box

`e2e/anagram-finder.e2e.ts` asserts *"the LIST must scroll inside the **fixed**
panel (not grow it)"*. The panel is no longer fixed: **`30377b99`** extended
`fitContent` to the three word dialogs, on the reasoning that *"the stored height
was never anyone's choice and the fit simply wins"* — and `fitContent` caps at
the viewport and lets the body scroll, so the panel grows to its content instead.
With 11 results it shows all 11 and `.list` never overflows.

**The spec is red for a real reason, and the design question is this area's:**
should a word dialog grow to fit any result list? At 11 words it reads well. At
200 it is a panel the height of the viewport, which is what the scroll box was
for. Decide that first; the assertion follows from the answer.

Found by the first e2e run of the `forms` area (2026-08-26). That area converted
the dialog's input to `<TextField>`, which is why it was suspected first — but
`fitContent` predates the conversion and no field change can cause or prevent a
panel that sizes to its content.
