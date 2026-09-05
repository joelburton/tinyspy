# outcomes

The outcome vocabulary — the closed list of words the app uses for how a thing
turned out. What each one means, and every surface that shows it, is
[docs/outcomes.md](../../../docs/outcomes.md).

## Design

**A folder holding one type, and that is the design rather than an accident of
it.** The words are reached for by a feedback pill, a board, a tile, a turn-log
bar and a server envelope — none of which owns the others, and any of which
would have ended up owning the list if the list had lived inside the first
consumer to need it. A folder of its own is what keeps naming a color from
requiring an import of somebody's game manifest.

`outcomes.ts` carries the reasoning about the words themselves: why there are
seven, why `error` is a full member rather than a thing beside the list, and
why one spelling everywhere is the whole point. This file says the rest.

**The folder owns the words and nothing else.** That boundary is unusually
sharp, and it is what makes a vocabulary folder work:

- **Not the colors.** Each word's seven roles live in the `--outcomes-*` bucket
  in `common/themes/`, and a theme may move any of them without asking here.
- **Not the text.** Nothing in this folder produces a sentence a player reads.
- **Not the choosing.** Which word a given situation takes is decided at the
  situation — by a game's board, by an envelope's severity, by a log row.

So there is no logic here to test, and nothing local to break. **What keeps the
vocabulary honest is guarded from outside it**, by two tests that read this
union rather than restating it: `src/guards/raiseCodes.test.ts` ties it to the
words the SQL actually raises, and `src/guards/cssTokens.test.ts` fails unless
every member carries all seven color roles — in both themes, since a separate
check in that file holds the two theme files to the same token set. Adding a
word is therefore a real commitment — the guards will name what it still owes —
and
that is deliberate, because a word nobody can tell apart from its neighbors is
how a vocabulary stops being one.

**A subset is `Extract`ed, and it lives with its consumer, not here.** When
part of the list is the right answer for a narrower job, it is cut from
`Outcome` so that renaming a member breaks the subset instead of silently
leaving it behind — and it is declared where it is used: `TerminalOutcome` in
`common/terminal/`, `GuessOutcome` in connections. Keeping subsets out of this
folder is what stops it from slowly becoming a catalog of everyone's special
cases; the folder's job is the one list, spelled once.

A subset also has to earn being narrower than the list. "How a finished game
reads" is genuinely three words, because `near` and `warning` judge a move and
a finished game has no more moves. "How a turn reads" is not narrower at all —
any outcome can be a turn's outcome.
