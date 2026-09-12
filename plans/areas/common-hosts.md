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
F-24, F-6, F-2, F-21, F-20, F-16, F-7, F-4, F-5, F-8, F-22 — and, riding on
several of those, the halves of F-9 and F-10 they consumed.

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

## F-common-hosts-3 · `scroll-strands-current` · After a scroll hides the bubble, the same control cannot show it again — CHECKED

`onScroll` clears the anchor but leaves `current` naming the element, so the
next `mouseover` from inside that element (`el === current`) returns before
scheduling. The bubble cannot come back until the pointer leaves and re-enters.
Reproduced. In a real browser the trigger is narrower than the probe — moving
from a button's padding onto its icon is what fires `mouseover` again — so this
is a minor one; the fix is to clear `current` with the anchor.

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

## F-common-hosts-23 · `toast-exits-untested` · The card's two exits have no spec

`Toast.tsx`'s docstring and `puptoast`'s comment both say the two things worth
looking at are: the ✕ fires `onClose` and removes; the action runs, removes
unless `keepOpen`, and does NOT fire `onClose`. `Toast.test.tsx` covers the
clock only. `GameInvitations` depends on exactly that split — an invite
dismissed by ✕ is marked dismissed, one joined is not — and nothing pins it.

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
