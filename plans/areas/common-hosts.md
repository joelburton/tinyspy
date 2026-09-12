# Area: common-hosts

The folders it reads: `toasts` · `tooltips` · `faults` · `invitations`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN 2026-09-11.** Roster agreed (Joel: "just the ones you listed are
in the area. audit the area") and the eighteen code files stamped
`cs-audited-common-hosts`. Findings recorded from one read of all twenty-three
files, the three doc sections they answer to, and every cross-file claim a
docstring makes. The two behavior findings (F-2, F-3) were CHECKED with a
throwaway spec before being written down — both reproduced — and the spec was
deleted after the run. Worked so far: F-1 (the area's own question), F-25,
F-24's corner inset, F-6, F-2 — and, riding on two of those, the halves of F-9
they consumed.

## The roster

Four folders, twenty-three files, eighteen of them code:

| folder | files | what it is |
|---|---|---|
| `toasts` | `Toast.tsx` + `.module.css` + `.test.tsx` · `ToastHost.tsx` + `.module.css` · `toastStore.ts` · `doc.md` · `todo.md` | the bottom-right announcement stack: the store any code pushes into, the one host that renders it, the card |
| `tooltips` | `TooltipHost.tsx` + `.module.css` + `.test.tsx` · `doc.md` · `todo.md` | the one renderer behind every `data-tooltip`: hover after a beat, focus-visible, long-press on touch |
| `faults` | `FaultModal.tsx` + `.module.css` · `faultStore.ts` + `.test.ts` · `doc.md` · `todo.md` | the fault queue and the blocking modal that shows its head |
| `invitations` | `GameInvitations.tsx` · `gameInvites.ts` + `.test.ts` · `useGameInvitations.ts` + `.test.ts` · `doc.md` · `todo.md` | being added to a game: the watcher, the pure filter + the seen set, and the headless mirror into the toast store |

Left off, on Joel's word: `EditProfileModal` (`account`) and `WordEditDialog`
(`definitions`), which App.tsx also mounts at the root; `AppActionsHost` and
`ConfirmationHost`, which are `actions`' and `floating-panels`'.

**Callers, for evidence (read, not stamped).** `App.tsx` mounts all four hosts
after the auth gates. `showToast`: `GameInvitations` (stable id per invite),
`useClubSetupPresence` (stable id, `dismissible: false`), `ClubPage` (a
success with `DEFAULT_TOAST_MS`, an error with none). `showFaultModal`:
`reportDbFault` in `dbEnvelope.ts` is the route every wrapper takes; three
call it directly — `HomePage` builds a diagnostics line of its own,
`useGameTimer` and `useWordSubmit` pass a sentence and no line. `data-tooltip`
is written by `StandardButton`, `PageHeaderButton`, `actionSurface` (which is
where `ShuffleButton` and `PauseButton` get theirs), crosswords' `Controls`,
letterboxed's `ChainStrip`. `window.pupfault` is called by two e2e specs
against the dev server; `window.puptoast` by nothing.

**The docs.** docs/ui.md → Toasts, docs/ui.md → Faults (a `####` under
Feedback pill) and docs/ui.md → Button iconography → Conventions (the tooltip
bubble) are the owning sections; docs/common.md → Joining a game — the
invitation popup is the invitations' one. All four four-line `doc.md` files
are on `DESIGNS_OWED`.

## Findings

### The area's question

## F-common-hosts-1 · `root-mount-rule` · What earns a mount at the root — the plan row's question, and App.tsx has already answered it

**DECIDED 2026-09-11 (Joel): the wide rule.** A thing is mounted at the root
when its state crosses subtrees, and a store is how a page reaches it. It
covers all six root mounts — the three hosts, the headless watcher, and the two
`FloatingPanel` instances whose positioning keeps them out of a page column —
so no second rule is needed and no mount is an exception.

The rule's durable home is App.tsx's docstring, which already words it: "Each
is a singleton whose state crosses subtrees, which is why none of them lives in
a page." Nothing in code changes. What the decision fixes is the sentence each
of the four folders owes its Design, which lands when the Designs are written:
*mounted once at the root because its state crosses subtrees; the store is how
a page reaches it*.

The row's second question, whether the stores come with the components, was
moot on arrival: every store already sits in its component's folder.

The rejected alternative, for the record: the *narrow* rule — a root mount
renders other people's content. It admits only `ToastHost`, `TooltipHost` and
`FaultModal`, and then needs a second name for `GameInvitations` (headless, and
there is no subtree it could watch every club from) and a third for
`EditProfileModal` / `WordEditDialog` — one rule and two exceptions covering
half the list.

### Behavior

## F-common-hosts-2 · `touchcancel-leaves-click-armed` · A long press ended by `touchcancel` swallows the next tap anywhere — CHECKED, WORKED

`TooltipHost`'s long-press timer sets `suppressClick = true` so the click the
browser synthesizes on lift does not fire the held button. A press the system
takes over (a gesture, an incoming call) ends in `touchcancel` instead, which
synthesizes no click — and `onTouchEnd`, bound to both events, only cancelled
the pending timer. `suppressClick` stayed armed, and `onClickCapture` ate the
next click on ANY element. Reproduced: hold a button past the beat, cancel the
touch, tap a plain button — its handler is never called.

**DECIDED 2026-09-11 (Joel): both disarms, not just the named one.**
`touchcancel` gets its own listener and clears the flag immediately; and
`onTouchStart` clears it before anything else, because the suppression belongs
to the press that armed it. The second line is what covers the route reading
alone would not find — a held element that leaves the DOM before the lift (a
toast auto-dismissing under a finger, a tile re-rendering) also produces no
click, and left the flag armed by a path `touchcancel` never sees. The
rejected alternatives were each line on its own: the cancel-only fix leaves
that route open, and the touchstart-only fix leaves the flag armed between a
canceled press and the next touch, where a click from another input could still
be eaten.

Two tests ship with it, in the `long-press (touch)` describe, and **both were
planted**: removing the `onTouchCancel` line reds "a canceled press disarms at
once" and nothing else; removing the `onTouchStart` line reds "a lift whose
click never arrives is disarmed by the next press" and nothing else.

## F-common-hosts-3 · `scroll-strands-current` · After a scroll hides the bubble, the same control cannot show it again — CHECKED

`onScroll` clears the anchor but leaves `current` naming the element, so the
next `mouseover` from inside that element (`el === current`) returns before
scheduling. The bubble cannot come back until the pointer leaves and re-enters.
Reproduced. In a real browser the trigger is narrower than the probe — moving
from a button's padding onto its icon is what fires `mouseover` again — so this
is a minor one; the fix is to clear `current` with the anchor.

### Shape

## F-common-hosts-4 · `toast-type-name-collision` · The store's `Toast` type and the `Toast` component share a name

`Toast.tsx` imports `type Toast as ToastModel` to get around it. The sibling
store spells its entry `FaultEntry`; `ToastEntry` would match and the alias
would go. A rename with five reads, all in this folder.

## F-common-hosts-5 · `default-toast-ms-lives-on-the-card` · The one duration constant is exported by the card, not the store

`DEFAULT_TOAST_MS` is in `Toast.tsx`; `ToastSpec.ms`'s note names it, and
`ClubPage` imports the store for `showToast` and the card for the number, to
make one call. The constant belongs beside the spec it defaults. A move with
two importers.

## F-common-hosts-6 · `feedback-test-in-faultstore` · `faultStore.test.ts`'s second describe tests another folder's unit — WORKED

"a sink puts what it is handed in the slot" rendered `useLocalFeedback` and
asserted a pill lands in the slot and no fault is queued — `feedback`'s hook,
in `faults`' spec, and the header explained it as the ghost of a routing branch
removed 2026-09-01.

**DECIDED 2026-09-11 (Joel): deleted.** Both halves were checked first. The
pill half is covered better next door — `feedback/useLocalFeedback.test.ts`
asserts a sticky message lands and stays in four tests, one of them with the
same `'Game over'` string. The fault half could not fail: `useLocalFeedback.ts`
imports React and its own type and nothing else, so there is no path, direct or
transitive, from it to `faultStore`. The file's header loses the paragraph that
explained the describe and gains one sentence saying why no routing test lives
here — a fault raises its modal inside the wrapper, before a call site has an
answer to hand a sink.

Two alternatives were weighed and refused: moving it to `feedback`'s spec (that
folder is NOT OPENED and the file is `cs-unmet`, and it would still be an
unfalsifiable assertion), and re-aiming it as a static import ban in
`src/guards/` (a guard built for one hypothetical, protecting a rule that holds
for a different reason than where an import sits).

**It took a dead pointer with it.** `feedback/GenericFeedbackPill.test.tsx`
said faults reaching the pill were "guarded by faultStore.test.ts's routing
tests" — tests that went with the `fault: true` flag on 2026-09-01. Rewritten
in the same edit to say why no fault reaches that component. `feedback` does
not open for this; it is the two-line conformance edit the process allows where
the finding's area owns the fact being misstated.

### Code and prose

## F-common-hosts-7 · `fault-tier-claim-false` · `FaultModal.tsx` says its rank "is not yet expressed", and the ladder has it

"It is a `modal-fault`, one tier ABOVE a blocking modal, because an error must
be readable mid-question (§20). That rank is not yet expressed: it rides the
shared default today, which is the reason an open chat can cover it. The tier
moves when the ladder does." `base.css` defines `--z-modal-fault: 5100`, one
above `--z-modal-blocking`, and `FloatingPanel`'s family table resolves
`modal-fault` to it. Chat is 3100. And `§20` is a plan cite in a durable file.
The paragraph becomes a sentence and a pointer at the ladder.

## F-common-hosts-8 · `retired-ladder-numbers` · Three sites quote a z-index ladder that no longer exists

`ToastHost.module.css`: "chat is 10000; toasts sit at 12000".
`TooltipHost.module.css`: "Above the chat panel (10000) and level with toasts
(12000)" — and level is wrong twice over: `--z-tooltip` is 9000, `--z-toast`
4000. `ToastHost.tsx`: "including the chat panel (z-index 10000)". Each reads
its token; the comment should say what base.css says about the rung and quote
nothing.

## F-common-hosts-9 · `alpha-and-archaeology` · "Friends-only alpha", and nine passages about what the code replaced

- `FaultModal.tsx`: "Harmless to ship for a friends-only alpha" — CLAUDE.md
  says the app is not alpha; the helper's reason to exist is the same either
  way (no honest UI path to a fault). **Done with F-25**, which replaced it
  with the reason the helper ships. Still open in the same file: "the same
  contract as the manual pill mode this replaces".
- `Toast.module.css`: "Mirrors the old invitation card look".
- `TooltipHost.tsx`: "Why JS-positioned (vs the earlier pure-CSS `::after`
  bubble)…" is a paragraph about the old bubble's failures; "matches the CSS
  version it replaces"; "the old PauseButton special case, now automatic"; "the
  old blanket touch gate".
