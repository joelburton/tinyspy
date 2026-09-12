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
F-24, F-6, F-2, F-21, F-20, F-16, F-7, F-4, F-5, F-8, F-22, F-15, the `faults`
group F-12 · F-13 · F-17 · F-19, the prose group F-9 · F-10 · F-11 · F-18, and
F-3 · F-14 · F-23. **Twenty-five of the twenty-six are worked; only F-26, the
four Designs, is left**, and then the closing re-read.

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
invitation toast is the invitations' one (F-22 renamed it from "popup"). All four four-line `doc.md` files
are on `DESIGNS_OWED`.

## Findings

### The area's question

## F-common-hosts-1 · `root-mount-rule` · What earns a mount at the root — the plan row's question, and App.tsx has already answered it — WORKED

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
synthesizes no click — and `onTouchEnd`, bound to both events, only canceled
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

## F-common-hosts-3 · `scroll-strands-current` · After a scroll hides the bubble, the same control cannot show it again — CHECKED, WORKED

`onScroll` cleared the anchor but left `current` naming the element, so the
next `mouseover` from inside that element (`el === current`) returned before
scheduling. The bubble could not come back until the pointer left and
re-entered. Reproduced.

**Worked 2026-09-11: `current` goes with the anchor.** The pending timer still
survives a scroll, which was the deliberate part of the old behavior — clearing
`current` does not cancel a scheduled bubble, only `hide()` does, so a
programmatic scroll right after a state transition still cannot eat a tooltip
scheduled in that window. A test ships with it and was **planted**: removing
the one line reds "hides on scroll, and the same control can show it again" and
nothing else.

### Shape

## F-common-hosts-4 · `toast-type-name-collision` · The store's `Toast` type and the `Toast` component share a name — WORKED

`Toast.tsx` imported `type Toast as ToastModel` to get around it.

