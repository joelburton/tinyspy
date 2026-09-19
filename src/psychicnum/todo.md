# psychicnum — todo

## Bugs

## Soon

- **A decided tile's permanent fill derives its color a second time.** `Board.tsx`
  paints `guessed && (correct ? styles.correct : styles.incorrect)` straight off
  the row's boolean, and those two classes are `--outcomes-won-*` /
  `--outcomes-lost-*`. That is the same mapping `lib/answer.ts` makes, written
  again — so a miss ruled anything but `lost` would move the log and the pill
  and leave the board behind.

  Left alone by `outcome-fix` (2026-09-17) for a reason about the MARK rather
  than the word. The shared `verdict*` classes are for a beat: a piece flashes
  the answer and hands itself back. These fills are permanent — a guessed tile
  stays colored for the rest of the game, as the board's record of what has been
  ruled out — and routing a lasting state through the transient-verdict
  machinery is a decision that those are one thing, not a rename. It is also not
  expressible today: every `VERDICT_TONE` class sets exactly `--verdict-tone` /
  `--verdict-fill` / `--verdict-ink`, and a decided tile needs an EDGE. The color
  exists (`--outcomes-<family>-edge-color`, all seven, in `daylight.css`); what
  does not is a shared class set for a permanently-decided piece. That is
  [tile-feedback](../../plans/tile-feedback.md)'s question.

  **psychicnum is the only game with this shape**, checked 2026-09-17 across
  every board stylesheet: wordle's and waffle's tile colors are their own g/y/x
  vocabulary, connections' history tint is transient and already reads a total
  table, and strands' hint bar is a progress bar rather than a decided piece.

- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).

## Someday

- **`AnswerMessage` belongs in `common/`.** Joel, 2026-09-19: *"i can't think
  of a reason this wouldn't be the same for every game."* It is `{ outcome,
  text }` — already the argument pair `FeedbackMessage.result(outcome, text)`
  takes, so common has the shape implicitly and only lacks the name. Kept here
  while one game has it; the move is the second game's moment, with the
  `answerMessage` pattern itself (this game's `Answer` union stays this game's).

## Maybe

- **Pin the board's word lengths in pgTAP.** `create_game` deals five-letter
  words plus exactly one nine-letter word, and that is the design (2026-09-19)
  — but `create_game_test.sql` asserts the count, the three secrets and the
  subset property, never a length, which is how a "TEMP" comment survived on
  it for twelve weeks. One assertion that a dealt board holds exactly one
  nine-letter word would keep the design from drifting silently.

## Won't do

- **Anti-spam on guessing** (2026-06-14). The audience is friends (CLAUDE.md →
  Trust model), so nobody is spamming anybody; and the guess budget — 3, 5, 7
  or 9, checked in SQL — caps what a spammer could spend anyway.
- **A livelier `.infoState` readout** (2026-08-02). The info column's state line
  ("1/3 found · 4/7 guesses used", drawn by `StateLine`) is plain on purpose; it
  does not need spellingbee's rank-ladder treatment.
