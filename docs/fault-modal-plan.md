# Fault-as-modal — plan (2026-08-13)

A working document (delete once worked; durable rules land in docs/ui.md →
Faults). Joel's spec, 2026-08-13:

- **Each fault is a separate modal. No batching.** Revisit later.
- **No interaction outside the modal** — dim the background to make that
  obvious.
- Line 1: **"Error"**, in red.
- Line 2: **the error message** — usually the copy table's sentence, sometimes
  the raw fe-error-key.
- Line 3, smaller discreet text: **the full diagnostic info the console gets**
  — everything we know: HTTP status, SQLSTATE, the fe-error-key name, DETAIL,
  the raw message, the action.

Earlier rulings (2026-08-12) still in force: faults ONLY — feedback pills and
form validation untouched; a fault during setup-dialog submit also gets the
modal.

## What renders where, before → after

| producing path | today | after |
|---|---|---|
| expected rejections, all surfaces | pill / form line | unchanged |
| board-move fault (word / swap / letter / mark / …) | bare-red line in the below-board slot, manual × | modal |
| End / Concede / Restart fault (12 hook games + GamePage's header End) | bare-red line in a slot | modal |
| New-game fault (all 15 games) | bare-red line | modal |
| SetupGameDialog: validation (expected keys, RichMessage) | form red line | unchanged |
| SetupGameDialog: fault / transport | form red line | **modal**, dialog stays open behind (ruled 2026-08-12) |
| account/club forms + WordEditDialog: fault / transport | form red line | **modal** (ruled A: faults yes, validation stays in-form) |
| scrabble AI-suggest fault | panel red line | **modal** (ruled B) |
| codenamesduet AI-clue fault (the Claude call) | clue dialog's message area | **modal** (ruled B — "tinyspy too") |
| crosswords explain-clue fault (also a Claude call) | explain panel | **modal** (confirmed) — the `unsolved` ANSWER and the ai-* expected keys stay panel-side |
| GoTrue login errors | form line (allowlisted; the auth service's own text) | unchanged — not our fault system |
| crosswords keystroke storm (dead connection) | one bare-red line, replaced per keystroke | one modal per fault, QUEUED — the accepted "for now"; the first revisit trigger |

## Design

**One store + one host, ToastHost-style.** A `faultModalStore` (the
`toastStore.ts` pattern: module store + subscribe) holding a FIFO queue of
faults; a single `<FaultDialog>` host mounted once in App.tsx renders the
head of the queue; Dismiss pops it and the next fault (if any) appears.
Strictly one visible modal at a time, each fault its own modal, no merging —
per the ruling. **Queue cap: 5 (ruled D).** No filtering, no batching: while
a modal is up and the queue is full, NEW faults are silently dropped from the
UI — "silently" meaning no modal; the `[db]` console line still fires for
every one of them (the classifier logs before routing), so nothing is lost
to diagnosis.

**The modal.** Built on the ConfirmDialog machinery (FloatingPanel with
`backdrop` — pointer-blocking, dimmed — plus `useFocusTrap` and dialog-owned
keyboard, so a game's window-level key capture can't type behind it):

1. `Error` — heading, `--color-sys-error-red`.
2. The message — `msg.text` exactly as the classifier produced it (copy words
   for a copy-carrying key on a fault surface; `action|key|detail|` raw
   otherwise; `action: Server; try refresh` for transport).
3. The diagnostics — small, muted (the one sanctioned muted use: it IS
   secondary), wrapping freely: the same string the `[db]` console line
   carries.

Dismissal: a Close button + Escape. Backdrop click deliberately does NOT
dismiss — see-and-acknowledge, same reasoning as the manual pill mode the
modal replaces. Z-layer: above pause overlay, dialogs, chat, and toasts (it
can pop over the setup dialog).

**One diagnostics builder, shared with the log.** Extract
`faultDiagnostics(action, error, shown): string` in serverError.ts; both
`logFault` and the modal's line 3 use it, so the screen and the console can
never drift. Contents: timestamp (logStamp), action, the fe-error-key (when
the message parses as one), `code=` SQLSTATE, `status=` HTTP, `detail=`,
`hint=`, `raw=` when the shown text differs. To have the HTTP status at all:
`CallError` gains `status?: number` and `callEdgeFn` captures
`error.context.status` while unwrapping (currently discarded).

**How a fault reaches the store.** `GenericFeedbackMsg` gains an optional
`diagnostics?: string`, set ONLY by the classifier's fault/transport branches
(failureMessage + faultMessage) — hand-authored messages never carry it. The
routing then happens at the sink chokepoints, not per game: everywhere a
`GenericFeedbackMsg` is set into slot state (`useLocalFeedback.show`, the
global-feedback show, enumerated exhaustively during the build), a
`msg.fault` message goes to `faultModalStore.push(msg)` INSTEAD of the slot.
All fifteen games convert with zero per-game edits. Classifier logging is
unchanged (the console line still always fires).

**The pill's fault branch dies.** With routing at the sinks,
`GenericFeedbackPill`'s `fault:` branch is unreachable — delete it, and add a
guard-style unit test that a fault-flagged message handed to a sink never
reaches slot state (verified by planting). The reserved below-board slot is
untouched (no-reflow rule; it simply never shows a fault again).

**SetupGameDialog.** Switches from failureText to failureMessage: expected →
the form's red line exactly as today; fault/transport → the store. The
dialog stays open behind the modal so the player can retry after dismissing.

## Not in scope

- Batching / dedupe / storm handling — explicitly deferred by Joel.
- A copy-details button — line 3 shows the info instead; revisit if wanted.
- Changing any classifier WORDS.

## Decisions (ruled 2026-08-13)

- **A.** Forms (account/club, WordEditDialog): failures that classify as
  fault/transport — anything bad user input alone can't produce — pop the
  MODAL. Validation stays in-form.
- **B.** AI-panel faults pop the modal: scrabble's suggester, codenamesduet's
  clue hint ("tinyspy"), AND crosswords' explain-clue (confirmed 2026-08-13).
  The ran-vs-broke line, per Joel: the model RUNNING and coming back
  empty-handed is NOT a fault — and the copy table already encodes that:
  ai-clue-declined / ai-explain-declined / ai-truncated / ai-malformed carry
  copy, classify as EXPECTED, and stay in their panels as sentences; only
  the copyless failures (ai-unconfigured, edge-internal, unknown relayed
  raises, transport) are faults and pop the modal.
- **C.** Close button + Escape; backdrop-click inert.
- **D.** Queue capped at 5; overflow silently dropped from the UI (still
  console-logged); no filtering or batching.

The rulings generalize cleanly: **every failure that classifies as
fault/transport pops the modal, on every surface; expected rejections,
validation, and answers stay where they are.** That single sentence is what
docs/ui.md gets when this is worked.

## Order of work

1. Matrix verification pass: enumerate every setter of GenericFeedbackMsg
   slot state (the routing chokepoints) and every fault-producing path;
   extend the table above with the findings BEFORE writing code
   ([[error-ux-behavior-matrix]]).
2. Plumbing commit: `status` capture, `faultDiagnostics` extraction (log
   output identical), `diagnostics` on the msg type — behavior-neutral.
3. The modal commit: store + FaultDialog + sink routing + pill-branch
   removal + guard test + unit tests; update the specs that assert bare-red
   fault text in slots (waffle PlayArea.test, useStandardGameActions.test).
4. The dialog commit: SetupGameDialog (+ A/B surfaces as ruled).
5. Docs: ui.md → Faults rewritten around the modal ("did a box pop up?" is
   the new phone-line shape test); this plan deleted.
6. Gates per commit; full e2e at the end.