**DECIDED 2026-09-11 (Joel): `ToastEntry`.** It matches the sibling store's
`FaultEntry` exactly, and the two stores are twins in every other respect —
same module shape, same host pattern, adjacent folders. Both aliases are gone.
The refused alternatives were `ToastState` (more precise about the pair
`ToastSpec` in → state held, but it breaks the symmetry faults do not make) and
renaming the component to `ToastCard` (which would move a file, a stylesheet
and a test to leave the store's readers with the bare noun anyway).

Six reads, one of them outside the folder — `useClubSetupPresence.test.tsx`,
which types the live toast list it watches.

## F-common-hosts-5 · `default-toast-ms-lives-on-the-card` · The one duration constant is exported by the card, not the store — WORKED

`DEFAULT_TOAST_MS` was in `Toast.tsx` while the field it is the value for —
`ToastSpec.ms`, whose note named it — was in the store, so `ClubPage` imported
two files to make one call.

**DECIDED 2026-09-11 (Joel): moved to `toastStore.ts`, beside `ToastSpec.ms`.**
Both call sites now take it from the same import as `showToast`. The refused
alternatives were making it a real default (having `showToast` apply it, which
changes behavior and invents a second way to say what `ms` already says — and
today's explicit `ms` is honest about the two lifetimes) and leaving it on the
card on the grounds that the card owns the clock's effect.

Its docstring gained the sentence the old name implied but did not say: nothing
applies it for you, and omitting `ms` means no clock at all rather than 4000.

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

## F-common-hosts-7 · `fault-tier-claim-false` · `FaultModal.tsx` says its rank "is not yet expressed", and the ladder has it — WORKED

Every clause after the first was false, each checked: `FaultModal.tsx` passes
`family="modal-fault"` explicitly rather than riding a default;
`FloatingPanel`'s family table resolves that family to `var(--z-modal-fault)`;
`base.css` defines it as 5100, one rung above `--z-modal-blocking`'s 5000, and
chat is 3100 — so an open chat cannot cover the modal. The docstring was
describing a fixed defect, which is worse than silence: it invites someone to
"fix" a working thing. `§20` was also a plan cite in a durable file.

**DECIDED 2026-09-11 (Joel): one sentence that names the fact and defers the
reason** — its family is `modal-fault`, which is why it outranks a blocking
modal, and `FloatingPanel`'s family table says what that resolves to. The fact
is about this component and belongs here; the reason is the panel category's
and already has a home, so this is F-16's shape at a smaller scale. The refused
alternatives were deleting the paragraph outright (the fact and its reason are
already within one import hop, in `BlockingModal`, `FloatingPanel` and
`base.css`) and restating the reason here in one line.

It was the only bare plan cite in the area's code; the remaining `§` marks in
the repo cite docs, except `PalettePage`'s, which is out of scope.

## F-common-hosts-8 · `retired-ladder-numbers` · Three sites quote a z-index ladder that no longer exists — WORKED

Six dead numbers, and two false orderings underneath them.
`ToastHost.module.css` claimed toasts sit "above EVERYTHING (chat is 10000;
toasts sit at 12000)" — but `--z-toast` is 4000, under both modal rungs and
under the tooltip, which is what docs/ui.md → Toasts already says correctly
("a blocking modal outranks them — the world stopping beats an announcement").
`ToastHost.tsx` repeated the same "above every other layer". And
`TooltipHost.module.css` said the bubble was "level with toasts (12000)" when
`--z-tooltip` is 9000 and `--z-toast` 4000 — five thousand above them, at the
ladder's top. Its conclusion was right; only the arithmetic offered as evidence
was invented.

Each of the three files already reads its token on the line below the comment,
so the numbers were a second copy of a fact the code gets right from one home —
F-16's shape, except these copies had already rotted into claims that would
mislead anyone asking whether a modal can cover a toast. It can, deliberately.

**Worked 2026-09-11 under F-7's rule: name the rung, quote no number.** The two
toast sites say `--z-toast` is above chat and any open window and below a modal
that stops the world; the tooltip says `--z-tooltip` is the ladder's top
because a tooltip blocks nothing. `ToastHost.tsx`'s portal sentence also stops
claiming the portal is what puts it above things — the portal is what keeps an
ancestor's stacking context from trapping it, which is what makes the rung mean
what base.css says.

## F-common-hosts-9 · `alpha-and-archaeology` · "Friends-only alpha", and nine passages about what the code replaced — WORKED

Each kept the reason that still holds and dropped the before. Where the reason
only existed as a contrast with the old thing, it was rewritten as a claim
about today — the tooltip is JS-positioned because CSS alone cannot see the
viewport, not because an earlier bubble clipped; a touch bubble needs a
dismissal of its own because it has no pointer-leave, not because a gate used
to exist; the bubble flips below by measuring, so no anchor has to be marked as
near the top.

Where each passage went:

- `FaultModal.tsx` — "Harmless to ship for a friends-only alpha" with **F-25**,
  replaced by the reason the helper ships; "the same contract as the manual pill
  mode this replaces" with the **`faults` group**.
- `faultStore.test.ts`'s header — with **F-6**, which deleted the describe the
  paragraph existed to explain.
- `useGameInvitations.test.ts`'s "Pre-fix this re-showed the invite" — with
  **F-16**, which was already in that file.
- `Toast.module.css`, `TooltipHost.tsx` (all four), `GameInvitations.tsx` (all
  four) — with the **prose group**, alongside F-10, F-11 and F-18.

A sweep of all four folders for `popup`, "the old", "no longer", "used to",
"Pre-fix" and "this replaces" now returns nothing.

## F-common-hosts-10 · `popup-and-dialog-for-a-toast` · The invitations still call themselves a popup — WORKED

Five sites across `useGameInvitations.ts` and its test called the invite a
popup with a dialog's Join. There is no popup — it is a toast, and
`GameInvitations` is headless — so each now names what actually draws it.

The second half was a contradiction rather than a word: the file's last comment
said "the effect above then removes the invite", while the block above is the
render-time adjust that the SAME file explains at length is used "rather than
an effect". It says "the render-time prune above" now.

## F-common-hosts-11 · `stale-tooltip-writers` · `TooltipHost.tsx` names the wrong writers of `data-tooltip` — WORKED

"StandardButton wires `tooltip ?? label`; ShuffleButton / PauseButton carry
theirs directly" was wrong twice: `StandardButton`'s rule is `tooltip`, else
the words when icon-only, else nothing, with `null` opting out; and the two
bespoke buttons get theirs from `actionSurface().buttonProps`, while
`PageHeaderButton` writes its own. Rather than list four writers — a census
that would rot on the fifth — the docstring now says the attribute is written
by the button components and `actionSurface`, and points at docs/ui.md → Button
iconography → Conventions for which of them puts what there.

## F-common-hosts-12 · `diagnostics-line-optional` · The modal's docstring promises a third line it renders conditionally — the todo's Bug, confirmed — WORKED

`faults/todo.md` asked for a check before editing. Checked: `reportDbFault`
always builds a line, and every wrapper route goes through it; the three
direct callers do not — `HomePage` builds one by hand, `useGameTimer` and
`useWordSubmit` pass a sentence alone. So the line is optional, and the
docstring's flat "3. Small muted diagnostics" now says so — a fault routed
through `reportDbFault` always has a line, one raised by hand from words the
server already wrote has nothing to put there, and the modal is two lines.
`FaultEntry.diagnostics` said the same but leaked a census — "Two do that on
purpose (`useGameTimer`, …)", naming one of the two — which is now the
condition instead. **This closed `faults/todo.md`'s only Bug.**

## F-common-hosts-13 · `copy-and-fe-error-key` · `FaultModal.module.css` uses a banned word and a retired name — WORKED

`.message` read "the classifier's words — copy sentence or raw fe-error-key",
which was three faults in one line: "copy" for a message's words is banned, and
`fe-error-key` and the classifier both went with the error sprint. The trailing
"the modal exists because the pill slot couldn't afford that" was the before.
It now says the line is the envelope's own `message`, whoever wrote it, wrapping
freely and never ellipsising — a raw Postgres sentence is the case that needs
the room, and half of one is no use to whoever reads it aloud.

## F-common-hosts-14 · `docstring-marker-pass` · `/**` on members — WORKED

`toastStore.ts`'s `ToastAction.keepOpen` and all seven `ToastSpec` members, and
`faultStore.ts`'s two `FaultEntry` members, took `//`. A `/**` lights up as
"read this before calling", which a note about one field is not.

The pass also caught one this area WROTE: in `TooltipHost.test.tsx` the
explanation of F-2's two new tests sat as a `/**` on `let onOther = vi.fn()` —
a docstring on a member, describing something else entirely. It is a `//` block
above the tests it is about. That is the failure mode the process warns of:
prose written while working an area's own findings is prose nothing has
checked.

The `/**` on the `long-press (touch)` describe stays — a describe is a unit,
and the file already documented one that way.

## F-common-hosts-15 · `unnamed-effects` · Three multi-line effects with no name — WORKED

`TooltipHost.tsx`'s one effect ran ~170 lines under `useEffect(() => {`, with
a sixteen-line bare cleanup; `GameInvitations.tsx`'s two (the mirror, the
unmount sweep) were bare arrows. `Toast.tsx` names its `autoDismissAfterMs` and
`useGameInvitations` its `watchInvitations`, which is the house style.

