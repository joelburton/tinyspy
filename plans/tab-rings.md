# Tab rings — the plan

**A PLAN, not a description.** It is here to be built and then deleted; the
durable parts fold into [docs/keyboard-shortcuts.md](../docs/keyboard-shortcuts.md)
and [docs/ui.md](../docs/ui.md) as each surface converts.

**Status: RUNNING as one sprint, nested inside app-audit (Joel, 2026-09-10).**
The mechanism is BUILT (`common/keyboard/useTabRing.ts`) and two surfaces
declare rings — the homepage's one list and the club page's two. Everything
else still answers Tab its own way. The original sequencing ("convert each
surface as its area comes up") is superseded: converting piecemeal would leave
two Tab stories in the app for months, and the `lists`, `forms` and
`floating-panels` areas should audit their subjects rather than also converting
them. **Part II below is the build order.** Part I stays the design and outranks
it.

## The rule, in one line

**Tab moves within a ring of stops this surface declared, and never leaves it.**
Shift+Tab is the same ring backwards. The browser's own chrome — the URL bar
above all — is never a stop.

Two consequences, both Joel's (2026-08-24):

- **Only a few things on a page can be reached by Tab.** On the homepage that is
  the clubs list and nothing else. On the club page it is the two lists and
  nothing else. The header menu, chat, the filters, "+ New club" are not
  reachable by Tab, and that is the intended answer, not an oversight.
- **Reachability is a list you edit, not a suppression you maintain.** If the
  scratchpad's ✕ should be reachable, it goes in the ring. Nothing is reachable
  by accident of being a `<button>`, and nothing needs `tabIndex={-1}` to be
  kept out.

## Why native Tab cannot do this

It was tried in conversation and it fails on the first requirement. Even with
every other element made unfocusable, a page with one tab stop still hands Tab
to the browser chrome: the browser always includes itself in the cycle and no
page attribute removes it. **Containment is the part that has to be built** —
which is also why "a dialog just uses native Tab within itself" is not the cheap
option it looks like. Native Tab has no notion of *within*.

## What is there now — eight behaviors, five of them one idea

| surface | Tab today | |
|---|---|---|
| homepage · club page | **converted** — `useTabRing`, one stop and two | ring |
| stackdown · bananagrams · waffle · connections · scrabble · strands · setgame | nothing (`useSwallowTab`) | empty ring |
| boggle · spellingbee · wordle · wordwheel · wordiply · psychicnum · letterboxed | nothing (`useCaptureKeys`' Tab clause, through `<EntryRow>` or directly) | empty ring |
| codenamesduet's clue form | count input ⇄ word input (`CluePanel.trapTab`); its board declares nothing and leaks | ring, hand-built |
| any floating panel · setup / confirm dialogs | native — **leaks to the URL bar** | broken |
| chat box · scratchpad | hands the keyboard back to the game | ring transition |
| crosswords | next / previous clue — **a game move** | genuine exception |

Two of the rows are the same statement written two different ways ("this
surface has no ring") plus one written by hand for one form. That is the
duplication this removes — and `useSwallowTab` is documented as what it
actually is, `useTabRing([])` written before rings existed.

### The leaks

Three kinds, all pre-existing:

1. **Nothing handles Tab at all** — codenamesduet's *board* (only its clue
   form traps Tab). Tab walks the page chrome and out. (letterboxed renders
   `<EntryRow>`, so it has `useCaptureKeys`' swallow.)
2. **Something deliberately steps aside and nothing catches the far end** —
   every floating panel and dialog. `FloatingPanel` stamps `data-floating-panel`
   so the game's window handler bails and native Tab runs inside; native Tab
   then runs straight out the other side.
3. **A trap for some families and not others** — `useFocusTrap` holds Tab
   inside the three modal families (`trapsFocus` follows the scrim), while a
   companion or a dialog lets native Tab run straight out the other side.
   `docs/keyboard-shortcuts.md`'s floating-panel row says which is which.

## The design

### A ring

An **ordered list of stops**, declared by the surface that owns them. A stop is
an element. The list is explicit — never "whatever happens to be focusable" —
because that is what drags in the header menu and the hover-revealed delete ×,
and what makes the answer to "should this be reachable?" a code edit rather than
an argument.

### Innermost wins

Rings stack. A dialog's ring beats the page's while the dialog is open; the page
gets it back when the dialog closes.

**This is the part that pays for itself immediately.** Three handlers today
carry a hand-maintained `closest('[data-floating-panel], [role="menu"], [role="dialog"]')`
guard — `useTabToLists`, ClubPage's `⇧<` shortcut, and `useGlobalKeyHandler`'s
own bail. Every one of them is a selector list that goes stale the day someone
adds an overlay matching none of the three. If an overlay *registers* a ring,
the page's ring is simply not innermost and the guards go away.

### An empty ring is a ring

"This surface has no Tab stops" is a ring with no members: Tab and Shift+Tab are
inert. **Caught and consumed, not unhandled** — the distinction is the whole
point, since an unhandled Tab escapes to the URL bar and a consumed one cannot.

That is the same mechanism, not a second one, which is what lets `useSwallowTab`
and `useCaptureKeys`' Tab clause collapse into one thing. Both already consume
rather than ignore, so the fourteen games qualify as written.

### Tab is never native — a text field is a STOP, not an exception

The tempting rule is "yield to a focused text field, because tabbing between a
form's fields is the one place native Tab is right". It is wrong, and it is a
leak: yield, and Tab from the last field of a form goes straight to the URL bar.

A form's fields are its ring's stops. Then tabbing between them IS the ring
cycling, there is no yield, and the invariant holds without an exception:
**every focusable thing belongs to exactly one ring, and Tab is never native.**

The precedent agrees — `CluePanel.trapTab` does not yield to its two inputs, it
is their ring.

(Today's code does yield: `useGlobalKeyHandler` bails for INPUT / TEXTAREA /
SELECT / contenteditable. That is right for *its* job, which is keeping a game's
window-level keys off a chat box, and it is not a ring; the two must not be
confused when this is built.)

### Chat's Tab is a ring transition, not an exception

Chat and the scratchpad use Tab to hand the keyboard back to the game. That is
"leave this ring for the outer one", which the design can express. Only
crosswords is a true exception.

### `useTabToLists` is scaffolding, and it goes

It shipped on 2026-08-24 because the homepage was broken without it — swallowing
Tab on a page with a list is a trap, and there was no key left that handed the
keyboard back. It has no reason to exist once rings do: **a ring of one list, a
ring of two lists, and a ring of two form fields are the same object**, so
nothing about it is list-flavored except its name and its callers' expectations.
The homepage will call whatever every other surface calls.

What survives is its BODY, which is most of what a ring does and already gets
two of the hard parts right: it catches Tab and Shift+Tab alike, and it
`preventDefault()`s **before** checking whether there is anywhere to go — so a
surface with no stops already behaves as an empty ring rather than leaking.

Two things in it are wrong for the general case and do not survive:

- **Its `closest('[data-floating-panel], [role="menu"], [role="dialog"]')`
  guard**, replaced by innermost-wins. It is the only genuinely fragile part.
- **Its members being lists.** A stop is an element; that the homepage's happens
  to be a SelectionList is a fact about the homepage.

### Where a ring is declared — a mount-ordered stack, not a context

**Built 2026-08-24 as a module-level stack**, and the reasoning that pointed at
a React context was wrong for a reason worth recording: the thing that has to
decide *which ring is innermost* is a **window listener**, and a window listener
sits in no subtree. Context nesting expresses innermost beautifully to
components; it cannot reach the one place the answer is needed.

Mount order carries the same information, and React maintains it for free — a
page mounts, a dialog opens over it and pushes later, so the innermost ring is
simply the last one on the stack. That is not the hand-maintained ordering the
earlier objection was about; nobody writes it down.

Every ring attaches its own listener and every ring hears every Tab; only the
one on top of the stack answers. So there is no listener lifecycle to manage
either.

## Crosswords stays out, and it costs nothing

**It already satisfies the rule on its own.** `useGridKeyboard:195` does
`e.preventDefault()` then `jumpClue(grid, cursor, e.shiftKey ? -1 : 1)`: Tab and
Shift+Tab move to the next and previous clue, and the key never reaches the
browser. So leaving it out leaves no hole.

**And it cannot join, for a sharper reason than "it's different".** Line 107
reads `if (isNonGameField(e.target) && e.key !== 'Tab') return` — crosswords
claims Tab *even from inside a text field*, which is the exact opposite of the
rule above. Opposite contracts on the same key; not a near-miss worth bending
the design for.

**But it is not a different KIND of thing**, and that is worth writing down so
nobody tries to unify them later. A SelectionList is one focusable container
whose internal cursor moves on arrows, with Tab moving *between* containers.
Crosswords is one focusable surface whose internal cursor moves on Tab. Same
shape — it spent Tab on the inside instead of the outside. The rule underneath
both is **Tab has one owner per surface**; the ring is just the common owner,
and crosswords spent it elsewhere.

## Sequencing

**The z-ladder precedent governs** (F22 `z-ladder`, Joel 2026-08-22: *"build
this now (not changing other things to it yet; only as we 'meet' them will we
move items to the new layer vocab)"*).

So: **build the mechanism now, convert each surface as its area comes up.** The
homepage area needs it now, which is what makes it due. The leaks above get
recorded, not chased — letterboxed and codenamesduet leak today and will keep
leaking until their areas open, and that is the same bargain every other
cross-cutting vocabulary in this sprint took.

**Forms get their ring when the forms area comes up**, and they have a working
precedent rather than a blank page: `CluePanel.trapTab` is already a two-member
ring on a real form.

## Open

**Nothing needs a decision.** Two items that were on this list have been
answered:

- **The scratchpad's ✕ stays OUT of its ring** (Joel, 2026-08-24), so the
  scratchpad is a panel you leave with the mouse for now. **Escape is discussed
  at the crosswords area**, where the scratchpad surfaces — and the fact to
  bring to it is that both chat and the scratchpad close on Escape now: every
  `FloatingPanel` family is `escape: 'close'` except the fault modal, through
  `usePanelEscape`. Any older claim that one of them opts out is stale, and the
  spec passes only because it clicks the ✕ and never presses Escape.
- **What happens to `useTabToLists`** — it is deleted (Joel, 2026-08-24). It is
  scaffolding for one broken page, not a piece of the design; see above.

---

# Part II — the implementation plan

Written 2026-09-10 for a builder that has not read the conversation that
produced it. Part I is the design and outranks anything here; this part says
what to make, in what order, and what to delete. **Every step ends with
`npx tsc -b`, `npx eslint src e2e --max-warnings=0` and `npx vitest run` green
except for the breaks the step predicts, and with the work left in the tree for
Joel to review — nothing is committed unless Joel asks, per CLAUDE.md.** Stop
at the end of every step.

## II.0 Before starting — read, and the rules that bite here

Read, in this order: `CLAUDE.md`, `docs/code-conventions.md`,
`docs/common-folders.md`, `docs/keyboard-shortcuts.md` (the routing section
and the floating-panel row), Part I of this file, `src/common/keyboard/doc.md`,
then `src/common/keyboard/useTabRing.ts`, `src/common/floating-panels/useFocusTrap.ts`
and `src/common/floating-panels/FloatingPanel.tsx` (the `FAMILY` table and the
shell that carries `data-floating-panel`). Do NOT open `plans/playarea-readability.md`,
`plans/react-context.md` or `plans/css-system-outdated-dont-read.md`; do not
read or edit `src/common/devtools/`.

What is true today, checked 2026-09-10, so nothing below is re-derived:

- **Every key except Tab and Escape is an action** (`src/common/actions/doc.md`).
  One window listener, `common/actions/dispatcher.ts`, fires whichever bound
  action answers; it declines inside a focused text field (unless the action's
  `inField` allows) and inside `[data-floating-panel]`. Crosswords' Tab is
  `act-next-clue` / `act-previous-clue`, `inField: 'always'`, and stays there.
- **`useGlobalKeyHandler` has two callers left**, both Tab clauses:
  `useSwallowTab`, and the clause at the bottom of `useCaptureKeys`. Nothing
  else reads a game key by hand (`src/guards/registeredChords.test.ts`).
- **The empty ring is written three ways.** Seven PlayAreas call
  `useSwallowTab()` (bananagrams, connections, scrabble, setgame, stackdown,
  strands, waffle); seven get the swallow from `useCaptureKeys`' clause through
  `<EntryRow>` or directly (boggle, letterboxed, psychicnum, spellingbee,
  wordiply, wordle, wordwheel); codenamesduet's board has NO swallow — Tab
  leaks — and its clue form has a hand-built two-input ring (`trapTab` in
  `CluePanel.tsx`). Crosswords is the exception and declares nothing.
- **`useTabRing` carries a TRANSITIONAL guard**: it lets native Tab run when
  the target is inside `[data-floating-panel]`, `[role="menu"]` or
  `[role="dialog"]`. Two of the three terms are inert (nothing outside a
  panel carries them; the menu stops its own keys). It exists only because
  panels declare no rings yet.
- **The three modal families trap focus** (`useFocusTrap`, called by the
  shell when the family's `trapsFocus` is true); companions and dialogs let
  native Tab run out the far side. Chat and the scratchpad answer Tab by
  blurring their field (`keyboardHandoff.ts`) so the game hears keys again.
- **`useTabRing` has no test**, and its `onScreen()` — `offsetParent !== null`
  — is false for a `position: fixed` stop. `useFocusTrap` has the same check.
- **Eleven `tabIndex={-1}` sit on board pieces and the on-screen keyboard's
  caps** (waffle, connections, strands, psychicnum, setgame boards;
  `GuessKeyboard`), each with a comment calling it belt and braces beside the
  swallow. `Menu.tsx`'s rows carry one too, and `useFocusTrap`'s selector reads
  `[tabindex="-1"]` to exclude such elements.
- **Rings stack innermost LAST** and the listener answers only when its ring is
  last. (The actions binding stack is the other way, innermost FIRST, because
  bindings join from effects; do not confuse the two.)

Rules that will bite here specifically:

- **New files start `// cs-unmet`**; a new file needs `git add -N` before
  `src/guards/csStamps.test.ts` sees it. A file this work EDITS keeps its
  stamp; a sweep never moves a stamp — including `cs-blessed-keyboard` on the
  keyboard folder's files, which are edited and deleted here.
- **`/**` only on a file, type, function or component; a field or prop note is
  `//`.** No archaeology ("used to", "replaces", "for a while"), no caller
  counts, no citing this plan from a docstring or a `doc.md` — say the reason
  or point at `src/common/keyboard/doc.md`.
- **No `setState` inside an effect.** `useTabRing` reads through a ref.
- **Ask before running any e2e spec.** Unit tests run freely.
- **Say "floating panel", never "panel" alone.** American spelling.
- **Don't remove code unprompted** beyond what a step names for deletion.

## II.1 Step 1 — prove the ring

`src/common/keyboard/useTabRing.test.ts`, new. jsdom can drive all of it:
`document.activeElement` and `focus()` work; only the on-screen check needs
stubbing (see below). Render a component that declares a ring of two or three
`<button>`s through refs, mount the hook, dispatch `keydown` on `window` with
`{ key: 'Tab', bubbles: true, cancelable: true }` and read `activeElement`.
Cases:

- an empty ring consumes Tab and Shift+Tab (`defaultPrevented`, focus unmoved);
- Tab walks the stops in order and wraps; Shift+Tab walks backward and wraps;
- focus on no stop (`<body>`) enters at the first stop on Tab and the last on
  Shift+Tab;
- a stop whose ref is null (not rendered) is skipped; a stop that is not on
  screen is skipped;
- innermost wins: mount a second ring after the first and Tab moves within the
  second; unmount it and the first has Tab back;
- a modified chord (`ctrlKey`, `metaKey`, `altKey`) is left alone;
- the transitional guard: a Tab whose target is inside `[data-floating-panel]`
  is left alone (this case is DELETED in step 3 — write it so the deletion is
  one `it`).

**Fix `onScreen()`.** `offsetParent` is null for a `position: fixed` element,
so a fixed stop would be skipped as if unmounted. Replace with
`el.isConnected && el.getClientRects().length > 0`
(`checkVisibility()` is the alternative; jsdom implements neither
`getClientRects` sizes nor `checkVisibility` faithfully, so the test stubs the
one it uses). Make the same change in `useFocusTrap.ts`' `focusables()` filter
now; the trap is deleted in step 3 but should not carry a known hole until then.

`src/common/keyboard/todo.md`: the "useTabRing has no test" item closes.

**Predicted breaks:** none.

## II.2 Step 2 — the games, one sweep

Every game but crosswords says, once, in its `PlayArea`:

```ts
useTabRing([])
```

with codenamesduet the one variation — its clue form IS a ring, and the page
declares it:

```ts
// The clue form's two inputs are the ring while I am giving a clue; a
// guesser's board has nowhere for Tab to go.
useTabRing(isClueGiver ? [countRef, wordRef] : [])
```

(the refs already exist in `CluePanel.tsx` for `trapTab`; lift them, or have
`CluePanel` declare the ring itself — either is one ring. `trapTab` and both
`onKeyDown={…trapTab…}` go.)

Then delete, in this order and in this step:

1. `useSwallowTab.ts` and its seven call sites (the import too).
2. The Tab clause at the bottom of `useCaptureKeys.ts` — the whole
   `useGlobalKeyHandler((e) => …)` call and the import. Its docstring's "Tab is
   swallowed while the caret owns the keyboard" paragraph goes with it; the
   page's ring now says so. Note the one behavior change: the clause swallowed
   only while the entry was live, and a page ring swallows at terminal too.
   That is the rule (a surface with nowhere for Tab to go consumes it always)
   and the intended direction.
3. `useGlobalKeyHandler.ts` and `useGlobalKeyHandler.test.ts` — no callers
   remain. `editableField.ts` stays (the dispatcher and `useGameHasKeyboard`
   read it).
4. The eleven board-side `tabIndex={-1}` and the comments that explain them:
   `waffle/components/Board.tsx`, `connections/components/Board.tsx`,
   `strands/components/Board.tsx`, `psychicnum/components/Board.tsx`,
   `setgame/components/Card.tsx`, and the three in
   `shared/onscreen-keyboard/GuessKeyboard.tsx`. A board's `onMouseDown`
   `preventDefault`, where it has one, STAYS — that is what keeps a click from
   focusing a piece, and `tabIndex` never did that. `strands/components/PlayArea.tsx`
   has two comments about the swallow and the tiles' `tabIndex`; rewrite to
   the one sentence that is now true.
   **Leave** `Menu.tsx`'s row `tabIndex={-1}` and `useFocusTrap`'s selector
   until step 3.

`src/common/keyboard/doc.md`: the Design's Tab paragraph stays as written
(it already describes rings); the Details paragraph on `useGlobalKeyHandler`
and the one on `useSwallowTab` go, replaced by one sentence that every play
surface declares its ring in its PlayArea. `docs/keyboard-shortcuts.md`: the
"any play area" table's Tab row and the per-game Tab lines say `useTabRing([])`;
codenamesduet's row says its clue form is the page's ring. `docs/common.md`'s
one Tab paragraph still holds. Every game doc that names `useSwallowTab` or the
capture hook's swallow (grep `useSwallowTab`, `Tab clause`, `swallow`) says the
new thing in a clause, not a paragraph.

**Predicted breaks:** `useCaptureKeys.test.ts` — its Tab case (delete it; the
ring's test owns Tab now). `useGlobalKeyHandler.test.ts` — deleted with the
hook. `e2e/tab-swallow.e2e.ts` — should pass unchanged (same observable: focus
never leaves `<body>`); its header names `useSwallowTab` and lists five games,
rewrite to "every play surface declares an empty ring" and, if cheap, extend it
to one of the EntryRow games and to codenamesduet's board, which leaked before.
`e2e/codenamesduet-clueform.e2e.ts` — should pass (same observable: Tab toggles
between the two inputs); its header names `trapTab`. Ask before running.

**STOP for review** after this step — it is the widest sweep and the shape
should be approved before the panels take it.

## II.3 Step 3 — floating panels declare rings

This is where the design's one open question lives, and it has to be answered
before the code is written. See **D1** at the end of Part II. What follows is
written against the recommended answer; if Joel takes the other, the shape of
the ring changes and the rest of the step does not.

**`useTabRing` grows a second form of stop list.** Today a ring is
`TabStop[]`, refs the surface lists by hand. A floating panel's members are
its own controls in its own DOM order — the header's ✕, then the body's
fields and buttons — and a panel is a closed subtree with no page chrome to
leak in, so listing each control by hand would be a list nobody edits. So:

```ts
export type Ring = TabStop[] | { within: RefObject<HTMLElement | null> }
export function useTabRing(ring: Ring): void
```

A `within` ring's stops are, at keypress, the focusable descendants of the
element in DOM order — the selector `useFocusTrap` uses today, less the
`[tabindex="-1"]` exclusion, which the ring does not need — filtered by
`onScreen`. Same wrap, same entry-at-the-end rule, same innermost-wins.

**`<FloatingPanel>` declares `useTabRing({ within: shellRef })` for EVERY
family**, unconditionally: the shell already holds `shellRef` on the element
that carries `data-floating-panel`. Then:

- `useFocusTrap.ts` is deleted, along with `trapsFocus` in the `FAMILY` table
  and the shell's call; the three modal families trap because their ring is
  innermost, which is the same claim made once. A companion or a dialog, which
  let Tab out today, now keep it — that is the rule ("every focusable thing
  belongs to exactly one ring") and closes leak 2 in Part I. Chat and the
  scratchpad are the two that must not simply keep it, next.
- The TRANSITIONAL guard in `useTabRing` goes, and its test case with it: an
  open panel's ring is innermost, so the page's ring is not asked.
- Chat and the scratchpad: `keyboardHandoff.ts` stays, and its meaning is now
  exact — Tab in their text field is a declared step OUT of the panel's ring to
  the page's, done by blurring the field. Their ring is `within` their shell
  like every companion's; the field's own `onKeyDown` runs first on the element
  and `preventDefault`s, so the ring's later `preventDefault` is a no-op and
  focus lands on `<body>`, which is where the page's empty ring wants it.
  Shift+Tab stays native inside the panel ring (the ✕ is reachable), which the
  ring gives for free. Rewrite the helper's docstring to say "step out of this
  ring", not "hand the keyboard back".
- **The menu.** `Menu.tsx`'s popover handles Tab by closing and NOT preventing
  default, so native Tab then runs from wherever focus lands — a leak the plan
  did not list. Tab while the menu is open closes it AND is consumed
  (`preventDefault`); the next Tab is the page ring's. The rows' `tabIndex={-1}`
  can then go too: the popover stops its own keys, so nothing native ever walks
  them. Two lines and a comment.
- `InfoSheet` (the mobile info page, `role="dialog"`) declares nothing: it is
  part of the game page, whose ring is empty, and its buttons are tap targets.
  Write that down in a comment where the `role` is set.

**Predicted breaks:** the ring test's transitional-guard case (deleted);
`useFocusTrap` has no test. `e2e/suspend-dialog.e2e.ts`, `e2e/chat-keyboard.e2e.ts`
and `e2e/club-keyboard.e2e.ts` press Tab in or around panels — read each
before running and predict; `chat-keyboard` should pass (same observable), the
others should pass unless one asserted that Tab LEFT a dialog. Ask before
running.

## II.4 Step 4 — forms get rings

With D1 as recommended, most forms already have theirs: every `StandardForm`
inside a floating panel (setup, create club, edit club, edit profile, word
edit, the anagram and lookup dialogs) sits in a panel whose `within` ring holds
its fields. What is left:

- **The two page-level forms** — `auth/LoginScreen.tsx` and
  `auth/ClaimHandleScreen.tsx` — declare `useTabRing({ within: formRef })` on
  their `StandardForm`, or `StandardForm` takes a `ring` prop and does it, so a
  page that is nothing but a form has its fields as its ring. Pick the one that
  reads better in `StandardForm.tsx`; the login page's ring is its input and
  its button.
- **codenamesduet's clue form** is done in step 2.
- **The crosswords rebus box and number-jump popup** own their own Tab (the
  rebus input's Tab commits and jumps a clue; the popup's input stops
  propagation). Both are focused inputs inside crosswords' own overlays and are
  the exception's exception; leave them, and say so in `docs/keyboard-shortcuts.md`'s
  crosswords section if it does not already.

**Predicted breaks:** `LoginScreen.test.tsx` / `ClaimHandleScreen.test.tsx`
only if they assert Tab order (read them); `e2e/home-keyboard.e2e.ts` should
pass.

## II.5 Step 5 — fold the plan

`src/common/keyboard/doc.md` already carries the ring model in its Design;
what it gains is the `within` form, the panels declaring theirs, and the
step-out rule. `docs/keyboard-shortcuts.md`'s routing section says "Tab is a
ring's" in one paragraph and the floating-panel row says every family keeps
Tab. `docs/ui.md`'s Confirm-modal paragraph drops the words "focus is trapped"
in favor of "its ring is innermost". Then `plans/tab-rings.md` is deleted, its
row in CLAUDE.md with it, and the `keyboard/todo.md` items about the swallow and
the handoff's successor close (the handoff is not replaced — it is the step-out,
and the doc says so).

## II.6 What to leave alone

- Escape, everywhere: `usePanelEscape`, `useBacktickEscape`, and the three
  private Escape listeners (`InfoSheet`, `DefinitionPopover`, `FilterSelect`)
  — Joel: leave them; they are `floating-panels`' to fold.
- `SelectionList`'s arrow / Home / End / Page keys: a stop's own internal
  cursor, not Tab.
- The action dispatcher and every binding; `editableField.ts`.
- The `/* @@ */` CSS markers, every `cs-` stamp on an edited file, and
  `common/devtools/`.

## D1 — the one decision: is a floating panel's ring declared or discovered?

Part I says a ring is **declared, never discovered**, and gives the reason:
discovery is what drags in the header menu and a hover-revealed delete ×, and
a declared list makes "should this be reachable?" a code edit. That reason is
about a PAGE, whose DOM holds chrome the ring must keep out.

A floating panel is different in the one way that matters: it is a closed
subtree, and everything focusable inside it is the panel's own — its ✕, its
fields, its buttons. There is nothing to keep out, so a hand-written list would
only ever be "all of them, in order", written once per form and drifting the
first time a field is added. `useFocusTrap` already works this way today for
the modal families, and nobody has wanted a modal control to be unreachable.

**PROPOSED: a panel's ring is its focusable descendants in DOM order
(`{ within: shellRef }`), declared once by the shell for every family; a page's
ring stays an explicit list.** The invariant holds either way — every focusable
thing belongs to exactly one ring, Tab is never native — and the difference is
only how a panel's members are spelled. If Joel prefers explicit lists inside
panels too, `useTabRing` keeps its `TabStop[]` form only, every
`StandardForm` takes a `stops` prop listing its field refs in order, and the
shell's ring is `[closeRef, ...form stops]`; steps 3 and 4 then touch every
form file rather than the shell. **Decide before step 3.**
