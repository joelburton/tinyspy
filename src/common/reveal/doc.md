# reveal

Showing the answer once a game has ended, as a choice each player makes for
themselves. One hook holds the choice; each game draws whatever its own answer
looks like.

## Intro to area

A finished game still has one thing to say, and for eleven of the eighteen it is the
answer itself — the word, the solved grid, the categories nobody got, where the
theme words were hiding. Putting it on screen is not a question about
permission: the server hands the solution over the moment the game has ended
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

Two different things get called the answer here, and telling them apart is what
the folder turns on. The **puzzle-solution** is the one the puzzle itself has:
fixed when the board was generated, the same for everybody, and what the control
shows — wordle's target word, crosswords' author grid. A **board-solution** is
what one player's own finished board amounts to: the grid they filled, the words
they traced, the chain they played. It belongs to that player and that run, and
a player who never solved has none at all.

Where a board-solution IS the puzzle-solution — wordle can only be finished by
typing the target — the solver is looking at the answer already, and asking them
to press Reveal would be asking them to uncover what is in front of them. Those
games pass `impliedBy`, the answer starts shown, and the control goes inert
rather than absent. Where the two never meet however well the game went — a
correct crossword fill is not the author's grid — the game passes nothing: no
result could have shown the player the puzzle-solution already.

So `impliedBy` is one sentence over the two terms: **this player's
board-solution IS the puzzle-solution.** It is asked per player and per run,
never "was it won" — a race ends with a winner who may not be me, and a player
who lost made no board-solution to begin with. `gd.me.hasSolved` is how a game
asks whether they made one: the player's own `solved_at`, which a coop solve
stamps on every teammate. The table below says which games answer which way,
and what each passes.

The games with no answer to show, and the three word games whose found/missed
filter already IS the control, mount none of this.

## Details

```
<PlayArea>                              eleven of the eighteen games
└── useSolutionReveal({ impliedBy? })    local, per-player, unpersisted
     ├── impliedBy: gd.me.hasSolved          the seven where a board-solution IS the puzzle-solution
     └── revealed · impliedBySolve → describeReveal({ noun, … }), placed as the game's act-reveal
           impliedBySolve → disabled, "Solution already shown"
           revealed       → "Hide <noun>" + IconHideSolution
           else           → "Reveal <noun>", disabled until isGameEnded with "Can't reveal until all end"
```

| game | its puzzle-solution | a board-solution reaches it | `impliedBy` | its `noun` |
|---|---|---|---|---|
| connections | the four categories | yes — each match resolves into a band | `hasSolved` | solution |
| psychicnum | the three secrets | yes — finding all three IS the win | `hasSolved` | solution |
| stackdown | the six words, in order | yes — you played every one | `hasSolved` | solution |
| strands | the theme words + spangram | yes — they tile the board exactly | `hasSolved` | solution |
| waffle | the solved grid | yes — by definition | `hasSolved` | solution |
| wordle | the target word | yes — you can only finish by typing it | `hasSolved` | solution |
| wordleone | the target word, also drawn on the board | yes — you can only finish by typing it | `hasSolved` | solution |
| codenamesduet | the partner's key card | **no** — a win contacts all fifteen agents and still never names your bystanders | — | **key cards** |
| crosswords | the author's grid | **no** — rebuses and quantum clues | — | solution |
| letterboxed | the seeded pair | **no** — any covering chain wins | — | solution |
| wordiply | the best possible word | **no** — you beat an opponent, not the best word | — | **best solution** |
| boggle · spellingbee · wordwheel | the full word list | — | — | no control: the list's found/missed filter is it |
| bananagrams · scrabble · setgame · wordsy | none | — | — | no answer to show |

**One `describe()` serves all eleven**, `describeReveal({ noun, revealed,
impliedBySolve?, isGameEnded })`, so the three states cannot drift: inert with
"Solution already shown", live as "Hide <noun>" wearing `IconHideSolution`, and
"Reveal <noun>" — gray until the game is over for EVERYONE, tooltipped *"Can't
reveal until all end"*. `noun` is **solution** unless the thing shown genuinely
is not one. A game with a state of its own
puts it in FRONT of the call rather than inside: psychicnum hides the BUTTON
while you are still hunting (`asker === 'button'`) and keeps the menu row and
the Help list, which is where the glyph is named.

**Both modes ask ME.** The verdict is no proxy — a race is won by someone, and
the racer three guesses off never produced the word — so the answer is the
player's own `common.game_players.solved_at`. It is right in coop too because
a coop solve stamps every teammate at the solving move; a game whose coop SQL
does not yet do that (stackdown, strands) fixes it as it converts
([plans/seat-view.md](../../../plans/seat-view.md) → What this touches).

**Every gated game offers the reveal twice** — an `<ActionButton>` in the
ending action row and a game-menu row, both placing the same `act-reveal`
binding, so the two faces cannot come apart and a player on a phone, with the
info column off-canvas, can still reach it.

**A restart needs nothing from a game.** `GamePage` keys the play surface on
`common.games.restarts`, so a replayed board mounts a fresh hook and starts
blind. That is why the hook offers no way to put a choice back once it is made:
an explicit "no" outranks the implied default, so a hook that survived the
restart would leave a player who solved the replayed board pressing Reveal to
see what they had just earned. The choice belongs to the run, and so does the
hook.

**The server's half is the shield, and it is a different question.** Each
gametype's column grant hands the solution over at `ended_at` — over for
EVERYONE, never per-player done — so a player who conceded, was eliminated or
finished early cannot read the answer out while the rest are still racing. That
is why a game shows the control disabled with "Can't reveal until all end"
rather than hiding it, and why nothing here reasons about who is locally done.
See [docs/common-schema.md → Revealing the
solution](../../../docs/common-schema.md#revealing-the-solution).
