# codenamesduet — todo

## Bugs

## Soon

- **`CluePanel` needs a name that says what it is.** Joel: *"'CluePanel' is a
  terrible name: CLUE FOR WHAT?"* — and the first answer was wrong, which is
  the part worth keeping: it is NOT the AI suggester (that is
  `CodenamesduetAISuggestCompanion`, split out of the same file). It is the
  below-board clue strip — the giver's form, the guesser's clue display, the
  Pass button — and it is not a floating panel at all, so neither `Panel` nor
  `Modal` belongs in whatever it becomes.

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

- `Board.module.css` sets `ui-monospace, Menlo, monospace` on `.tileKey`, the
  pending "…" in a tile's corner — the one monospace on this play surface.
  Decide with the setup forms' mono question (`src/common/setup-form/todo.md`),
  not piecemeal.

- **In sudden death, a not-ok hides the sudden-death notice.** The notice and
  the local feedback pill share the slot under the board, so while a not-ok is
  open the info column is the only place sudden death shows — and on a phone
  that column is off-canvas. The notice comes back when the pill's × is
  pressed.

## Maybe

## Won't do

- **Mission / campaign mode** (2026-08-02). The rulebook's mission maps —
  variable starting turn counts. Cheap to build; nobody wants it, and a
  campaign implies cross-session persistence the club model doesn't carry.
- **Tile `aria-label`s** (2026-08-02). Screen readers are out of scope
  project-wide — see [`CLAUDE.md`](../../CLAUDE.md). The tiles keep their
  `aria-hidden`.
