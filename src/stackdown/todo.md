# stackdown — todo

## Bugs

- **`create_game` accepts a one-player compete game.** The compete manifest's
  `numberOfPlayers` is `[2, 6]`, but `stackdown.create_game` has no `< 2` check for compete, so only the FE's
  hidden Start button stops it. Add the check the other compete games have
  (wordle's is `PN498`, a fault, since the app never sends it).

## Soon

- **My own refused word marks nothing on the board; a teammate's does.** A
  teammate's refused word takes the attention flash on their tiles and then the
  refusal's color; mine wears the refusal in the slots, and its tiles land back
  with the attention flash but never the color. It may be right — my eye is on
  the slots, and the slots carry the answer — but the mark's audience is
  "everyone except the person who acted", the opposite of every other verdict.
  Decide it in the tile-feedback pass (the roster's stackdown row).

- **A board that takes no move paints nothing, on purpose.** A covered tile is
  dimmed; a whole board that is not mine to touch — once the game has ended,
  or while a past turn is open — is not, because both are states people sit and
  study. Re-read it against the vocabulary's board-scope marks in the
  tile-feedback pass: the game-over frame says the same without dimming.

- **"Blank this while viewing history" is decided per mark.** `BoardCol`
  derives each of the three LIVE marks — a teammate's attention flash, their
  word wearing its outcome, and tiles held so the answer can be read — and each
  derivation checks `historyView.isViewing` on its own. A fourth live mark added
  later has to remember the same check, and nothing catches it if it does not.
  **scrabble has the same shape.** connections' answer is better: it hands the
  MARK HOOK `quiet: isViewingHistory`, so the mark never fires while a past turn
  is open rather than firing and being blanked on the way down. Start from that
  shape when deciding this.

- **The below-board reserve is a hand-tuned constant.**
  `components/PlayArea.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 8.5rem`, where that last term stands for
  everything else in the board column — the entry row, the feedback slot, a
  mobile status bar. Nothing checks that it matches what is actually there.

  Same construction as the shell's own `--game-chrome-height`, which was a
  hand-written `5rem` until 2026-09-15, when it turned out to omit the 1px
  rule under the header and put every desktop game page a pixel past the
  viewport. That one is composed from its terms now; this one is not.

  Too SMALL overflows the page; too LARGE wastes board. Neither shows without
  measuring, and the page-fits-the-viewport e2e cannot see either — it checks
  the play surface against the window, and this is the slack one level in,
  inside the board column.

- **One keystroke, two words: the ambiguous letter's pill says `warning` and its
  tile ring says `error`.** Typing a letter that matches more than one exposed
  tile shows `FeedbackMessage.result('warning', 'N "X" tiles are on top — click
  one')` in `BoardCol.tsx`, and flashes the candidates through `.flash` in
  `Board.module.css`, which draws `--outcomes-error-ink-color`. The pill and the
  board mark are ONE message (plans/tile-feedback.md — the mark wears the pill's
  outcome), so they should not differ.

  `.flash`'s own comment argues for the red it uses: *"the ERROR red, not the
  lost red: nothing has been judged here, and the outcome vocabulary's `error`
  is the member that never means a judgment"*. That reading is the one
  `docs/outcomes.md` explicitly retired — *"`error` is a full member… a game may
  answer with it, and if one did it would take an error pill and an error bar in
  the log like any other word"* — so `error` is not a neutral "look here" color
  going spare. The comments around the branch say "red" too, and would move with
  whatever is decided.

  Two ways out:
  1. **the ring takes the pill's word** — `.flash` draws
     `--outcomes-warning-ink-color`, and the keystroke has one verdict on two
     surfaces. This is the recommendation the audit made.
  2. **the ring stops being a verdict** — it is a "look here" cue like setgame's
     hint ring, outside the outcome vocabulary, and is renamed and re-tokened to
     say so.

  Found by the `outcome-fix` audit (its F-14); the other keystroke refusal — no
  matching tile, `lost` in the pill, no ring — is fine either way.

- **Turn-by-turn coop, as the coop-style games have.** Joel
  (2026-09-23): *"there's no reason it shouldn't have that."* stackdown's coop
  is free-for-all: its setup form has no `<SetupCoopStyleSection>`, and
  `supabase/sql/stackdown.sql` never moves `current_turn_user_id`, so nobody
  ever waits for anybody. Adding the coop style brings the turn pointer, the
  board's turn gating, the shared "Waiting for ● Name…" line and the turn bell
  with it. Any game whose setup form renders `<SetupCoopStyleSection>` is the
  model.
- **The board generator can pick a band-2 word with no hint.**
  `reveal_next_hint` treats a missing `common.words.hint` as a fault, and one
  band-2 five-letter word flagged `american` has none
  (`select word from common.words where len = 5 and band <= 2 and hint is null`).
  Add `and hint is not null` to the lexicon query in
  `supabase/scripts/generate-stackdown-boards.ts`. The shipped library is clean
  today. Separately, that word is a British spelling wrongly flagged
  `american` — a word-list data fix.

## Someday

## Maybe

- **Should compete charge for the hint and the spoiler, or ban them?** Today
  a compete player can take a clue for the next word, or the word itself,
  free; both hand over progress toward the win. Both are recorded in
  `stackdown.events`.

## Won't do

- **A `MobileStatusBar`** (Joel, 2026-10-05: "no, it shouldn't get a
  mobilestatusbar"). On a phone the stack on screen is the progress.
