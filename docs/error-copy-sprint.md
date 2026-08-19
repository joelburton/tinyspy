# The error-copy sprint — A PLAN, to be built and deleted

**This is a plan, not a description of the code.** It exists because the current
error-message design was found to be wrong in a way that can't be patched: not a
list of miscategorized entries, but a shape that makes miscategorizing them the
default. Nothing here is scheduled. When the work lands, whatever survives of it
moves into [ui.md](ui.md) and [code-conventions.md](code-conventions.md) and this
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

## Where to start

1. Decide the shape first (the direction above), because the categories fall out
   of it. Recategorizing 74 entries inside the current design would be work
   thrown away if the design changes.
2. Whatever the shape, the vocabulary needs settling: what distinguishes a
   refusal, a lost race, a validation failure, and a fault — and which of those
   a player should be able to tell apart at a glance.
3. `no-swaps-left` and `eliminated` are worth checking on screen early: if a loss
   pill is being replaced by a refusal pill, that is a live bug and not a
   cosmetic one.
