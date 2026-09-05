# outcomes

The outcome vocabulary — the closed list of words the app uses for how a thing
turned out, and nothing else. What each word means, and every surface that shows
one, is [docs/outcomes.md](../../../docs/outcomes.md).

## Design

Lots of things in this app have to say how something went: a feedback pill after
a move, a tile that just turned a color, a bar in the turn log, a finished game's
verdict, an envelope coming back from the server. Left alone, each of those grows
its own words — one says `good`, another says `won`, a third says `success` — and
then no two surfaces can be made to agree, because there is nothing to agree
*to*. So the app has one list of words, and this folder is where it lives.

It is a folder holding a single type, which looks like overkill until you ask
where else it could go. Every consumer is a peer: the pill does not own the
board, the board does not own the turn log, the server envelope owns none of
them. Put the list inside whichever one happened to need it first, and naming a
color now means importing that feature. A folder of its own is what keeps the
vocabulary from belonging to somebody.

The sharp part of the design is how little the folder does. It owns the words and
nothing else — not the colors each word wears (those are theme tokens), not the
sentences a player reads (nothing here produces text), and not the choice of
which word fits a situation (that is decided at the situation, by a board, an
envelope's severity, a log row). So there is no logic here and nothing local to
break, and the vocabulary is instead kept honest from outside: guards check that
the words the SQL raises are these words, and that every member carries a full
set of color roles in both themes. That makes adding a word a real commitment
rather than a one-line edit — which is the point, because a word nobody can tell
apart from its neighbors is how a vocabulary stops being one.

## Details

- **Why seven words, why `error` is a full member** rather than something beside
  the list, and why one spelling everywhere is the whole point: `outcomes.ts`
  carries that argument, next to the union it is about.
- **The guards**, both outside the folder: `src/guards/raiseCodes.test.ts` ties
  the list to what the SQL actually raises, and `src/guards/cssTokens.test.ts`
  fails unless every member has all seven color roles — in both themes, since a
  separate check there holds the two theme files to one token set.
- **A subset is `Extract`ed from the list and lives with its consumer**, not
  here: `TerminalOutcome` in `common/terminal/`, `GuessOutcome` in connections.
  Cutting it from `Outcome` means renaming a member breaks the subset instead of
  quietly leaving it behind, and keeping subsets out of this folder stops it
  becoming a catalog of everyone's special cases.
- **A subset has to earn being narrower.** "How a finished game reads" genuinely
  is three words, because `near` and `warning` judge a move and a finished game
  has no more moves. "How a turn reads" is not narrower at all — any outcome can
  be a turn's outcome.
