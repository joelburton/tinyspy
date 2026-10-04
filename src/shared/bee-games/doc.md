# bee-games

What spellingbee and wordwheel share and nothing else does: the one blob shape
their builders write and the one reading that turns it into `gd`, the compete
leaderboard row, the coordinate-unit geometry a hive and a wheel are both drawn
by, the setup form's target-rank choices and custom-letters split, and the
sentences a finished game says. Everything the wider found-words family
shares — the submit engine, the reveal, the rows, the row and word types, the
typed-word look, the play-surface scaffolding — is [shared/found-words](../found-words/doc.md).

## Intro to area

The surprising thing about this folder is that the two games it serves do not
agree about the rule of their own game. spellingbee's board is a SET of seven
letters and you may reuse any of them freely; wordwheel's is a MULTISET of nine
tiles and each use spends one. That is not a detail — it is the whole difference
between the two games, and it would normally be a reason to share nothing.

It shares almost everything anyway, because of where that difference lives.
Neither client decides whether a word is legal: the board builder resolves it
once, when the board is made, and ships the finished word lists with the board.
So the multiset rule is spent inside an edge function, and what arrives at the
page is two scored lists either way. A set and a multiset produce the same
SHAPE of blob, and the shape is all the reading sees. Hence one `makeBeeGameData`
and one set of `GBee` types here, and hence the seam being where it is: a
game's `hooks/useGame.ts` is the one-line binding that calls it (with the
game's own setup rows), its `types.ts` names the shapes as its own, and the
moment either game grows a fact of its own, those two files are what take it.

The same trick makes one stylesheet draw both boards, which is the part worth
reading `beeBoard.module.css` for. A hexagonal hive and a round wheel have no
geometry in common, but they are sized the same way: fill the smaller of the
width left beside the info column and the height left above the input row, then
cap it. Only the numbers going into that differ — how many coordinate units wide
the board's bounding box is, how many tall, and what the cap is counted in — so
the arithmetic is written once here and the four numbers are declared by each
game on its own `.layout`. That is what a custom property is for, and it is why
the file has no per-board branch in it.

What comes out of it is `--u`, one board coordinate unit, and `--board-width`
derived from it. The second name is the seam: the family's shared below-board
row reads `--board-width` to match the board it sits under, and boggle's square
publishes the same name from completely different arithmetic. One name, three
boards, no shared geometry between them.

## Details

```
spellingbee/hooks/useGame ─┐
  wordwheel/hooks/useGame ─┴─▶ makeBeeGameData(blob, myId, makeSetupRows) ─▶ gd
                                   └─▶ GBee* types ─▶ named in each types.ts as G*

the two BoardCols ─▶ beeBoard.module.css   (.boardCol → --u · --board-width
                                            .mobileStatus)
the two PlayAreas ─▶ beeLeaderboard.ts     (LeaderboardEntry, via readLeaderboard)
                  ─▶ terminal.ts           (buildTerminalMessage — the pill and the
                                            action row's line at the end)
the two SetupForms ─▶ beeSetup.ts          (TARGET_RANK_CHOICES · NO_TARGET ·
                                            splitCustomLetters(raw, 7 | 9))
```

**The two `PlayArea.tsx` files are deliberately two identical copies.** Each
game keeps a PlayArea that reads top to bottom like every other game's, so the
component is not shared; a change to one is made to the other. Diffing them
with the game names swapped shows only the "hive" / "wheel" wording.

**The endings are shared because the games end alike.** Both modes, every play
state and every reason are the same in the two games, and so is every sentence
said about them; only the brand differs, and no sentence names it. Every other
game keeps its `buildTerminalMessage` in its own `lib/terminal.ts`
(docs/playarea.md → What leaves the component file). The day one bee game's
ending needs a word the other's doesn't, the function goes back to the game
folders.

**The blob is the whole read.** Each game's `_rebuild_data_cols` writes
`game_data` after every move — the puzzle and its words, every found word,
each player's finds and rank, the team's in coop — and the page re-reads the
blob off `common.games`; nothing here reads a table or subscribes to one. The
seat rule is `makeBeeGameData`'s: mid-race in compete a rival's rows leave
the log while their counts stay, and the game's end opens everything.

**The fixture is shared too** (`beeGameData.fixture.ts`): it builds the blob
the builder would from facts, over a game's fixture board, and each game's
`lib/gameData.fixture.ts` fixes that board and its brand.
