# reveal

Showing the answer once a game has ended, as a choice each player makes for
themselves. One hook holds the choice; each game draws whatever its own answer
looks like.

## Intro to area

A finished game still has one thing to say, and for ten of the sixteen it is the
answer itself — the word, the solved grid, the categories nobody got, where the
theme words were hiding. Putting it on screen is not a question about
permission: the server hands the solution over the moment the game is terminal
for everyone, so by the time anybody can ask for it, every client already has
it. What is left is a display question, and it is asked one player at a time.

That is the whole of this folder. `useSolutionReveal` is a `useState` and
nothing else — it writes no row, rides no realtime, and one player pressing
Reveal changes nothing on anyone else's screen. Sitting with a loss is a real
thing friends do, and a post-mortem is people thinking out loud, which a shared
flag ends with one impatient click. The same control also puts the answer away
again, and that is the half that matters most for the games whose reveal
REWRITES the board: hide, and the board is the one the players actually
finished with, marks and wrong letters and all.

Six games can only be finished by producing the answer, so their solver is
already looking at it and asking them to press Reveal would be asking them to
uncover what is in front of them. Those games pass `impliedBy`, their board
starts shown, and the control goes inert rather than absent — the action row
keeps its shape whichever way the game ended. `solvedByMe` is the predicate
they pass, and its whole job is asking the right question per mode: my own
solved bit when we were racing, the game's own verdict when we shared a board.

The games with no answer to show, and the three word games whose found/missed
filter already IS the control, mount none of this.

## Details

```
<PlayArea>                              ten of the sixteen games
└── useSolutionReveal({ impliedBy? })    local, per-player, unpersisted
     ├── impliedBy: solvedByMe({ isCompete, playState, mine })   the six clear wins
     └── revealed · impliedBySolve → the game's own act-reveal describe()
           impliedBySolve → disabled, "Solution already shown"
           revealed       → "Hide …" + IconHideSolution
           else           → "Reveal …", disabled until isTerminal
```

| game | passes `impliedBy` | what its control says |
|---|---|---|
| connections | `solvedByMe` | Reveal / Hide categories |
| psychicnum | `solvedByMe` | Reveal / Hide secrets |
| stackdown | `solvedByMe` | Reveal / Hide solution |
| strands | `solvedByMe` | Reveal / Hide answer |
| waffle | `solvedByMe` | Reveal / Hide answer |
| wordle | `solvedByMe` | Reveal / Hide answer |
| codenamesduet | — | Reveal / Hide partner's key |
| crosswords | — | Reveal / Hide solution |
| letterboxed | — | Reveal / Hide solution |
| wordiply | — | Reveal / Hide best word |
| boggle · spellingbee · wordwheel | — | no control: the word list's found/missed filter is it |
| bananagrams · scrabble · setgame | — | no answer to show |

**The six with a clear win** reach the end by producing the answer: strands (the
theme words tile the board exactly, so solving consumes every cell), psychicnum
(finding all three IS the win, and a found secret is already green), stackdown
(you played all six words), waffle (your solved grid IS the solution),
connections (each match resolves into a band, so all four are up), wordle
(you typed it).

**The four without one** win in ways that leave the answer unseen: letterboxed
(a win is any covering chain, not the seeded pair), crosswords (rebuses and
quantum clues mean your grid may legitimately differ from the author's),
wordiply (winning never means you found the best word), codenamesduet (a win
contacts all fifteen agents, but the partner's card still names which of YOUR
tiles were bystanders).

**Coop asks the game rather than the player because a per-player bit would only
work in half of them.** wordle and waffle do mirror one lock-step across the
coop rows, and connections reads the shared matched set — but stackdown, strands
and psychicnum each leave it unwritten or wrong in coop, in three different
ways, which `solvedByMe`'s own docstring names. One board and one outcome is
also simply the truer question: if the table solved it, everyone is looking at
the solution.

**The server's half is the shield, and it is a different question.** Each
gametype's column grant hands the solution over at `is_terminal` — over for
EVERYONE, never per-player done — so a player who conceded, was eliminated or
finished early cannot read the answer out while the rest are still racing. That
is why a game shows the control disabled with "Can't reveal until all end"
rather than hiding it, and why nothing here reasons about who is locally done.
See [docs/common.md → Revealing the
solution](../../../docs/common.md#revealing-the-solution) and [docs/ui.md →
Terminal results](../../../docs/ui.md#terminal-results--the-moment-vs-the-record).
