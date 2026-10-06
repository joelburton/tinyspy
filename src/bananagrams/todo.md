# bananagrams — todo

## Bugs

## Soon

- **`shuffleString` in `lib/board.ts` is a hand-written Fisher–Yates**, the
  only one of the repo's copies that takes a string rather than an array.
  `src/common/utils/shuffle.ts` is the shared one and stays array-only, so
  this is either `shuffle([...displayedHand]).join('')` at the one call site
  (`hooks/useHandOrder.ts`) or a one-line `shuffleString` kept as a wrapper
  over it — the wrapper reads better at the call site and keeps the two
  invariant tests in `lib/board.test.ts` where they are.

## Someday

- **Let the table choose how many tiles a Peel and a Dump draw.** Friends
  playing face to face often tweak these (Peel 1, Dump 3 by the rules). Today
  they are fixed constants in `peel` and `dump`. Building it means two setup
  form items, two `bananagrams.games` columns copied at create, and a
  migration that fills 1 and 3 for existing games.

## Maybe

- **Draw `gd.events` as a log in the info column.** The rows are built and
  carried (`peel`, `dump`, `went_out`), and the page shows only the newest as
  the acknowledgment under the board. Whether a list fits beside the hand is
  undecided (Joel, 2026-10-05: "it's possible we may not show it yet").

## Won't do

- **Saying how many tiles a peel drew.** The acknowledgment says who peeled
  and nothing more (Joel, 2026-10-05: "players know how many they get from a
  peel and there isn't space for fluff").
- **Hiding a rival's board and tiles in RLS.** `player_boards` takes the
  club-member gate with `board` and `tiles` out of the column grant, and the
  page's seat rule withholds a rival's mid-race (Joel, 2026-10-05: "we don't
  care about cheating").
