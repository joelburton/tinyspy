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

Two different things get called the answer here, and telling them apart is what
the folder turns on. The **puzzle-solution** is the one the puzzle itself has:
fixed when the board was generated, the same for everybody, and what the control
shows — wordle's target word, crosswords' author grid, psychicnum's three
secrets, letterboxed's seeded pair, wordiply's best possible word,
codenamesduet's partner key card. A **board-solution** is what one player's own
finished board amounts to: the grid they filled, the words they traced, the
chain they played. It belongs to that player and that run, and a player who
never solved has none at all.

In six of the ten games a board-solution IS the puzzle-solution. wordle can only
be finished by typing the target; waffle's solved grid is the solution grid by
definition; connections, stackdown, strands and psychicnum are the same. Their
solver is looking at the answer already, and asking them to press Reveal would
be asking them to uncover what is in front of them — so those games pass
`impliedBy`, the answer starts shown, and the control goes inert rather than
absent.

In the other four the two never meet, however well the game went. A correct
crossword fill is not the author's grid (rebuses, quantum clues); letterboxed is
won by any covering chain and not by the seeded pair; wordiply's winner played
better than their opponent, not better than the best word that exists; and
contacting all fifteen agents in codenamesduet still never says which of your
own tiles your partner saw as bystanders. Those four pass nothing — no result
could have shown them the puzzle-solution already.

So `impliedBy` is one sentence over the two terms: **this player's
board-solution IS the puzzle-solution.** It is asked per player and per run,
never "was it won" — a race ends with a winner who may not be me, and a player
who lost made no board-solution to begin with. `solvedByMe` is how each mode
asks whether they made one.

The games with no answer to show, and the three word games whose found/missed
filter already IS the control, mount none of this.

## Details

```
<PlayArea>                              ten of the sixteen games
└── useSolutionReveal({ impliedBy? })    local, per-player, unpersisted
     ├── impliedBy: solvedByMe({ isCompete, playState, mine })   the six where a board-solution IS the puzzle-solution
     └── revealed · impliedBySolve → the game's own act-reveal describe()
           impliedBySolve → disabled, "Solution already shown"
           revealed       → "Hide …" + IconHideSolution
           else           → "Reveal …", disabled until isTerminal
```

| game | its puzzle-solution | a board-solution reaches it | `impliedBy` | its `noun` |
|---|---|---|---|---|
| connections | the four categories | yes — each match resolves into a band | `solvedByMe` | solution |
| psychicnum | the three secrets | yes — finding all three IS the win | `solvedByMe` | solution |
| stackdown | the six words, in order | yes — you played every one | `solvedByMe` | solution |
| strands | the theme words + spangram | yes — they tile the board exactly | `solvedByMe` | solution |
| waffle | the solved grid | yes — by definition | `solvedByMe` | solution |
| wordle | the target word | yes — you can only finish by typing it | `solvedByMe` | solution |
| codenamesduet | the partner's key card | **no** — a win contacts all fifteen agents and still never names your bystanders | — | **key cards** |
| crosswords | the author's grid | **no** — rebuses and quantum clues | — | solution |
| letterboxed | the seeded pair | **no** — any covering chain wins | — | solution |
| wordiply | the best possible word | **no** — you beat an opponent, not the best word | — | **best solution** |
| boggle · spellingbee · wordwheel | the full word list | — | — | no control: the list's found/missed filter is it |
| bananagrams · scrabble · setgame | none | — | — | no answer to show |

**One `describe()` serves all ten**, `describeReveal({ noun, revealed,
impliedBySolve?, isTerminal })`, so the three states cannot drift: inert with
"Solution already shown", live as "Hide <noun>" wearing `IconHideSolution`, and
"Reveal <noun>" — gray until the game is over for EVERYONE, tooltipped *"Can't
reveal until all end"*. `noun` is **solution** unless the thing shown genuinely
is not one, which is true in exactly two games. A game with a state of its own
puts it in FRONT of the call rather than inside: psychicnum hides the BUTTON
while you are still hunting (`asker === 'button'`) and keeps the menu row and
the Help list, which is where the glyph is named.

**Where the two are the same thing, the reveal is mostly a convenience**, and
for three games it is a real one: stackdown's six words, strands' `Words:` line
and wordle's answer line gather the same answer as click-to-define text, which
the board itself doesn't give you. For waffle, connections and psychicnum the
only visible change is the control going quiet.

**Where they differ, the control always has something to give**, and crosswords
is the case worth understanding: its puzzle-solution is the AUTHOR's grid, a
distinct artifact from a correct fill, and the reveal grays his letters in over
the player's — so it reads as a diff as much as a reveal, and Hide brings their
own fill back, marks and all. None of the four is a candidate for `impliedBy`:
there is no state a player could reach in which the puzzle-solution has already
been shown to them.

**Coop asks the game rather than the player, and no per-player row could stand
in for it.** The games that keep a `players.solved` keep it as COMPETE's finish
line — stackdown writes it only in compete, and strands' coop branch ends the
game without touching it — and psychicnum's `found_secrets_count` is a faithful
per-player count that is not a team total, so two teammates finding 2 and 1
leaves neither at three. wordle and waffle do mirror a bit lock-step across the
coop rows, and connections reads the shared matched set, but a rule that works
in half the games isn't a rule. It is the truer question anyway: one board, one
outcome, and if the table solved it everyone is looking at the solution.

**A restart needs nothing from a game.** `GamePage` keys the play surface on
`common.games.restarts`, so a replayed board mounts a fresh hook and starts
blind. That is why the hook offers no way to put a choice back once it is made:
an explicit "no" outranks the implied default, so a hook that survived the
restart would leave a player who solved the replayed board pressing Reveal to
see what they had just earned. The choice belongs to the run, and so does the
hook.

**The server's half is the shield, and it is a different question.** Each
gametype's column grant hands the solution over at `is_terminal` — over for
EVERYONE, never per-player done — so a player who conceded, was eliminated or
finished early cannot read the answer out while the rest are still racing. That
is why a game shows the control disabled with "Can't reveal until all end"
rather than hiding it, and why nothing here reasons about who is locally done.
See [docs/common.md → Revealing the
solution](../../../docs/common.md#revealing-the-solution) and [docs/ui.md →
Terminal results](../../../docs/ui.md#terminal-results--the-moment-vs-the-record).
