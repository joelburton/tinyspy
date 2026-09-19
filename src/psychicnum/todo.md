# psychicnum — todo

## Bugs

## Soon

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
