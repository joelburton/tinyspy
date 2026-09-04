# The feedback system, as it is today

**This document describes what EXISTS**, not what should. It is the input to a
design review, written because the system spans four areas that will never be
open at the same time, so no area's audit can see its whole shape.

**Scope.** It starts where a wrapper hands back an `Envelope` and ends where
React puts words on screen. It does NOT cover how the envelope is built, chosen
or transported — that layer came out of the error/envelope sprint (finished
2026-09-01) and is coherent; see [docs/envelopes.md](../docs/envelopes.md). It
also stops short of the pill's own rendering (`GenericFeedbackPill`, CSS,
dismissal gestures).

---

## 1. The one-paragraph version

Something happens. It becomes a **message object**. The message goes into one of
**two slots** — the page header, or below the board — and React renders whatever
the slot holds. Two things bypass the slots entirely: a **fault** puts up a
modal before any call site sees the answer, and a **form-validation** goes to a
field rather than a slot.

The interesting parts are all in the middle: what a message IS, who decides each
of its fields, and who owns each slot.

---

## 2. Four origins

A message can start in four places. **Only the first involves an envelope.**

| origin | example | who writes the words |
|---|---|---|
| **a server refusal** | `submit_word` rejects a duplicate | the server (`envelope.message`) |
| **the FE's own check** | "Not enough letters" before sending | the call site |
| **a peer's action** | "leah found APPLE" | the game's `messageFor` |
| **a terminal state** | "Won: covered in 4" | the game's `buildOver` |

This matters because the shared code covers the first origin well, has one
helper for the third, and nothing for the second or fourth beyond the message
type itself.

---

## 3. What gets passed around: six shapes

This is the part that most needs deciding. **Six named (or unnamed) shapes carry
"something to say" between the envelope and the screen.**

```
Envelope                 { type, message: string, outcome, severity, field, … }
   │  getNotOkFeedback()
   ▼
{ tone, text }           ← UNNAMED. Spelled Pick<GenericFeedbackMsg,'tone'|'text'>
   │  caller adds mode (+ dot)
   ▼
GenericFeedbackMsg       { tone, text: ReactNode, dot?, mode }
```

and separately:

```
TerminalCopy             { verdict: string, message: string, tone }
   │  terminalPill(over.tone, over.verdict)
   ▼
GenericFeedbackMsg
```

plus two more:

- **`GenericFeedbackApi`** — `{ show, clear }`, the handle onto a slot.
- **`LocalFeedbackMsg`** — scrabble's alone: `GenericFeedbackMsg` with `mode`
  made optional, so its `BoardCol` can accept hand-built pills that omit it.

**The unnamed one is the tell.** `getNotOkFeedback` returns a half-built message
that has no name, so nothing can be said about it — no function takes it, and
every one of the ~40 call sites that has one spreads it into an object literal
and finishes the job by hand.

**`TerminalCopy` is a second message type in disguise.** Its `verdict` becomes a
pill's `text`; its `message` is a different sentence for a different surface (the
info-column outcome line); its `tone` is the pill's `tone` under another name.
One object, two destinations, three fields that each mean something different
from what they are called.

---

## 4. What decides each field

The system is explicit about this for one origin and silent for the others.

| field | decided by | why |
|---|---|---|
| `tone` | the ANSWER | the server said how it reads (`outcome`), or its severity's default |
| `text` | the ANSWER | the server wrote the words |
| `mode` | the SURFACE | the same answer is `sticky` below a board and `manual` in a dialog |
| `dot` | the SURFACE | identity is about who acted, not what happened |

`genericPills.ts` states this division and it is a good division. **The problem
is that only `tone` and `text` have a helper.** `mode` — which
`localPills.ts` calls the decision worth getting right, with nothing at runtime
to catch a wrong one — is typed out by hand at ~50 sites.

---

## 5. Two slots, and who owns them

A "slot" holds at most one message. **`show` REPLACES** — there is no queue, no
stacking; ordering is the caller's problem.

| slot | where | owned by | reached via |
|---|---|---|---|
| **global** | page header, swapping out the players strip | `GamePage` (inline `useState`) and `ClubPage`, each separately | `ctx.globalFeedback` — a `GenericFeedbackApi` |
| **local** | below the board | `useLocalFeedback`, one per PlayArea | `showLocalFeedback` / `clearLocalFeedback` |

Two asymmetries live here:

1. **The local slot is a hook; the global slot is not.** `GamePage` and
   `ClubPage` each hold the state inline and build the `{show, clear}` pair by
   hand.
2. **`useGlobalFeedback` is not the global slot.** Despite the name, it owns no
   state — it takes a `GenericFeedbackApi` as a parameter. It is a *producer*:
   it watches an append-only stream of peer events and fires a pill for each
   genuinely new one, with the seen-set bootstrap that stops the backlog
   replaying on load. Its true name is something like "peer narration".

So the pair `useLocalFeedback` / `useGlobalFeedback` reads as one slot each and
is really one slot and one producer.

---

## 6. Four channels, chosen by severity

Not everything becomes a pill. **The severity picks the channel, and this part
is coherent.**

| severity | channel | who raises it |
|---|---|---|
| `fault` | **modal** + a console line | the wrapper, centrally, before the call site sees the answer |
| `race`, `service-error` | **pill** | the call site |
| `form-validation` | **the field** — `setError(res.field ?? '_')` | the form |
| *(ok with words)* | pill | the call site |

Two consequences worth holding onto:

- **A read can only fail as a fault.** `readRows` never authors an envelope, so
  a failed read is always a modal and never a pill; the caller's whole remaining
  job is to stop showing a stale answer.