- `GameInvitations.tsx`: "Replaces the old auto-navigate-into-the-club's-game
  behavior"; "This is now HEADLESS"; "(realtime + dedup, unchanged)"; "they're
  no longer hidden behind an open chat panel".
- `useGameInvitations.test.ts`: "Pre-fix this re-showed the invite".
- `faultStore.test.ts`'s header: the `fault: true` flag that went 2026-09-01.
  **Done with F-6**, which deleted the describe the paragraph existed to
  explain.

Each keeps the reason that still holds (the viewport clamp, why headless, why
the press is claimed) and drops the before.

## F-common-hosts-10 · `popup-and-dialog-for-a-toast` · The invitations still call themselves a popup

`useGameInvitations.ts`: "the popup component renders the result", "`dismiss`
just hides the popup", "the dialog's own Join"; its test: "the popup's
`pending` state", "the dialog's own Join/dismiss". There is no popup — the
invite is a toast, and `GameInvitations` is headless. One more in the same
file: the last comment says "the effect above then removes the invite", and
the block above is the render-time adjust that the same file explains is
"rather than an effect".

## F-common-hosts-11 · `stale-tooltip-writers` · `TooltipHost.tsx` names the wrong writers of `data-tooltip`

"StandardButton wires `tooltip ?? label`; ShuffleButton / PauseButton carry
theirs directly." `StandardButton`'s rule is `tooltip`, else the words when
icon-only, else nothing, and `null` opts out; the two bespoke buttons get
theirs from `actionSurface().buttonProps`, and `PageHeaderButton` writes its
own. The docstring should say the attribute is written by the button
components and `actionSurface`, and point at docs/ui.md → Conventions for the
rule.

