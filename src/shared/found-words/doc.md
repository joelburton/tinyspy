# found-words

What spellingbee, wordwheel and boggle share as games that accumulate a list of
found words: the submit engine, the terminal reveal, the rows the word-list
panel draws, the two data shapes behind them, the typed word's illegal-letter
dim, and the play-surface scaffolding all three compose. Wordiply takes the
submit engine alone — its guesses are the found set, though it keeps no
`found_words` table and shows no list.

## Intro to area

What decides whether a game belongs here is the **model**, which is narrower
than hunting words and which `useFoundWordSubmit`'s docstring states exactly.
A game that has its three parts fits the engine; one that doesn't, doesn't,
whatever it looks like on screen.

That is why the folder is drawn around a data model rather than around a family
of boards. A hive, a wheel and a square of dice have nothing in common visually,
and their boards live in each game's own files. What they share is the model —
and so does wordiply, which is the useful test of the rule. It has no
`found_words` table at all; its guesses ARE its found set. It takes the engine
and nothing else, and that is not a compromise: the model is written over two
lists rather than over a schema precisely so the caller without the schema is
still describing itself accurately.

The **shipped** in "shipped legal list" carries weight. Each board's full answer
key is computed when the board is made and travels to the browser with it, so
the client holds every word that counts before the first keystroke. That is what
makes the engine optimistic: a legal word needs no round trip to confirm, the
`+N` shows immediately, and the commit happens in the background without ever
blocking the next word. It is also why these games are trusting-commit — the
server records what it is told, because the client was given the answers
([CLAUDE.md → Trust model](../../../CLAUDE.md)).

The engine decides what happened, and the game decides what to say about it.
Each answer goes to the game's `onAnswer`, and the game turns it into words and
an outcome in its own `lib/answer.ts` and shows them. The games genuinely
disagree about both. A game whose board is in front of you reads a word the list
does not know as a wrong move — the letters are right there and the list is the
ordinary English one. Wordiply reads the identical event as a warning, because
it is asking you to try strange words and making a bad guess feel like an error
would be mean. Some games have answers the others lack — a pangram — and one
misses the list in more ways than another can tell apart. What an answer MEANS
is a rule of the game, not a fact about the lookup that produced it, so the
engine has no words of its own. The one thing it shows is the server's `not-ok`
when a commit does not land: that sentence is the server's, and every game shows
it the same way ([docs/outcomes.md → One event, one outcome](../../../docs/outcomes.md)).

A word has two spellings in this folder, and the difference is not cosmetic.
`FoundWordsWord` is a shipped word as the board data gives it — snake,
`is_pangram`, straight off the JSON. `LegalWord` is what the engine hands back
from a lookup — camel, and carrying `isBonus`, which the shipped entry has no
room for because the two lists are kept separately and which list a word came
from is only knowable once they are merged. Each game's `legalIndex` is where
one becomes the other, and `WordListRow` is camel for the same reason: it is an
FE shape, not a row.

## Details

The folder holds no component. Its seams are a who-calls-what question, so:

```
spellingbee/PlayArea ┐
   wordwheel/PlayArea ├─▶ useFoundWordSubmit ──▶ the game's localFeedbackSlot
      boggle/PlayArea │            ▲                (a commit's not-ok only)
     wordiply/PlayArea ┘            lookup / commit / onAnswer
                                    (onAnswer shows the game's own lib/answer.ts)

spellingbee/PlayArea ┐  (twice each: once for the screen, once inside the print action)
   wordwheel/PlayArea ├─▶ buildWordListRows ─┬─▶ buildRevealWords
      boggle/PlayArea ┘                      └─▶ buildDisplayRows ─▶ WordListRow[]
                                                        └─▶ <WordList> (common/word-list)

the three PlayArea roots + BoardCols ─▶ foundWordsPlayArea.module.css
                                        (.layout · .belowBoard · .loading · .empty)
the three TypedWord.tsx              ─▶ typedWord.module.css   (.illegal)
bee-games/makeBeeGame · the three useGame.ts ─▶ foundWords.ts
                                        (FoundWordRow · FoundWordsWord)
```

**The screen and the printer are the same call, not two copies of one recipe.**
That is the point of `buildWordListRows` existing above the reveal and the
merge: a printed board cannot quietly disagree with the one on screen about what
was missed, because there is only one place that decides.

**`hasBonus` stays each game's own comparison** (`legal !== required`, boggle's
`legal_band !== band`), because it is the one input they compute differently.
Passing false reveals the required half alone.

## The reveal's sizing, and the board with no real bonus list

`buildRevealWords` is a pure client-side fold — nothing new crosses the wire at
game end, and the gate is the viewer's own reveal toggle. Two things about what
it produces are worth knowing before reading it, and neither is visible from the
list that draws the result.

**Sizing, measured against the local dictionary at the default bands** (required
3 / legal 5): the bonus set is roughly the **same size** as the required set, not
the multiple it looks like — band 3→5 is a narrow widening, and what really
separates the two is the `american / not slang / clean` filter. So the terminal
list roughly doubles. The grid it lands in is column-major and takes its height
from its column, so that reads as *more columns*, never a taller panel.

**When a board has no real bonus list**, the reveal skips it and the word list's
KIND filter disappears. That is `legal_band === band` (boggle) / `legal ===
required` (spellingbee, wordwheel), where "bonus" degenerates to nothing but the
words the clean filter removed from required — crude/slang/slur, not a wider
dictionary, and not a list to hand anyone as "here's what you missed." One flag
per game gates the reveal, the KIND select, and (in boggle) the Bonus stat cells,
so the three cannot disagree about whether this board has bonus words.