**Named 2026-09-11, to my recommendations (Joel took them):**

- `bindTooltipTriggers` and its cleanup `unbindTooltipTriggers` — "triggers"
  rather than gestures (focus is not a gesture) or listeners (which would name
  what they are, not what they are for).
- `mirrorInvitesToToasts` — the word the comment above it and the file's
  docstring already use.
- `dismissOurToastsOnUnmount`. The sweep was `useEffect(() => () => {…}, [])`,
  where the outer arrow does nothing and the inner one is the work, so the name
  went on the inner function.

## F-common-hosts-16 · `age-limit-argument-times-five` · One rationale, written out in five places — WORKED

"`is_terminal = false` is not a staleness bound; an abandoned game never
becomes terminal; an empty `seen` set pops the whole backlog" appeared in
`INVITE_MAX_AGE_MS`'s docstring (twenty lines), `useGameInvitations`'s
docstring, the query's inline comment, and both test files' headers. The site
at the query already pointed at the constant and then restated it anyway, which
was the tell.

**DECIDED 2026-09-11 (Joel): the constant is the sole home.** It is the fullest
of the five and the only one that also answers *why an hour* and *what about
the client clock* — questions that only arise where the number is picked. The
other four keep one sentence naming what the bound guards against and defer to
it. The refused alternatives were splitting by the question a reader has at
each spot (the query owning "why bounded by age", the constant owning "why an
hour"), which gives the argument two homes to keep true; and cutting the other
four to a bare pointer, which would leave `.gt('games.started_at', …)` with
nothing saying whether it is load-bearing.

Riding along, from F-9: both test files stated the failure in the past tense.
`useGameInvitations.test.ts` also called the invite a popup with a dialog's
Join (F-10's word) in the same comment it explained a fix by — both now say
what must hold, in the present.

## F-common-hosts-17 · `census-in-faultstore` · "Four callers reach past it, each with a reason" — WORKED

`faultStore.ts` listed them by name — a tally that rots the day a fifth
arrives, or the timer's goes. Replaced by the condition, which does not: a
caller reaches past `reportDbFault` only when the words are already chosen —
a sentence the server worded, or a diagnostics line built by hand.

## F-common-hosts-18 · `stale-doc-pointers` · Two pointers that do not land — WORKED

`ToastHost.tsx` cited a heading that does not exist — "The page never scrolls"
is "Page-height fits the viewport" — and `toastStore.ts` pointed at the whole
of docs/ui.md with no section for its toasts-are-not-panels claim. Both now
name the section they mean.

## F-common-hosts-19 · `ruling-letter-unglossed` · "Joel's ruling D" — WORKED

`faultStore.test.ts`, on the cap, cited "Joel's ruling D" — a letter from a
conversation nobody can open. It now says the rule: no batching, no filtering,
and beyond the cap a fault simply gets no modal, with nothing lost to diagnosis
because its `[db]` line was written before it ever reached the queue. (The same
sentence also dropped "the classifier logs", a name the error sprint retired.)

## F-common-hosts-20 · `ui-md-toasts-stale-paths` · docs/ui.md → Toasts names files that moved — WORKED

The paths `lib/toast/toastStore.ts` and `components/toasts/` were pre-reorg;
both are now `common/toasts/`. "`useGameInvitations`, now headless" lost the
"now" and the wrong unit with it — the watcher is `useGameInvitations`, but
what calls `showToast` is `GameInvitations.tsx`. Checked in passing: "portaled
to `<body>`" is true.

**DECIDED 2026-09-11 (Joel), two questions.**

*The third row's justification* — the case for a toast surface was carried
entirely by a "used to land in the global slot", so stripping the history would
have left no argument. Rewritten in the present as a counterfactual: without
this surface the club page's "I just deleted that game" *would* fall to the
global slot, which is where other people's news goes and which costs the
members' presence strip while it is up. Same reason, no before. The refused
alternatives were keeping the "used to" as evidence that the global slot was
tried, and cutting the justification entirely.

*"Consumers today"* — a three-item census of the same shape as F-17's, accurate
now and stale the day a fourth arrives. Replaced with the condition: anything
with news that is not a verdict and has nowhere local to put it.

## F-common-hosts-21 · `ui-md-faults-stale` · docs/ui.md → Faults points at the wrong file and apologizes for its own heading — WORKED

The heading "the one thing that is NOT a pill" was followed, five paragraphs
down, by a parenthetical saying the heading is older than the rule and
describes the system it replaced — so a reader met a claim, carried it through
the whole spec, and was then told it was never true.

**DECIDED 2026-09-11 (Joel): `#### Faults — "the app is broken", in a blocking
modal`.** It takes the section's own phone-line shape test, which is what
someone arriving here is actually trying to tell apart. The alternatives were a
bare `the fault MODAL`, promoting the escalation rule into the heading (long,
and it front-loads a distinction that only lands once you know a fault also
reaches the pill), and `the blocking modal` (shortest, but it names the
component rather than the thing). The parenthetical is gone; the escalation
rule keeps its own bolded paragraph.

Three no-decision fixes rode along: `reportDbFault` now points at
`dbEnvelope.ts` (it was `dbResult.ts`, which exports `runRpc`); "the classifier
logs before routing" is now the wrapper, which is what logs; and the
`GenericFeedbackMsg` `fault`-flag paragraph — seven lines of what changed on
2026-09-01 to arrive at a one-line rule — is the rule alone, said in terms of
why it holds by construction.

**Pointers checked, none broken.** Every reference in the repo is the prose
form `docs/ui.md → Faults`, which still resolves; no markdown anchor links at
the old heading exist.

## F-common-hosts-22 · `common-md-invitation-popup` · docs/common.md's invitation section describes a popup and the auto-nav it replaced — WORKED

The heading said "Joining a game — the invitation popup"; the body said
"`<GameInvitations>` renders the popups" and "instant popup while online"; and
a closing paragraph explained the section by "This **replaces the previous
ClubPage auto-nav**". There is no popup — the invite is a toast in the shared
stack, `GameInvitations` renders nothing — and the auto-nav is not in the tree.

**Worked 2026-09-11 on Joel's word, to my recommendation: the heading is
"Joining a game — the invitation toast"**, which names what the reader is
looking for, as F-21's did. Its one inbound link (docs/common.md itself, in the
`is_current_view` paragraph) moved with it, label and anchor.

The body now says the invite arrives as a toast in the shared bottom-right
stack — with the consequence that matters, that an open chat panel never hides
one — and that `GameInvitations` renders nothing, mirroring the hook's live
list into the toast store. Three "before" passages became present-tense claims:
the auto-nav paragraph is now "Nothing else pulls a player in" (ClubPage's
subscription only refreshes its list; `is_current_view` is a pointer and
nothing more), the presence-pause argument no longer contrasts with what the
auto-nav could do, and the realtime section's aside says what the subscription
does rather than what it drove.

`migrations/…_common.sql`'s `created_by` comment still says "join-invitation
popup" and stays: a comment in an APPLIED migration is not edited.

### Tests

## F-common-hosts-23 · `toast-exits-untested` · The card's two exits have no spec — WORKED

`Toast.tsx`'s docstring and `puptoast`'s comment both said the two things worth
looking at were the exits, and `Toast.test.tsx` covered only the clock.
`GameInvitations` depends on exactly that split — an invite dismissed by ✕ is
marked dismissed, one joined is not — and nothing pinned it.

**Worked 2026-09-11: four tests in a second describe**, "the two exits a person
can take". The ✕ fires `onClose` then removes; the action runs and removes
without firing it; `keepOpen` leaves the card up; `dismissible: false` draws no
✕ at all.

**Both halves of the split were planted.** Adding `onClose?.()` to the action
path reds only "the action runs and removes, WITHOUT firing onClose"; removing
it from the ✕ path reds only "the ✕ fires onClose, then removes". So the pair
fails in opposite directions, which is what makes it a guard on the split
rather than on either exit.

### The stylesheet

## F-common-hosts-24 · `vocabulary-pending` · The guard's rows for the four stylesheets — WORKED

`vocabularies.test.ts` carried nine values across the four stylesheets, and the
four folders now have **no rows left on any vocabulary**. Padding was and is
parked, so none of the four stylesheets' paddings were in scope.

**All nine decided 2026-09-11 (Joel), one at a time with the files open.** Five
were near-misses that fitted an existing level — (b), the usual answer — and
each moved by a pixel or less on screen:

| value | was | now |
|---|---|---|
| `Toast` card gap | `0.7rem` | `--spacer-3` (0.75) |
| `Toast` message leading | `1.35` | `--line-height-2` (1.25) |
| `ToastHost` stack gap | `0.6rem` | `--spacer-4` (0.5) |
| `FaultModal` diagnostics type | `0.78rem` | `--font-size-3` (0.75) |
| `TooltipHost` bubble leading | `1.2` | `--line-height-2` (1.25) |

Two were exact matches for a token and converted without a question:
`FaultModal`'s `0.5rem` line gap → `--spacer-4`, `TooltipHost`'s `0.75rem` →
`--font-size-3`.

**The toast stripe took a new token — (a), a level nobody had named.** Its
`4px` equalled `--border-width-frame`, but Joel's ruling was that sharing that
token would name the number rather than the job: a frame encloses a thing, and
this marks one edge. It is `--toast-stripe-width`, named for the toast as he
asked (an earlier `--border-width-accent` was rejected for being generic), and
it sits in base.css beside the widths rather than with the per-theme
`--toast-*-stripe-color`, because a width is not a theme decision.

**The fault modal's `1.1rem` was the one real orphan** — above the type ramp's
top, and not an h-element, so no level owned it. Checking it turned up that
`FaultModal` passes no `title` to `BlockingModal` at all: the red "Error" IS
the modal's title, hand-drawn in the body. Joel's answer: make it the `<h3>` it
already is, so `base.css` sizes it and the literal goes. The alternative of
passing it as the shell's `title` and deleting `.heading` is `floating-panels`'
question, not this area's, and is recorded there rather than taken here.

**The tooltip's fade** (`animation: tooltipIn 120ms`) was never a guard row —
animations sit outside the guard's scope. Joel took
`--transition-duration-paint` (100ms) for it, which is the semantically right
one: the keyframe animates opacity and nothing else. That made base.css's
"ANIMATIONS ARE NOT IN THIS" false, so it was narrowed in the same pass to what
it had always meant — a game-surface animation, tuned to its board, keeps its
own name; a shell animation that is only a paint may take one of these.

**Left as it is: the keyframe itself.** A `transition` cannot animate this,
because the bubble MOUNTS when it shows (`if (!anchor) return null`) and an
entering element has no previous computed value to interpolate from. The modern
answer is `@starting-style`, which would replace eleven lines with three and is
supported everywhere the app cares about — but nothing in the repo uses it, so
the first file to would set a house pattern. Handed to `core-css/todo.md` →
Soon, with the tooltip named as its first customer.

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
- **Two of `feedback`'s plans carried pre-reorg paths**, swept on Joel's word
  (paths only; no design content touched, and both stay `feedback`'s).
  `feedback-design.md`: its stores argument and store-comparison table now say
  `common/toasts/toastStore.ts` and `common/faults/faultStore.ts`.
  `feedback-system.md` §11: all thirteen rows were written against the
  `lib/` · `hooks/` · `components/` layout; each was resolved against the tree
  before rewriting, and seven of them turn out to live in `common/feedback/`
  today.
- **`feedback-system.md` §11's AREA column is stale too, and was left alone.**
  It names `deep`, `game-lib`, `hooks` and `shared-game-chrome`; no
  `plans/areas/` file exists for any of them. That matters because the
  paragraph under the table — "That spread is the argument for a new area. Six
  areas, one vocabulary" — rests on that column, so correcting it changes the
  argument's premises rather than a fact about where a file sits. `feedback`'s
  to make.
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