- **A fault still shows its message at the call site.** The modal escalates, it
  does not replace — so a fault reaches both channels.

---

## 7. The whole flow, one picture

```
  SERVER REFUSAL                    FE'S OWN CHECK          PEER EVENT         TERMINAL
        │                                 │                     │                 │
   runRpc / runEdgeFn / readRows          │              useGlobalFeedback    buildOver()
        │                                 │                     │                 │
     Envelope                             │                     │            TerminalCopy
        │                                 │                     │             │        │
   ┌────┴─────┬──────────────┐            │                     │             │        │
 fault      race etc    form-valid        │                     │        verdict    message
   │           │             │            │                     │             │        │
 MODAL   getNotOkFeedback  FIELD          │                     │        terminalPill   │
(central)      │                          │                     │             │         │
          { tone, text }                  │                     │             │         │
                │                         │                     │             │         │
                └──── + mode ─────► GenericFeedbackMsg ◄────────┘─────────────┘         │
                                          │                                             │
                          ┌───────────────┴────────────────┐                            │
                     globalFeedback.show            showLocalFeedback                   │
                          │                                │                            │
                   header slot                      below-board slot            info-column
                  (GamePage/ClubPage)              (useLocalFeedback)          outcome line
                          │                                │
                          └──────► <GenericFeedbackPill> ◄─┘
```

---

## 8. Where one word means several things

Collected because it is the concrete half of "the naming is loose".

**"message"**

- `Envelope.message` — a **string**, the server's words
- `TerminalCopy.message` — a **string**, but a *different* sentence for a
  *different* surface than the same object's `verdict`
- `GenericFeedbackMsg` — an **object**
- `msg` (every parameter) — the object

**"pill"** — three things at once:

- a message (`GenericFeedbackMsg`, the thing passed around)
- a slot (`localFeedback`, the thing that holds one)
- a builder (`stickyPill`, `terminalPill`, a function returning one)
- …and a rendered component (`GenericFeedbackPill`)

**"local" / "generic"** — `localPills.ts` and `genericPills.ts` sit beside each
other as if they were opposites. "Local" names a location (below the board);
"generic" names nothing — the file holds one function that maps an envelope to
an appearance, and its docstring opens by arguing why it isn't called
`localPills`.

**"text" vs "verdict" vs "message"** — all three are the words a pill shows,
depending on which object you are holding.

**"feedback"** — `useLocalFeedback` (a slot), `useGlobalFeedback` (a producer),
`globalFeedback` (a handle), `localFeedback` (a value), `getNotOkFeedback` (a
converter). Five things, one word.

---

## 9. Two mechanisms for one idea

Worth naming separately because it is structural rather than nominal:
**"cannot be dismissed" is expressed twice.**

- `mode: 'permanent'` on the message — nothing dismisses it; only a later
  message replaces it.
- `useLocalFeedback({ locked: isTerminal })` — makes `clearLocalFeedback()` a
  no-op. **Eleven games pass it.**

A terminal verdict is protected by both. The hook's option predates `permanent`
existing as a named mode, and today the hook could honor
`msg.mode.kind === 'permanent'` instead.

---

## 10. What is good, and should survive a redesign

Stated so a review does not spend its budget re-deciding it:

- **The envelope is one shape with nine always-present keys**, written by three
  layers, checked across the Deno boundary. A call site reads one thing.
- **Severity picks the channel**, and `notOkOutcome` is the single
  severity→appearance mapping, typed `Record<Severity, Outcome>` so completeness
  is a compile error.
- **Faults are presented centrally**, so no call site decides whether to raise a
  modal.
- **`tone` is one vocabulary end to end** — the envelope's `outcome`, the pill's
  `tone` and the CSS class suffix are the same names, so nothing translates.
- **The answer/surface division** in `genericPills.ts` is the right division;
  it is under-tooled, not wrong.
- **There is deliberately no `getOkFeedback`.** What a successful answer shows
  is game-specific, and the gap is honest rather than an oversight.

---

## 11. The files

| file | what it holds | area |
|---|---|---|
| `common/lib/supabase/envelope.ts` | the envelope type | `deep` (blessed) |
| `common/lib/supabase/dbResult.ts` | the three wrappers, `notOkOutcome` | `deep` |
| `common/lib/supabase/dbEnvelope.ts` | envelope builders, `reportDbFault` | `deep` |
| `common/lib/feedback/genericFeedback.ts` | `GenericFeedbackMsg`, `GenericFeedbackApi` | `game-lib` (blessed) |
| `common/lib/game/genericPills.ts` | `getNotOkFeedback` | `game-lib` |
| `common/lib/game/localPills.ts` | the three builders | `game-lib` |
| `common/lib/game/terminalCopy.ts` | `TerminalCopy`, `endedCopy` | `game-lib` (blessed) |
| `common/components/game/turnCopy.tsx` | two more builders | `shared-game-chrome` |
| `common/hooks/feedback/useLocalFeedback.ts` | the local slot | `hooks` |
| `common/hooks/feedback/useGlobalFeedback.ts` | peer narration | `hooks` |
| `common/components/feedback/GenericFeedbackPill.tsx` | the rendered pill | **unassigned** (`cs-unmet`) |
| `common/components/game/GamePage.tsx` | the global slot's state | `shared-game-chrome` |
| `common/components/club/ClubPage.tsx` | a second global slot | `club-page` |

**That spread is the argument for a new area.** Six areas, one vocabulary, and
the component at the end of the chain belongs to none of them.
