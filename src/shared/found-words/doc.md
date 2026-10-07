# found-words

What spellingbee, wordwheel and boggle share as games that accumulate a list of
found words: the submit engine, the ending reveal, the rows the word-list
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
`+N` shows immediately, and the send happens in the background without ever
blocking the next word. It is also why the submit is a TRUSTING one — the
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
when a send does not land: that sentence is the server's, and every game shows
it the same way ([docs/outcomes.md → One event, one outcome](../../../docs/outcomes.md)).

A word has one spelling in this folder: the blob's. `FoundWordsWord` is a
legal word of the board as `gd.puzzle.words` holds it — camel, every word
flagged `bonus` or not — and `FoundWordRow` is a find as `gd.foundWords` holds
it, the same word with who found it (`by`) and when (`at`). The engine's
lookup hands back the board's word itself, so nothing is translated between a
list and a lookup; `WordListRow` is the one other shape, the row the shared
word list draws.

## Details

The folder holds no component. Its seams are a who-calls-what question, so:

```
spellingbee/PlayArea ┐
   wordwheel/PlayArea ├─▶ useFoundWordSubmit ──▶ the game's localFeedbackSlot
      boggle/PlayArea │            ▲                (a send's not-ok only)  
     wordiply/PlayArea ┘            lookup / send / onAnswer
                                    (onAnswer shows the game's own lib/answer.ts)

spellingbee/PlayArea ┐  (twice each: once for the screen, once inside the print action)
   wordwheel/PlayArea ├─▶ buildWordListRows ─┬─▶ buildRevealWords
      boggle/PlayArea ┘                      └─▶ buildDisplayRows ─▶ WordListRow[]
                                                        └─▶ <WordList> (common/word-list)

the three PlayArea roots + BoardCols ─▶ foundWordsPlayArea.module.css
                                        (.layout · .belowBoard · .loading · .empty)
the three TypedWord.tsx              ─▶ typedWord.module.css   (.illegal)
the games' gd and lib/answer.ts        ─▶ foundWords.ts
                                        (FoundWordRow · FoundWordsWord, the blob's
                                         two shapes; boggle's rows catch up at its
                                         conversion)
```

**The screen and the printer are the same call, not two copies of one recipe.**
That is the point of `buildWordListRows` existing above the reveal and the
merge: a printed board cannot quietly disagree with the one on screen about what
was missed, because there is only one place that decides.

## The reveal's sizing, and the board whose bands are equal

`buildRevealWords` is a pure client-side fold — nothing new crosses the wire at
game end, and the gate is the viewer's own reveal toggle. Two things about what
it produces are worth knowing before reading it, and neither is visible from the
list that draws the result.

**Sizing, measured against the local dictionary at the default bands** (required
3 / legal 5): the bonus set is roughly the **same size** as the required set, not
the multiple it looks like — band 3→5 is a narrow widening, and what really
separates the two is the `american / not slang / clean` filter. So the ending
list roughly doubles. The grid it lands in is column-major and takes its height
from its column, so that reads as *more columns*, never a taller panel.

**A board whose legal band equals its required band** still has bonus words:
the ones the clean filter removed from the required list (crude, slang, slur).
They are bonus words like any other — scored when found, revealed when missed —
the same as a band's unclean words are when the legal band is wider.
