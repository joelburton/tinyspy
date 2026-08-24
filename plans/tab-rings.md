# Tab rings — the plan

**A PLAN, not a description.** It is here to be built and then deleted; the
durable parts fold into [docs/keyboard-shortcuts.md](../docs/keyboard-shortcuts.md)
and [docs/ui.md](../docs/ui.md) as each surface converts.

**Status: the mechanism is BUILT** (`common/hooks/input/useTabRing.ts`) and two
surfaces declare rings — the homepage's one list and the club page's two.
Everything else still answers Tab its own way and converts as its area comes up;
the table below is the map of what is left.

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
| stackdown · bananagrams · waffle · connections · scrabble | nothing (`useSwallowTab`) | empty ring |
| boggle · spellingbee · wordle · wordwheel · wordiply · psychicnum | nothing (`useCaptureKeys`' Tab clause) | empty ring |
| strands · setgame | nothing, inline in their own key handlers | empty ring |
| codenamesduet's clue form | count input ⇄ word input (`CluePanel.trapTab`) | ring, hand-built |
| any floating panel · setup / confirm dialogs | native — **leaks to the URL bar** | broken |
| chat box · scratchpad | hands the keyboard back to the game | ring transition |
| crosswords | next / previous clue — **a game move** | genuine exception |

Five of the eight are the same statement written four different ways ("this
surface has no ring") plus one written by hand for one form. That is the
duplication this removes — and `useSwallowTab` is now documented as what it
actually is, `useTabRing([])` written before rings existed.

### The leaks

Three kinds, all pre-existing:

1. **Nothing handles Tab at all** — letterboxed, and codenamesduet's *board*
   (only its clue form traps Tab). Tab walks the page chrome and out.
2. **Something deliberately steps aside and nothing catches the far end** —
   every floating panel and dialog. `FloatingPanel` stamps `data-floating-panel`
   so the game's window handler bails and native Tab runs inside; native Tab
   then runs straight out the other side.
3. **A doc that describes a trap nobody built** —
   `docs/keyboard-shortcuts.md:90` says a floating panel "cycles focus inside
   the panel (focus trap)". There is no focus trap in `FloatingPanel`; grep it
   for `Tab` and the only hit is a comment explaining that native Tab is allowed
   through.

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

That is the same mechanism, not a second one, which is what lets `useSwallowTab`,
`useCaptureKeys`' Tab clause, and the inline swallows in strands and setgame
collapse into one thing. All four already consume rather than ignore, so the
eleven games qualify as written.

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
  bring to it is that chat closes on Escape and the scratchpad does not
  (`GameScratchpad.tsx:48` passes `closeOnEsc={false}`; chat takes
  `FloatingPanel`'s default of `true`). Both `docs/keyboard-shortcuts.md:90` and
  a comment in `e2e/club-keyboard.e2e.ts` currently claim otherwise, and the
  spec passes only because it clicks the ✕ and never presses Escape.
- **What happens to `useTabToLists`** — it is deleted (Joel, 2026-08-24). It is
  scaffolding for one broken page, not a piece of the design; see above.