## F-common-hosts-12 · `diagnostics-line-optional` · The modal's docstring promises a third line it renders conditionally — the todo's Bug, confirmed

`faults/todo.md` asked for a check before editing. Checked: `reportDbFault`
always builds a line, and every wrapper route goes through it; the three
direct callers do not — `HomePage` builds one by hand, `useGameTimer` and
`useWordSubmit` pass a sentence alone. So the line is optional, and the
docstring's flat "3. Small muted diagnostics" should say so. `FaultEntry.diagnostics`
already does, but says "Two do that on purpose (`useGameTimer`, …)" and names
one of the two. Working this closes the todo item.

## F-common-hosts-13 · `copy-and-fe-error-key` · `FaultModal.module.css` uses a banned word and a retired name

`.message`: "the classifier's words — copy sentence or raw fe-error-key". "Copy"
for a message's words is banned; `fe-error-key` and the classifier went with
the error sprint. And "the modal exists because the pill slot couldn't afford
that" is the before. The line is the envelope's `message`, wrapping freely
because a raw Postgres sentence must be readable in full.

## F-common-hosts-14 · `docstring-marker-pass` · `/**` on members

`toastStore.ts`: `ToastAction.keepOpen` and all seven `ToastSpec` members.
`faultStore.ts`: both `FaultEntry` members. A note on one member takes `//`.
`gameInvites.ts` and `menuModel`-style `//` elsewhere are already right.

