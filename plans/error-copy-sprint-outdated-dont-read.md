# DON'T READ THIS — VERY OUTDATED

> **DON'T READ THIS — VERY OUTDATED.**
>
> Superseded in full on 2026-08-26 by the error-system sprint, which finished
> on 2026-09-01 and whose plan is gone. [docs/envelopes.md](../docs/envelopes.md)
> is the canonical description of what shipped.
>
> This plan was built on a premise that turned out to be false — that changing
> a server error message would need a schema change and a migration. It
> wouldn't: every raise lives in `supabase/sql/`, which is re-applied on every
> deploy. Once that fell, so did most of the reason `ERROR_COPY` exists, and
> refining its shape became work spent on a layer we're deleting.
>
> Kept only so its absence isn't mistaken for something lost. Open it if — and
> only if — Joel says to.

---

# The error-copy sprint — A PLAN, to be built and deleted

**This is a plan, not a description of the code.** It exists because the current
error-message design was found to be wrong in a way that can't be patched: not a
list of miscategorized entries, but a shape that makes miscategorizing them the
default.

**SCHEDULED 2026-08-26, and the CSS sprint is paused behind it** (Joel: *"there's
no point continuing this sprint before we fix the error/fault system. how could
we really audit the site with a rotting fish head at the center."*). See
[css-system-2.md](css-system-2.md)'s header for why the timing works out: the
next two CSS areas are the error-heavy ones, and the CSS sprint has already
built the surfaces this system renders into. When the work lands, whatever survives of it
moves into [ui.md](../docs/ui.md) and [code-conventions.md](../docs/code-conventions.md) and this
file goes away.

Found during the 2026-08-18 color sprint, while asking a much smaller question
(what should a pill's tones be called?). It is deliberately **not** being fixed
there — it is too big, and the colors work does not depend on it.

## Where it came from

The `ERROR_COPY` table exists because of a belief that turned out to be false:
that changing a player-facing sentence raised in SQL would require a **migration**.
It doesn't. `supabase/sql/` is behavior, re-applied in full on every deploy, so a
message change there is an ordinary in-place edit forever — see
[CLAUDE.md → Where a SQL change goes](../CLAUDE.md). Migrations hadn't been
locked down when the design was chosen, so the constraint felt real.

Everything downstream followed from that premise: the server raises a bare KEY,
the frontend owns every sentence, and a table in TypeScript is the only place a
player-facing message can live. Remove the premise and the whole arrangement is
worth reconsidering rather than repairing.

## The direction to explore

**"He who hits the error describes it fully"** — the raiser sends the whole
message, including its tone, rather than a key the frontend must look up and
classify. Joel's proposal, recorded here as the starting point for the sprint;
its consequences are not worked through yet.

## What's actually wrong today

### 1. The tone is picked per entry, against no rule

74 keys. **21 carry `tone: 'info'`; the other 53 take the default.** The only
written guidance is one sentence on the type — *"set it when the rejection isn't
a failure so much as news"* — and the result is that the tone tracks nothing. The
same event is two different colors in two games:

| these two are one event | tone |
|---|---|
| `bag-too-low` "Not enough tiles in the bag" (scrabble) | error |
| `bunch-too-low` "Bunch too low to dump" (bananagrams) | info |
| `already-guessed` "Already guessed" (psychicnum) | error |
| `already-revealed` "Already revealed" (codenamesduet) | info |
| `not-your-turn` "Not your turn" (common) | error |
| `not-clue-giver` "Not the clue-giver" (codenamesduet) | info |
| `too-few-words` "Not enough words at that difficulty" (psychicnum) | error |
| `no-unplayed-puzzle` "Everyone here has played every puzzle" (connections) | info |

### 2. `info` is wrong for every lost race, and dangerous for at least one

A lost race means **the moves you made cannot be accepted**. That is not a minor
piece of information, and blue is not the color for it. These should be warnings.

The sharp case is **`no-swaps-left`** (waffle): running out of swaps is how you
*lose waffle*. A player who swaps once more after the server has already told
them the game is over gets a calm blue "No swaps left" sitting where the loss
should be. Check whether the loss is reliably shown first before deciding what
this pill says at all.

**`eliminated` "Out of mistakes"** (connections) is the same shape — a loss
message wearing `info`. Note there is probably a second, FE-authored "Out of
mistakes" that is already red; the two paths need reconciling, not just recoloring.

### 3. `info` is wrong for validation refusals

**`no-unplayed-weekday`** ("You've played every one of those") is a validation
error in the useful sense: *I can't do the thing you asked for.* Not a bug, not
news — undoable. Same for its sibling `no-unplayed-puzzle`.

### 4. Two entries should be faults, not pills

**`ai-malformed`** ("The model returned a garbled answer") and
**`dictionary-source-failed`** ("Dictionary service couldn't be reached") are not
gameplay. They are the system failing, which is what the fault dialog is for.
They are pills today because membership in `ERROR_COPY` is what makes something
*not* a fault — which is the design problem in one line: **the table conflates
"we have words for this" with "this is not a bug."** A message can be both
well-worded and a genuine failure, and today it can't say so.

### 5. The classification has no vocabulary for "unexpected but not serious"

"I can't swap these two tiles, it turns out — moth already did" is neither a
fault (nothing is broken) nor an ordinary refusal (the frontend was right when it
checked). There is currently no name for it and no agreed color, and the sprint
should not assume a single color fits the group.

## What the color sprint already changed

Enough to stop the palette lying, and no more. **None of this reclassifies
anything** — it renames, and adds one tone:

- The pill tones are the outcome names: `success` → **`won`**, `error` →
  **`lost`**. They were painted from `won`/`lost` all along, with the rename
  buried inside a CSS rule.
- A **new `error` tone**, distinct from `lost`, in the fault red — a step angrier
  than a lost move, for failures that aren't about a move at all.
- Unclassified server rejections (the 53) now take that new `error` red instead
  of the loss red. Some of them should be warnings and some should be faults;
  that is this sprint's job. The color moved a shade; the classification did not.
- The board's verdict marks followed the same rename (`.verdictError` →
  `.verdictLost`), since a mark wears the tone its pill wears.
- The 21 `info` entries were left exactly as they are, including the two called
  out above as dangerous. **They are known wrong and deliberately unfixed.**

## The API surface is the other half of the problem (added 2026-08-26)

The plan above is about the TABLE — which sentences exist and what tone they
wear. Everything in this section is one layer up: the four functions
`lib/game/serverError.ts` exports, and who picks between them. Found while
fixing one create-club bug, which turned out to be the second instance of the
same class in a day.

### Four functions, two crossed axes, and nothing checks the answer

|  | fault → the modal | fault → this surface |
|---|---|---|
| **returns a `GenericFeedbackMsg`** | `failureMessage` | `faultMessage` |
| **returns a string** | `expectedTextOrFault` | `failureText` |

A caller has to know its position on BOTH axes, no type expresses either, and
the wrong pick is silent. Two live instances, found the same afternoon:

- **create-club** called the string form, so a dead connection printed
  "create club: Server; try refresh" into the form's red line while the same
  failure in `EditClubModal` — one dialog away, same family — raised the fault
  modal. Fixed 2026-08-26 (homepage F55).
- **stackdown ×3** hands `failureText`'s words to `showLocalFeedback`, which is
  a string-shaped PILL path — the thing `serverError.ts`'s own docstring
  forbids in writing. A fault there paints an ordinary error pill and no modal.
  NOT fixed; it belongs to stackdown's area or to this sprint.

Three more are suspect and each is a real decision rather than a typo:
`bananagrams/usePlayerBoard` (a fault becomes a check-board result),
`ChatBody` and `AnagramDialog` (both panel surfaces, which `docs/ui.md` says
use the expected/fault helper).

### The second axis exists only because sinks disagree about their input type

If every sink took `GenericFeedbackMsg`, the string column collapses and one
function is left. The string variants are not a design; they are an
accommodation for surfaces built before the message type existed.

**The shape it wants to be**, as a starting point rather than a decision:

1. `failureMessage(error, action)` is the only classifier anyone calls.
2. Routing lives in the DISPLAY, not the call site. `<FailureLine>` (built by
   the CSS sprint's `forms` area) takes the message instead of a `ReactNode`:
   expected → render the words; fault → hand it to the modal and render
   nothing. The pill hooks already work this way.
3. The idiom everywhere becomes `setFailure(failureMessage(error, 'club'))`,
   and no call site chooses a policy.
4. `expectedTextOrFault` and `failureText` both delete. What is shared is a
   private one-line `textOf(msg)`, not an exported function.
5. **Presenting a fault must not happen during render** — the routing belongs
   at the setter (a small `useSurfaceFailure()` returning `[node, setFailure]`),
   not inside a component body.

### The four surfaces any new design has to answer

This is the acceptance test, and it is why "just use one function" is not
already the answer:

| surface | today | what it needs |
|---|---|---|
| a pill slot (a board, a game hook) | `failureMessage` | faults route themselves out of the slot — already works |
| a form or panel line | `expectedTextOrFault` | words for an expected rejection, modal for anything else |
| an action that cannot fail in play (in-game "New game") | `faultMessage` | always the fault look, even for a key with copy |
| a page that IS the fault display (`ErrorPage`) | `failureText` | the classifier's words rendered in the fault's own language, diagnostics included, no modal — there is no page to put one over |

The last row is the one that nearly got legislated away: `ClubPage`'s two load
failures looked like a fault being swallowed, and are not. `HomePage` pops a
modal because its list is still there to sit behind it; a club page that did not
load HAS no page, so it becomes the fault surface itself (F39
`loading-and-errors`). Two situations, one rule — not a disagreement.

### The freeze is itself evidence

`ERROR_COPY` has been closed to new entries since this file was written, and two
changes on 2026-08-26 needed a key anyway (`club-name-taken`,
`club-name-too-short`). Both were let through one at a time by hand. A table
that has to be unblocked per-entry to let ordinary work proceed is a table whose
shape is wrong, which is this file's thesis stated from the other end.

### Keys the server still does not raise

The FE reads a Postgres SQLSTATE in exactly one file now:
`ClaimHandleScreen` (`23505`, `23503`), because `claim_username` lets its own
constraint violations escape. `create_club`'s two were closed 2026-08-26 by
catching the violation and raising `club-name-taken|<handle>|`, plus a missing
floor check that made a raw `23514` reachable with a two-letter name. The same
treatment finishes the job — and needs two more `ERROR_COPY` keys, which is why
it waited for this sprint.

## Where to start

1. Decide the shape first (the direction above), because the categories fall out
   of it. Recategorizing 74 entries inside the current design would be work
   thrown away if the design changes. **The table's shape and the API's shape
   are one question, not two** — "he who hits the error describes it fully"
   changes what a call site receives, which is what the four functions are
   arguing about.
2. Whatever the shape, the vocabulary needs settling: what distinguishes a
   refusal, a lost race, a validation failure, and a fault — and which of those
   a player should be able to tell apart at a glance.
3. `no-swaps-left` and `eliminated` are worth checking on screen early: if a loss
   pill is being replaced by a refusal pill, that is a live bug and not a
   cosmetic one.
