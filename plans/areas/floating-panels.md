# Area: floating-panels

The folders it reads: `floating-panels`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-11** (Joel: "commit, then mark all files as blessed,
then close area") — every roster file reads `cs-blessed-floating-panels`,
stamped at those words, and so do the three files the area created outside
the folder (`keyboard/useDismissOnEscape.ts`, its test,
`guards/escapeListeners.test.ts`), since created files join the roster at
close. Opened the same day: roster agreed (Joel: "audit the area") and stamped
`cs-audited-floating-panels`. Every finding is WORKED; the closing re-read was
done the same day (F-15 through F-28 below; F-29 is from Joel's read of the
diff) and `doc.md` harvested. The re-read and the harvest are committed at
`8ce29a2a`; the blessing is the diff after it.

## The roster

All in `src/common/floating-panels/`:

| file | what it is |
|---|---|
| `FloatingPanel.tsx` + `.module.css` | the shell: the five families and what each claims, the clip layer, the titlebar, the scrim, the content fit, the phone sheet |
| `useDraggablePanel.ts` + `.test.ts` | the remembered rect, the two clamps, the re-clamp on resize |
| `usePanelEscape.ts` | the one Escape listener: what you're in, else what's on top |
| `Companion.tsx` · `Dialog.tsx` · `NormalModal.tsx` | the three window families, each a family name over the shell |
| `BlockingModal.tsx` + `.module.css` | the card shell for the two immovable families |
| `ConfirmationBlockingModal.tsx` · `AcknowledgeBlockingModal.tsx` | a question, and a statement |
| `confirmations.ts` · `useAcknowledge.tsx` | the confirm vocabulary — options, answer, the three canonical questions — and the acknowledge hook |
| `confirmationService.ts` + `.test.ts` · `ConfirmationHost.tsx` + `.test.tsx` | asking from code that is not a component, and the root host that draws it |
| `modalActions.module.css` | the end-aligned button row |
| `doc.md` | lede + Design (written 2026-09-11; off `DESIGNS_OWED`) |
| `todo.md` | one Soon, three Someday |

Left off: the instances that ride on the shell (chat, the help companions,
the setup modal, the word dialogs, the scratchpad, the fault modal), and the
two e2e specs the todo names.

**Callers, for evidence (read, not stamped).** `Companion`: seven files.
`BlockingModal`: seven, including the fault modal. `NormalModal`: setup, edit
profile, edit club, the celebration's sibling. `Dialog`: the three word
tools. `useAcknowledge`: connections and strands; `askConfirmation`: the
actions run, the word dialog, and a few game callbacks. `modalActions`: five
modals plus codenamesduet's Help. `usePanelEscape` and `useDraggablePanel` are
read by the shell alone. Two options had no caller at all —
`FloatingPanelProps.phone` and `PanelOpts.edgeMargin` — and both are gone.

**The docs.** docs/ui.md → Floating panels — five families, one shell is the
owning doc and it holds up against the code: the families table matches the
`FAMILY` record, the immovability and dim rules are what the shell does, the
two components that state their own layer are the two it names. Two stale
words in it are below.

## Findings

### Code and prose

## F-floating-panels-1 · `docstring-marker-pass` · Fifty-three `/**` on members, and one on a parameter — WORKED

Every props type in the folder puts `/**` on its members: `FloatingPanelProps`
(fourteen), `FAMILY`'s record members (seven), `PanelOpts` (five), `Entry`
(four), the three modal `Props`, `ConfirmOptions`, `AcknowledgeOptions`. And
`useReclampOnResize` carries a twenty-six-line `/**` on its `recenter`
PARAMETER, inside the signature. A note on a member or a parameter takes
`//`; the `/**` stays on the types, the components and the hooks.

## F-floating-panels-2 · `plan-and-finding-cites` · `§20` four times and `F26` once — WORKED

`FloatingPanel.tsx` cites "§20's rule" twice, `BlockingModal.tsx` "§20's
resize test", `usePanelEscape.ts` "§20's Open 1", and `FloatingPanel.tsx`
line 629 "(F26)". The no-cite rule: a plan section and a finding number from
a deleted audit, in durable files. In each the sentence carries its reason,
or docs/ui.md → Floating panels does; the cite goes.

## F-floating-panels-3 · `stale-names` · A prop, a file, a component and a modal that do not exist — WORKED

- **`backdrop`** — three comments in `FloatingPanel.tsx` (the `onClose` prop:
  "even when `backdrop` is set"; the scrim's "see Props.backdrop docstring";
  "Non-backdrop panels") and `BlockingModal.tsx`'s list ("`backdrop` — dim
  here must mean…"). There is no `backdrop` prop; the family decides the
  scrim. docs/ui.md → Confirm modals says the same ("`backdrop` blocks every
  pointer action").
- **`../connections' ChatPanel.module.css`** — `FloatingPanel.tsx` line 854
  and the module's header ("per ../connections' pattern"). No such file;
  chat's module is `common/chat/ChatBody.module.css`, and the pattern is the
  shell's own now.
- **`HowToPlay`** in the module's `.body` comment — no such component; the
  help companions are what scroll.
- **"Modals with natural dimensions (Setup, Hint) opt out"** on `resizable` —
  there is no Hint modal.
- **`BlockingModal.tsx`'s "this body div is it"** — a comment above the return
  pointing at an anchor the file does not render. It renders an `<h2>`, the
  children and the action row; the tab ring is anchored on the shell, up in
  `PanelRnd`. Spotted while removing this file's `minWidth`; its prose pass has
  not been done.
- **`docs/mobile.md → "Panels on touch"`** is cited twice and exists; fine.

All fixed. `backdrop` reached two files beyond the list —
`SetupGameModal.tsx`'s docstring and `docs/states.md` — and those went with it;
see the prose-pass section below for the uses deliberately left alone.

## F-floating-panels-4 · `archaeology-in-docstrings` · The folder narrates how it got here — WORKED

The heaviest of the areas so far. Nearly every docstring explains the shape
by the shape it replaced, and about nine carry a dated ruling in
parentheses. The sites:

- `FloatingPanel.tsx`: `PanelFamily` ("before this prop existed the claim
  lived in a document and the code disagreed with it in four measurable ways…");
  `FAMILY` ("Everything here USED to be a prop"); `shape` ("`FaultModal` used
  to print 'Error' in both places"); `layer` ("which is what this looked like
  first"); `minHeight` ("It used to default to 200…", eighteen lines);
  `escapeRank` and `remembersRect` ("(Joel, 2026-08-24)"); the component
  docstring ("Those were separate props once", "Why a single shell rather than
  separate Modal + FloatingPanel components"); the `fitContent` forwarding
  comment ("the old comment said it could not be… Measured 2026-08-25"); the
  fit's cap ("the literal here used to be 16"); `HELP_RECT_KEY`'s quote.
- `FloatingPanel.module.css`: the titlebar ("The vertical padding that used
  to set this height is gone"); the keyboard note ("this note marks where the
  old static reserve was" — a comment for a rule that does not exist); the
  scrims ("Before that, every panel on this shell painted the light one…").
- `useDraggablePanel.ts`: `useReclampOnResize` ("it used to belong to the
  persisted panels alone"); `VIEWPORT_EDGE_MARGIN` ("used to hard-code it —
  as 8… and 16"); `MIN_VISIBLE_WHEN_PARKED` ("Was `SOFT_MIN_VISIBLE`…", a
  rename story and nothing else); the recenter parameter's two dated quotes;
  "(private mode, SSR, etc.)" — there is no server render.
- `usePanelEscape.ts`: `rankOf` ("A hand-written rank table lived here
  first"); the hook ("It used to be per-panel, and two open panels meant two
  listeners… BOTH close").
- `BlockingModal.tsx`: "It exists because the category was hand-assembled at
  every site"; "It replaces the two hand-written ones, 240 and 280"; "The app
  had two, 420 and 460"; "the shell no longer has one to opt out of… the old
  default of 200".
- `ConfirmationBlockingModal.tsx` and `AcknowledgeBlockingModal.tsx` and
  `useAcknowledge.tsx`: the `cancelLabel: null` story, three times.
- `modalActions.module.css`: "Replaces the per-dialog `.actions` blocks".

The reasons all survive without the history: a family is declared so the
claim and the code cannot drift; a card has no titlebar because the titlebar
is the drag handle; one Escape listener because a key meaning "dismiss this"
needs one answer; the shell floors nothing because a one-line panel should be
one line tall. Say those.

## F-floating-panels-5 · `counts` · Censuses of the instances — WORKED

`useDraggablePanel`: "the six COMPANIONS… and the three DIALOGS".
`FloatingPanel.tsx`: "three dialogs that forgot…, three dimmed forms…"; "the
three that persist and DON'T resize are the word dialogs"; "26 letter
buttons"; "a 30×-repeated fault message grew to 647px".
`ConfirmationBlockingModal`: "sixteen chances for them to disagree". Say the
condition, or the kind ("the word dialogs").

## F-floating-panels-6 · `design-lives-in-docstrings` · The folder's Design is spread over its hovers, and `doc.md` has none — WORKED

On Joel's framing from `actions`: a docstring says who calls this and how.
Here the five families and what each claims, immovability as the signal,
what "dim" must mean, the Escape rule, the shell as a tab ring, and "who
knows the size" are all written into `FloatingPanel.tsx` (a 34-line component
docstring, a 26-line `PanelFamily` docstring, props with 15–22-line
docstrings), `BlockingModal.tsx` (36 lines) and `usePanelEscape.ts` (25). Most
of it is design, and it is the narrative `doc.md`'s missing Design should be.
docs/ui.md already states the rules once; the folder's Design says how the
code answers them, and each docstring shrinks to its caller's question with a
pointer. Pairs with F-floating-panels-4: the cuts are the same cuts.

## F-floating-panels-7 · `todo-in-a-docstring` · Two options nobody passes, one with its deletion condition in the hover

- `FloatingPanelProps.phone` — **DELETED**, its condition having been met:
  scrabble's blank picker stopped being hand-rolled on 2026-09-10 and is a
  `BlockingModal` now, so nothing anywhere forces a card into a phone sheet,
  and that picker's letter grid is built to shrink into a card
  (`repeat(7, minmax(0, 1fr))`, `min-width: 0` on the buttons). `phoneSheet`
  went with it: with no override it only ever restated `shape === 'window'`,
  which `PanelRnd` already knows.
- `PanelOpts.edgeMargin` — **DELETED**. A dead option whose own docstring said
  so; the hook reads `VIEWPORT_EDGE_MARGIN` directly now.

## F-floating-panels-8 · `typeof-window-guards` · The folder's own Soon — WORKED

All six gone (2026-09-11), reading `window` bare, per
docs/code-conventions.md → "`window` is always there; a browser FEATURE may not
be". The reading below called the fallbacks harmless because each supplies one;
they are not. `centerInViewport` fell back to the rect's own size, so
`x = (w − w) / 2 = 0` — "center in viewport" returned the TOP-LEFT CORNER. And
`clampToViewport` fell back the same way, subtracting the gutter from the
panel's own width on every call: reproduced by setting the viewport to the
rect's dimensions, a panel shrinks 420 → 404 → 388 → 372 on four drag-stops,
forever. So the guards turned an impossible condition into silent permanent
misbehavior, which is the argument for dropping rather than keeping them.

**Nothing red either way, and that is the honest caveat**: the tests read
jsdom's real window and never exercised a fallback, so no test defends the
premise. What defends it is the premise — a Vite SPA with `createRoot`, no SSR
config, no `renderToString`.

Two `typeof window` guards survive OUTSIDE this area, in `FaultModal.tsx` and
`toastStore.ts`, both module-level. Same shape, other areas' files, not
touched. (The four in `mobile/` and `tooltips/` are `typeof window.matchMedia`
— a FEATURE check, which the convention says stays.)

The original reading:

Six `typeof window` checks — `resolveDefaultRect` (two), `centerInViewport`
(two), `clampToViewport` (two) — for a case that cannot happen: an SPA with no
server render, and jsdom has a window. Each supplies a fallback the guard
makes reachable (1024×768, or the rect's own size). `useDraggablePanel.test.ts`
relies on jsdom's window being present and never on the fallback, so dropping
the guards reads `window.innerWidth` directly and changes nothing a test
sees. The Soon item said to check with the file open; checked.

## F-floating-panels-9 · `private-escape-listeners` · Three components answer Escape outside the registry

**WORKED, and it was a live bug, not a theoretical one.** The reading below
was right that none of these is a floating panel, and wrong that the collision
could not happen: `AnagramDialog` is a `dialog`-family panel whose result rows
are `.definable`, so a definition popover opens INSIDE it. One Escape closed
both — the definition and the finder, losing the letters you typed. Confirmed
against the real components before any fix, and the mechanism is that neither
listener stops propagation.

Joel ruled (2026-09-11): keep them out of the registry, make the press stop.
`useDismissOnEscape` (common/keyboard/) is the shared answer, and the subtlety
is why it is shared rather than three inline fixes — it must bind on
**`document`, not `window`**, because the registry is a sibling on `window` and
`stopPropagation` does not stop siblings; registered first, it would have run
already. That distinction is invisible and fails silently, so
`guards/escapeListeners.test.ts` fails a hand-rolled Escape listener anywhere
outside the two owners. `Menu` needed nothing: it already stops the key on its
own focused element, which is the right answer for an overlay that holds focus.

The original reading, kept because its category argument still stands:

Joel's, handed to this area: `InfoSheet`, `DefinitionPopover` and
`FilterSelect` each listen for Escape on the document themselves (so does
`Menu`, which ui.md already excludes). By ui.md's own definition none is a
floating panel — a sheet, a popover and a dropdown have no rect of their own
and no titlebar — so `usePanelEscape`, which is the shell's registry, is not
theirs to join. The one thing worth knowing is that an Escape with both a
floating panel and one of these open is answered twice, by the registry's
top panel and by the listener; nothing today opens a filter or a definition
inside a modal, and a sheet is phone-only. Recommend: leave them, and say in
`doc.md` that the registry is for the shell's families and popovers keep
their own Escape.

## F-floating-panels-10 · `overlay-surface-and-action-row` · The folder's own Soon, two patterns — WORKED

- **Overlay surface** — DONE, and **no pattern file**. Six stylesheets write
  the look, not four (`Menu.popover` + `.flyout`, `Toast.toast`,
  `FloatingPanel.shell`, `DefinitionPopover`, `FilterSelect.popover`), and they
  agree on only two of the four properties. Joel, 2026-09-11: radius is
  **deliberate** — a large surface is rounder, so `--radius-lg` on the shell
  and the device-block notice against `--radius-md` on the small ones; the
  `1px` border literals become `--border-width-line`; and the shadows become a
  three-rung altitude ladder in the THEME files. That leaves two shared
  declarations, both already tokens, so the shared thing to write down was the
  rule and not a class: docs/ui.md → Floating panels → The surface.
  - `--shadow-popover` / `-notice` / `-panel` / `-toast` → **`--shadow-anchored`
    · `--shadow-lifted` · `--shadow-floating`**, defined in `daylight.css` and
    `midnight.css` rather than `base.css`, because a shadow can only darken and
    the ground caps what it can say. Named for the rung, not the caller:
    `--shadow-notice` was the cautionary case and docs/ui.md cited it as one.
  - Depth for GAME surfaces (`--shadow-boardFloat`, the two tile shadows) stays
    theme-blind in `base.css`; a game's ground is the game's.
  - The midnight values are TRIAL and say so in the file. The measurement and
    the unsettled fork — heavier ink, or lighter surfaces per rung — are
    recorded in plans/dark-mode.md → CHROME is not stuck.
- **Action row** — `modalActions.module.css` IS the shared row, read by five
  modals and codenamesduet's Help; the item's other half is a pinned-to-bottom
  copy in `WordEditDialog`, which is `definitions`' to convert. Nothing here
  to build; the item narrows to a handoff.

## F-floating-panels-11 · `two-red-e2e-specs` · The folder's own Soon, a check — ANSWERED

"Two e2e specs were red waiting on this folder on 2026-09-02: `page-no-scroll`
and `anagram-finder`. Re-check before assuming." Run 2026-09-11 with Joel's
go-ahead, as part of a wider set: **16 tests, all green, 25.3s.** Both named
specs pass, so whatever made them red was fixed sometime in the nine days
between — the assumption was the stale thing, which is what "re-check" was for.

The other seven specs were the point of running wide, because they reach what
unit tests cannot:

- `page-no-scroll` drags BOTH panel kinds into opposite corners and asserts the
  document stays viewport-sized. That is the clip layer, the soft clamp, the
  clamp's new floor cap, and the `FloatingPanelBody` merge — which replaced the
  rect's owner for both variants, and which no unit test can exercise, since
  none of them drags anything.
- `anagram-finder` ends on the dialog's Escape, in a real browser: the exact
  behavior `useDismissOnEscape` changed.
- `concede` drives the three-button confirm; `coop-setup` opens the modal whose
  `minWidth` went; `waffle-mobile` and `boggle-mobile` open and close
  `InfoSheet` at two phone sizes.

No flake signature: every duration 0.8–2.3s, nothing near the ~275ms band this
repo's real failures cluster in.

Eleven other `*-mobile` specs were deliberately SKIPPED. They reach `InfoSheet`
the same way these two do, so they would re-test one component eleven times
rather than widen anything.

### Prose elsewhere, turned up by this area's reading

## F-floating-panels-12 · `ui-md-backdrop` · docs/ui.md → Confirm modals names a prop that is not there — WORKED

"A true MODAL on the FloatingPanel shell: `backdrop` blocks every pointer
action on the board underneath". The scrim is the family's; the sentence
should say the blocking family dims, or name the scrim.

### Raised by Joel mid-area

## F-floating-panels-13 · `panel-variant-components` · Three components between the shell and the render, for a branch that isn't one — WORKED

Joel, 2026-09-11, asked whether `FloatingPanelBody` should collapse into
`FloatingPanel` and whether ephemeral-vs-persisted deserved separate
components. The chain was `FloatingPanel` → `FloatingPanelBody` →
`PersistedPanel` / `EphemeralPanel` → `PanelRnd`.

`FloatingPanelBody`'s comment said it existed so the persistence hook could
branch "without conditionally calling hooks at the outer call site". That
holds only if the two paths call DIFFERENT hooks, and they don't: both are
`useState` → `useRef`+`useEffect` → `useReclampOnResize`, both render an
identical `<PanelRnd>`, and the only difference is whether storage is read on
mount and written on a move. So the branch was never a rules-of-hooks problem.

Worked: `useDraggablePanel` takes `persistKey: string | undefined` and guards
the read and the two writes; `FloatingPanel` calls it directly and renders
`PanelRnd`. The three middle components are gone — 262 lines, most of them the
same ~18-prop shape declared and forwarded four times over. The value driving
the branch (`claims.remembersRect ? persistKey : undefined`) was already
computed in `FloatingPanel`, one line above where it used to be passed down
three levels to be tested.

The hook had NO tests of its own — `useDraggablePanel.test.ts` covered only
the pure `clampToViewport`. Nine added, paired keyed-against-keyless so the
shared path is what's asserted; both halves verified by planting.

## F-floating-panels-14 · `dead-ref-in-the-hook` · `useDraggablePanel` syncs a ref nothing reads — WORKED

`useDraggablePanel.ts` keeps a `rectRef` and an effect to sync it, with a
comment saying the resize listener clamps against it. The listener lives in
`useReclampOnResize` now and keeps its own ref for that reason, saying so.
The hook's own ref was written every render and read nowhere. Found working
F-floating-panels-13; removed in the prose pass.

### Ruled already, recorded so the re-read does not re-raise them

- **`escapeRank: 'family'`** exists for chat alone, and its docstring says so
  and says nothing else should reach for it. Deliberate; stays.
- **`[data-shape='card'] .body { padding: 1rem }`** is annotated bespoke on
  purpose (padding is parked). Stays. The titlebar's `padding-inline: 0.7rem`
  and the body's `0.4rem 0.5rem` are paddings too, parked.
- **A `minWidth` could outrank the viewport** — WORKED 2026-09-11, out of the
  todo's Someday on the two `minWidth: 320` strays. `clampToViewport` applied
  the floor with `Math.max` AFTER capping to the viewport, so the floor won: a
  blocking card sat 8px off the right edge at 320px. It landed only on cards
  because every window family becomes a full-screen sheet on a phone and throws
  its rect away — so the one shape still using a width was the one with the
  largest floor, i.e. every confirmation and every fault modal. The cap now
  wins, which is what the function's own docstring claimed and what
  `FloatingPanel.module.css` leans on when it says a card needs no phone rule.
  No caller changed; it is a no-op above 336px.

  Both `minWidth: 320` values then went (`BlockingModal`, `SetupGameModal`):
  with the clamp fixed they governed nothing anywhere, since a floor stops a
  DRAG and neither panel can be resized, and the panels' own widths (420, 480)
  always exceeded them. Measured against the shell's 240 default at seven
  viewports — identical geometry at every one — so the removal is a no-op and
  `defaultSize` is now the only width statement either panel makes.
- **The card's fixed `420` width and the shell's `480×360` / `240` defaults**
  are seeds in TSX, not vocabulary values; the todo's Someday item on minimum
  sizes covers `minWidth: 320`.
- **The two scrim shades** (40% / 45%) are the todo's Someday question and
  are not re-raised.

## The prose pass, file by file

F-1 through F-6 and F-12 are one job wearing seven names — the same pass done on
`FloatingPanel.tsx`, run over the rest of the folder on 2026-09-11. Measured at
the end rather than claimed: **zero `/**` on a member anywhere in the folder**,
no `§20`, no `F26`, no census, and none of F-3's names.

Two things worth knowing beyond the mechanical cuts:

- **`useReclampOnResize`'s `recenter` had the folder's worst offender** — a
  26-line `/**` on a PARAMETER, inside the signature. It carried the real rule
  (re-center unless the panel remembers where you put it) plus three paragraphs
  of how it got there. The rule stays, as `//`; the history goes.
- **F-12's `backdrop` reached further than docs/ui.md.** The same non-existent
  prop was named in `SetupGameModal.tsx`'s docstring (which also still claimed
  "Chat at z-index 10000") and in `docs/states.md`. Both fixed, since a
  docstring naming an API that does not exist is a falsehood about THIS folder
  wherever it lives.

**Not swept, and a decision if you want it made:** other areas' files use
"backdrop" as a common noun for the scrim — `grep -rn backdrop src docs` finds
them, and the closing re-read found more than the first pass listed
(`FaultModal.module.css`, `Chat.tsx`, `PauseOverlay.module.css`, the
celebration modal, `SetupGameModal.module.css`, codenamesduet's Help,
crosswords' jump modal with a `.backdrop` class of its own, and the
vocabularies guard's own message). None names a prop,
so none is false; they are drift from the word the code uses (`--scrim-color`,
`.scrimDark`). Whether "backdrop" is banned in favor of "scrim" is a vocabulary
ruling with a guard attached, not a sweep to do quietly.

## The closing re-read

The whole area in one sitting, 2026-09-11, after the prose pass — every file on
the roster, the four files the area created, and the two docs/ui.md sections
the folder answers to. Fourteen things, all WORKED the same sitting. The
pattern the process predicts held: most are claims a sibling file or a later
fix had disproved, and four of them were written by this area.

## F-floating-panels-15 · `card-has-no-close-glyph` · Three notes say a card can be left by its ✕ — WORKED

`ConfirmationBlockingModal`'s `onCancel` ("Cancel, Escape, or the ✕"),
`AcknowledgeBlockingModal`'s `onAcknowledge` ("The button, Escape, or the ✕ —
all three") and `askConfirmation`'s docstring ("`null` on cancel, Escape, the
✕…"). A card has no titlebar and so no ✕ — `BlockingModal`'s own `onClose`
note says exactly that, one file over. Escape and the button are the two ways
out.

## F-floating-panels-16 · `one-renderer-claim` · "Nothing renders this directly except the host" is false — WORKED

`ConfirmationBlockingModal`'s docstring said so in bold, and
`SuspendConfirmationBlockingModal` renders it directly. docs/ui.md → Confirm
modals said both things in one section — "nobody renders the modal themselves"
and, below it, "the `SuspendConfirmationBlockingModal` (a wrapper over
ConfirmationBlockingModal)". Both now state the fact: the host renders it for
every `askConfirmation`, and the suspend question is the one still rendered by
hand. Whether the leave flow should await `askConfirmation` like every other
question is a decision with GamePage's flow in it, so it is handed to
`pause-suspend/todo.md` rather than made here.

## F-floating-panels-17 · `normal-modal-docstring-contradicts-itself` — WORKED

"…so on `<NormalModal>` the key is accepted and then discarded at runtime.
Here it cannot be passed at all." The first sentence names the wrong
component — the shell is what would accept and discard it; `NormalModal` is
the one that omits it from its props. Written by this area.

## F-floating-panels-18 · `copy-for-text` · "copy" for a message's words, six times — WORKED

`confirmations.ts` three times ("one copy object", "the copy REASSURES", "the
copy WARNS") and docs/ui.md → Confirm modals three times. "Copy" is banned for
this sense; the words of a message are its text. The other two "copy"s in the
folder mean a duplicate and stay.

## F-floating-panels-19 · `marker-claims-the-wrong-reader` · `data-floating-panel` is read by one thing, and the prose named others — WORKED

`FloatingPanel.tsx` said the marker is "which the game key-capture hooks
already look for", and lower down that "the action dispatcher and the page's
tab ring bail for events focused inside it". Checked: the only reader outside
this folder is `actions/dispatcher.ts`. The page's ring yields by the ring
stack — innermost wins — and never looks at the attribute; game key capture
goes through the dispatcher. docs/ui.md → Confirm modals made the same
"game key-captures bail" claim. All three now name the dispatcher, and the
shell's comment says Tab needs no marker.

## F-floating-panels-20 · `stale-320-in-the-test` · The clamp test says the card asks for 320 — WORKED

`useDraggablePanel.test.ts`'s narrow-viewport block: "which asks for 320", and
"a 320 floor" in the fixture's comment. The card passes no `minWidth` since
this area removed the stray; the fixture keeps the floor that showed the fault
and now says so. Exactly the case the re-read exists for — a count one group
corrected, standing in a sibling file.

## F-floating-panels-21 · `misplaced-fit-comment` · A paragraph on `fitContent` sitting on the hook that doesn't take it — WORKED

`FloatingPanel.tsx`'s call to `useDraggablePanel` carried a second paragraph
on why `fitContent` is safe to forward to a persisted panel. `fitContent` is
not an argument of that call; the paragraph was a leftover from the forwarding
chain F-13 removed, and the prop's own `//` note already carries the rule.
Deleted.

## F-floating-panels-22 · `rank-of-rationale-in-docstring` — WORKED

`usePanelEscape.ts`'s `rankOf` had two paragraphs of why in its `/**` — why it
reads the stylesheet rather than keeping a table, why it caches, what the
jsdom fallback means. The docstring is one sentence now, and each reason is a
`//` on the line it defends.

## F-floating-panels-23 · `layout-diagram-incomplete` — WORKED

`FloatingPanel.module.css`'s header diagram showed `.rnd` → `.shell` →
`.titlebar` / `.body`, omitting the clip layer outside and the content column
inside — the two elements the file spends the most words on. Both drawn in.

## F-floating-panels-24 · `filed-issue-in-the-scrim-comment` — WORKED

The scrims' comment restated the todo's Someday item — the two values, that
nobody can see the difference, the proposal on the table. A filed item does
not also sit in a comment; the comment keeps the durable statement (the shade
is the family's choice) and the todo keeps the question.

## F-floating-panels-25 · `stale-sibling-and-closed-area` · `modalActions.module.css` — WORKED

"Imported directly the same way setupForm.module.css / PlayArea.module.css
are" — no file of that name exists. And the button floor's note deferred to
"the `forms` area's question"; `forms` closed 2026-09-11 with nothing on a
control's minimum width in its doc. The note now states the condition (the
vocabulary has no such value) and defers to nobody.

## F-floating-panels-26 · `census-in-end-game-confirm` — WORKED

`END_GAME_CONFIRM`'s docstring listed End's placements ("the info-row button,
the menu item, the pause overlay's escape hatch"). All three exist, and all
inherit the question from the registry — which is the condition, and what the
docstring says now.

## F-floating-panels-27 · `todo-carries-a-done-report` — WORKED

`todo.md`'s minimum-size item narrated the `minWidth` fix at length ("Both are
GONE (2026-09-11)… That is fixed in the clamp"). A todo holds what is owed;
the fix is recorded above and in the clamp's docstring. Trimmed to the
companions still eyeballed.

## F-floating-panels-28 · `area-file-said-not-touched` — WORKED

F-14's heading said WORKED and its body said "not touched". The ref went in
the prose-pass commit; the body says so now.

## F-floating-panels-29 · `missing-docstrings` · Three exported types and a docstring on the wrong line — WORKED

Joel, reading the diff: `ConfirmOptions` has no docstring. A scan of every
top-level declaration in the folder and the four created files found the
rest: `FloatingPanelProps` and `AcknowledgeOptions` had none either, and
`rankOf`'s docstring sat above `rankCache`, documenting the cache. Six private
helpers took a one-liner (`notify`, `subscribe`, `readRect`, `writeRect`,
`onKeyDown`, `Entry`, the guard's `sourceFiles`). A component's `Props` block
and the hook's `PanelOpts` take none: the docstring that answers "how do I
call this" is the component's own. Test fixtures and module-level state left
alone.

**Two things the re-read looked at and left.** `confirmationService.ts`'s
module docstring sits after its imports rather than before them, which is
where the test files put theirs; nothing rules on placement, and the orphan
guard is content. `SuspendConfirmationBlockingModal.tsx` repeated four of this
area's faults — `backdrop`, "X" as a way out, "game key-captures" for the
dispatcher, `/**` on props — and those are fixed (Joel: fix what is
comments-only), a conformance edit where this area owns the rule; the file
stays `pause-suspend`'s and `cs-unmet`, and comes off the backdrop list below.

## Notes

- **The word "panel" alone appears nowhere in the folder** outside "floating
  panel" and "draggable panel". Good.
- **`useConfirmation` is GONE** (2026-09-11), and the note that used to sit
  here — "nothing is wrong, but the hook cannot ask one" — undersold it. Both
  paths took the same `ConfirmOptions`, and the hook accepted `alternativeLabel`
  and silently dropped it, with a `Promise<boolean>` that could not have named
  the second yes anyway. A shared options type where one consumer honors a
  field and the other ignores it is the drift `FAMILY` exists to prevent.

  What decided it was that the hook's premise did not hold: `<ConfirmationHost>`
  is mounted unconditionally at `App.tsx:236`, and `scrabble`'s Pass shows a
  COMPONENT awaiting `askConfirmation` directly. So "for a component that can
  render the modal itself" described a mechanism nobody needed — `WordEditDialog`
  used the hook because it was written that way, not because it was a component.
  Eight files imported that module and exactly one imported the hook; the rest
  wanted the vocabulary, which is why the file is now `confirmations.ts` (types
  and the canonical questions, no JSX) and `confirmationService.ts` no longer
  imports its types from a file named for a hook it never called.

  One way to ask, so there is nothing left to keep in sync. The delete path had
  no test at all; two added, verified by planting.
- **The vocabularies guard has no row for this folder**: every non-padding
  value is a token or an annotated fraction of the titlebar height.
- **Every stylesheet rule is marked** `/* @@ */`.

## Predicted test breaks

*(written when the area starts changing things)*

- F-floating-panels-8 (typeof-window-guards): `useDraggablePanel.test.ts`
  reads jsdom's window; unaffected.
- F-floating-panels-7 (todo-in-a-docstring): none — `phone` had no caller, so
  no spec covered it. `edgeMargin`, still open, is the same.
- F-floating-panels-1 through -6, -12: prose; nothing runs differently.
- F-floating-panels-13 (panel-variant-components): none, and that was the
  risk — the merged path had no spec at all. `useDraggablePanel.test.ts` now
  covers it; the whole suite stayed green through the merge.

## Files this area created or renamed

Four, none of them on the roster the area opened with — so they join it at close:

| file | why it exists |
|---|---|
| `floating-panels/confirmations.ts` | `useConfirmation.tsx` renamed once its hook was deleted. It was never a hook file in substance: eight importers, one of which wanted the hook |
| `keyboard/useDismissOnEscape.ts` | the shared answer for an overlay that is NOT a floating panel, so one Escape dismisses one thing |
| `keyboard/useDismissOnEscape.test.ts` | its spec, paired against a stand-in panel registry |
| `guards/escapeListeners.test.ts` | fails a hand-rolled global Escape listener outside the three files that own the key |

Deleted: `useConfirmation.tsx` (the hook; the file lives on as `confirmations.ts`).

## Closing

- [x] the whole area re-read in one sitting after the last group (2026-09-11,
      F-15 through F-28; F-29 from Joel's read of the diff)
- [x] the folder's `doc.md` Design written; its row off `DESIGNS_OWED` (lede and
      Design brought up to the folder as it closes, 2026-09-11)
- [x] `todo.md` holds everything still owed; nothing durable left in this file
- [x] every file on the roster blessed, or its stamp says why not (Joel,
      2026-09-11: "mark all files as blessed" — the nineteen roster files and
      the three created outside the folder)