## F-common-hosts-15 · `unnamed-effects` · Three multi-line effects with no name

`TooltipHost.tsx`'s one effect is a hundred and fifty lines under
`useEffect(() => {`; `GameInvitations.tsx`'s two (the mirror, the unmount
sweep) are bare arrows. `Toast.tsx` names its `autoDismissAfterMs` and
`useGameInvitations` its `watchInvitations`, which is the house style.

## F-common-hosts-16 · `age-limit-argument-times-five` · One rationale, written out in five places

"`is_terminal = false` is not a staleness bound; an abandoned game never
becomes terminal; an empty `seen` set pops the whole backlog" appears in
`INVITE_MAX_AGE_MS`'s docstring (twenty lines), `useGameInvitations`'s
docstring, the query's inline comment, and both test files' headers. One home
— the constant, where the number is chosen — and a sentence and a pointer at
the other four.

## F-common-hosts-17 · `census-in-faultstore` · "Four callers reach past it, each with a reason"

`faultStore.ts` lists them. A tally that rots the day a fifth arrives (or the
timer's goes). The condition is what to say: `showFaultModal` is for a caller
whose words are already chosen — a sentence the server worded, or a
diagnostics line built by hand — and everything else goes through
`reportDbFault`.

## F-common-hosts-18 · `stale-doc-pointers` · Two pointers that do not land

`ToastHost.tsx`: "docs/ui.md → 'The page never scrolls'" — the heading is
"Page-height fits the viewport". `toastStore.ts`: "(see docs/ui.md)" with no
section, for the toasts-are-not-panels claim (it is docs/ui.md → Toasts).

## F-common-hosts-19 · `ruling-letter-unglossed` · "Joel's ruling D"

`faultStore.test.ts`, on the cap: a letter from a conversation nobody can
open. Say the ruling: beyond the cap a fault gets no modal, and its `[db]` line
already fired.

## F-common-hosts-20 · `ui-md-toasts-stale-paths` · docs/ui.md → Toasts names files that moved

"`lib/toast/toastStore.ts`" and "`components/toasts/`" are pre-reorg paths;
the section also says "now headless" (archaeology) and "the third row" table
paragraph explains its own existence by what "used to land in the global slot".
The paths become `common/toasts/`; the "used to" stays if it is the reason the
row exists, and goes if it is only history.

## F-common-hosts-21 · `ui-md-faults-stale` · docs/ui.md → Faults points at the wrong file and apologizes for its own heading

"`reportDbFault` in `dbResult.ts`" — it is in `dbEnvelope.ts`. The heading
"the one thing that is NOT a pill" is followed, five paragraphs down, by a
parenthetical saying the heading is older than the rule and describes the
system it replaced; rename the heading and drop the apology. And the
`GenericFeedbackMsg` `fault` flag paragraph ("until 2026-09-01… the branches
and their test went") is the before; the rule that holds by construction is
the sentence to keep.

## F-common-hosts-22 · `common-md-invitation-popup` · docs/common.md's invitation section describes a popup and the auto-nav it replaced

The heading "Joining a game — the invitation popup"; "`<GameInvitations>`
renders the popups"; "instant popup while online"; a closing paragraph "This
**replaces the previous ClubPage auto-nav**…". The invite is a toast in the
shared stack, `GameInvitations` renders nothing, and the auto-nav is not in
the tree. Also `migrations/…_common.sql`'s `created_by` comment says
"join-invitation popup" — a comment in an APPLIED migration, so it stays as it
is; the doc is the copy to fix.

### Tests

## F-common-hosts-23 · `toast-exits-untested` · The card's two exits have no spec

`Toast.tsx`'s docstring and `puptoast`'s comment both say the two things worth
looking at are: the ✕ fires `onClose` and removes; the action runs, removes
unless `keepOpen`, and does NOT fire `onClose`. `Toast.test.tsx` covers the
clock only. `GameInvitations` depends on exactly that split — an invite
dismissed by ✕ is marked dismissed, one joined is not — and nothing pins it.

### The stylesheet

## F-common-hosts-24 · `vocabulary-pending` · The guard's rows for the four stylesheets

`vocabularies.test.ts` carries: `Toast.module.css` — spacer `0.7rem`,
line-height `1.35`, border `4px` (the tone stripe); `ToastHost.module.css` —
spacer `0.6rem`; `FaultModal.module.css` — spacer `0.5rem`, type `1.1rem` and
`0.78rem`; `TooltipHost.module.css` — type `0.75rem`, line-height `1.2`.
Padding is parked and not on them.

**The corner inset is DECIDED 2026-09-11 (Joel) and WORKED: the horizontal
follows the page gutter, the vertical does not.** `right` and the width cap
read `--page-padding-x`, so a toast lines up with the content behind it and
widens to near-full width on a phone, where the gutter drops to `0.25rem` and
the card used to sit a visible `0.75rem` narrower on each side than everything
under it. `bottom` and `max-height` keep their hand-written `1rem`: that edge
is where a thumb rests and where a phone draws its home indicator, so a
floating card wants more room there than a page margin gives. Desktop is
pixel-identical to before. The alternatives were keeping the hand-written
number on both axes, and taking `--page-padding-y` on the vertical too (which
would have tightened the desktop bottom gap to 8px for no gain).

Still open in this finding: the spacer/type rows above, and the bubble's
`animation: tooltipIn 120ms` — animations are out of the guard's scope by its
own note. The a/b/c question per value, with the file open.

## F-common-hosts-25 · `typeof-window-guards` · The two todo items, Soon in both folders — WORKED

`toastStore.ts` and `FaultModal.tsx` installed `window.puptoast` /
`window.pupfault` behind `typeof window !== 'undefined'`, which cannot fail
(docs/code-conventions.md → Known gotchas). The guard was never the question;
what the todos left open was whether the helper installs at all in production.

**DECIDED 2026-09-11 (Joel): unconditionally, with the reason written at the
line.** A fault is rare and unplannable, so the deployed site is the only place
its modal's look can be checked where it matters, and a helper nobody is
looking for costs nothing to carry. `FaultModal.tsx` holds the reason;
`toastStore.ts` says "for the reason its twin gives", which is what their
docstrings already do for each other. The rejected alternative was
`import.meta.env.DEV` only — it would have kept both e2e specs working
(`playwright.config.ts` runs them against `npm run dev`) and dropped the canned
strings from the bundle, at the cost of never seeing either card on the real
site.

Worked: the guard removed in both files, the comments written, and both
folders' `todo.md` Soon items closed. It also settles half of F-9 — "Harmless
to ship for a friends-only alpha" is gone, replaced by the actual reason.

## F-common-hosts-26 · `four-designs-owed` · All four `doc.md` files are a single line

Each is a lede and nothing else, and each is on `DESIGNS_OWED`. The Designs
this read would write: toasts — one store, one host, why a toast is not a
panel, the two lifetimes and why the clock never fires `onClose`; tooltips —
one delegated host, why JS-positioned, the hover gate and the long press with
its swallowed click, why the beat is 400ms; faults — the queue's rules (one at
a time, cap 5, dropped from the UI only), why nothing authors a fault by hand,
the three lines and which is optional; invitations — seated at creation but
never dragged in, the seen set and the age bound and why both, the mirror
into the toast store. Plus the root-mount sentence F-1 settled, in each.

## Notes

- **The ARIA on the hosts is not load-bearing for any test** (`alertdialog`
  "Announcement", region "Notifications", the bubble's `aria-hidden`) and
  stays, per CLAUDE.md; nothing here extends it.
- **`backdrop` in `faults`** (`FaultModal.tsx` "Backdrop click", the
  stylesheet's "panel shell + backdrop") is the word `floating-panels` handed
  on as a vocabulary ruling not yet made; left for that ruling.
- **`FaultModal.module.css` is right that only the body is its own**: the
  shell, scrim and Close button are `BlockingModal`'s.
- **`docs/deferred.md` line 75** still says "acceptable for friends-alpha;
  revisit when there's a generic toast/error-surface layer" about
  `useCommonGame`'s view-state calls. Both halves are stale — there is a toast
  layer and a fault modal — but the item is `game-page`'s / `realtime`'s, not
  this area's; noted for whoever opens it.
- **`common.games` really has no `created_at`** (`started_at` is the creation
  stamp) — `gameInvites.ts`'s claim checked against the migration.
- **The `@@` marks on `--stripe` declaration lines** in `Toast.module.css`
  match how the theme files mark token definitions; not a fault.
- **`tooltip-longpress.e2e.ts` exists**, as docs/ui.md says.

## Predicted test breaks

*(written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the four folders' `doc.md` Designs written; their rows off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
