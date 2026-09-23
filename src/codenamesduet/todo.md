# codenamesduet — todo

## Bugs

- `.clueLabel` in `CluePanel.module.css` is read by nothing
  (`cssClasses.test.ts` holds it in `DEAD_CLASS_PENDING`).

## Soon

- **`CluePanel` needs a name that says what it is.** Joel: *"'CluePanel' is a
  terrible name: CLUE FOR WHAT?"* — and the first answer was wrong, which is
  the part worth keeping: it is NOT the AI suggester (that is
  `CodenamesduetAISuggestCompanion`, split out of the same file). It is the
  below-board clue strip — the giver's form, the guesser's clue display, the
  Pass button — and it is not a floating panel at all, so neither `Panel` nor
  `Modal` belongs in whatever it becomes.

- **The two finished-player banners in `InfoCol.tsx` put the actor
  mid-sentence** ("All your agents have been found! From here ● moth gives
  every remaining clue — keep guessing to find theirs."), which is why they
  pass `show="both"` — a phone dropping the name would leave a hole. Joel
  (2026-09-12): lead with the actor instead, "● moth gives remaining clues",
  which fits a phone better anyway and lets the banners take the default
  `show`. The peer-finished banner already leads and can shorten to match.

- **Ring the bell when a clue arrives for you to guess from** (Joel,
  2026-09-23). Every game whose turn moves the shared `current_turn_user_id`
  rings from `GamePage`'s `useTurnBell`; this game never writes that column,
  because its "your turn" is an event — being given a clue — so it rings from
  its own code, `playSound('bell')` where the clue lands for the guesser. The
  rollout is recorded in `src/common/sounds/todo.md`.

## Someday

- **The AI companion's minimum size, 240×140, is eyeballed.** The rule is that
  a companion's minimum comes from what its BODY needs, not from what looked
  right (`docs/ui.md` → Floating panels); every companion's pair is listed in
  `src/common/floating-panels/todo.md`, to be settled one game at a time.

- `Board.module.css` sets `ui-monospace, Menlo, monospace` on the board — the
  most consequential of the app's monospace uses, because it is a play
  surface rather than a form. Decide with the setup forms' mono question
  (`src/common/setup-form/todo.md`), not piecemeal.

## Maybe

## Won't do

- **Mission / campaign mode** (2026-08-02). The rulebook's mission maps —
  variable starting turn counts. Cheap to build; nobody wants it, and a
  campaign implies cross-session persistence the club model doesn't carry.
- **Tile `aria-label`s** (2026-08-02). Screen readers are out of scope
  project-wide — see [`CLAUDE.md`](../../CLAUDE.md). The tiles keep their
  `aria-hidden`.
