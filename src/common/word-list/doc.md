# word-list

The alphabetical found-words readout. It takes its rows as a prop, which is what
makes it common rather than one family's.

## Intro to area

A found-words game accumulates a list, and the list is the game's record of itself:
what has been found, by whom, and at the end what was missed. Three games keep
one — spellingbee, wordwheel and boggle — and they keep the same one, because a
player who learns to read it in one should read it in the next.

What makes that shareable is that this folder is handed its rows. It does not
know about found-word tables, reveals, bands or scoring; a game folds all of that
into a flat alphabetical array and passes it down. So the folder's whole subject
is what happens to a list of words once somebody has built it: how it is laid
out, how a word says who found it, how you narrow it, and how a word that just
arrived says so.

The filter is also the one thing standing between a finished game and its
answer, and it is worth being exact about how little machinery that involves.
These games have no reveal feature — no button, no gate, nothing withheld. The
missed words fold into the rows the moment the game ends, and from then on the
only question is which way the WHO select is pointing. At terminal it points at
**Found**, so a finished game opens on what you got rather than on what you
missed; All or Missed is one pick away. That default is the whole of the beat
before the answer.

Two more things about it are worth knowing before reading the code, and both are
about the filter. The list is narrowed on two axes rather than one: a KIND
select for which shipped list a word came from, and a WHO select over everyone,
somebody, nobody and each person. They stay separate because they answer
independent questions — one select could not express "leah's bonus words", and
picking Bonus would silently discard a leah selection with nothing on screen
admitting it. Only one of the two is ever gated, and that asymmetry is the rule
worth carrying: KIND narrows what you can already see, which is fair mid-game
even in compete, while WHO must never offer an option whose data is hidden or
whose answer is guaranteed empty. That is why the hook derives its option set
from the rows in front of it rather than from a flag a caller passes.

The empty line follows from the same place. It names whichever axis emptied the
list, because "no words" on a narrowed list reads as a claim about the game
rather than about the filter — and it says "yet" only while the game is running,
since a finished one cannot keep that promise.

The other is where the filter lives. The event log's picker is a hook the game
calls, because that selection also gates the panel's history handle; nothing
outside this list consumes its selection, so it stays inside the component. That
placement is also what keeps a printed board honest, since the PDF builds its own
rows from the same game-side builder and never sees this state.

## Details

**The shape of it.** Three games' info columns render the same component, which
calls two hooks and three shared pieces:

```
spellingbee/InfoCol ┐
   wordwheel/InfoCol ├─▶ <WordList rows players selfId isCompete isTerminal hasBonus>
      boggle/InfoCol ┘         │
                               ├─▶ useWordListFilter  → the two selects + `filter()` + `emptyText`
                               │        └─▶ <FilterSelect> ×2      (common/lists)
                               ├─▶ useRecentlyFound   → which words just arrived
                               ├─▶ <Dot>              (common/members)   the finder's color
                               └─▶ <DefinableWord>    (common/definitions) click-to-define
```

The rows themselves come from outside: all three games build them with
`shared/found-words/wordListRows.ts`, which composes the terminal reveal and the
found/unfound merge in one call.

**Who calls what, and what each piece owns.**

| piece | owns |
|---|---|
| `WordList` | the layout, the heading's tallies, and which marks a row wears |
| `useWordListFilter` | both selects, the option sets and their gating, the filter, the empty line |
| `useRecentlyFound` | which words arrived recently enough to still be underlined |
| `WordList.module.css` | the column grid and every mark's appearance |

**The heading tallies the FILTERED list**, which is what turns the two selects
from a search tool into a reading tool: flip WHO to a player to see their coop
contribution, or to Missed at terminal to see what the reveal cost. Score appears
only for games whose rows carry points, and is gated on all rows rather than the
shown ones, so a filter that matches nothing reads `Score: 0` rather than losing
the segment and reflowing the heading.

**Identity is the dot, never the text.** A found word leads with a filled disc in
its finder's color and the word itself stays body-black; an unfound one (the
post-terminal reveal) leads with a hollow gray ring and a gray word. A solid
disc carries a color far better than thin colored text, so a member's color
only has to survive as a disc and never has to stay legible as a word. Three flags
compose on top — pangram bolds, bonus adds a trailing bullet, and a recently
found word takes an underline in its finder's color. That underline is the one
mark here with a lifetime, and it is suppressed under the reveal, when every
peer's rows land at once and the whole list would otherwise light up.

**The grid is column-major** — down each column, then right — inside a bordered
card whose height is whatever the info column gives it. As many columns show as
that width admits; the rest scroll horizontally, so a longer list makes a wider
grid rather than a taller panel.

The placement on the page — that this is one of the two panels the info column
commonly carries, the other being the event log — is
[docs/playarea.md](../../../docs/playarea.md)'s. The reveal that produces the
unfound rows belongs to [shared/found-words](../../shared/found-words/doc.md).
