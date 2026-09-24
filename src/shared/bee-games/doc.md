# bee-games

What spellingbee and wordwheel share and nothing else does: the hook factory
behind their identical data lifecycles, the board header it returns, the compete
leaderboard row, the coordinate-unit geometry a hive and a wheel are both drawn
by, and the sentences a finished game says. Everything the wider found-words family shares — the submit engine,
the reveal, the rows, the row and word types, the typed-word look, the
play-surface scaffolding — is [shared/found-words](../found-words/doc.md).

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
frontend is two scored lists either way. A set and a multiset produce the same
SHAPE of answer, and the shape is all a data hook sees. Hence one factory, and
hence the seam being where it is: a game's `hooks/useGame.ts` is a binding and
its type aliases, and the moment either game grows a column of its own, that
file is what takes its body back.

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
  wordwheel/hooks/useGame ─┴─▶ makeBeeGame(schema) ─▶ useBeeGame(gameId)
                                   │                    ├─ games_state  (once)
                                   │                    └─ found_words  (realtime)
                                   └─▶ BeeGame  ─▶ re-exported as <Game>Game

the two BoardCols ─▶ beeBoard.module.css   (.boardCol → --u · --board-width
                                            .mobileStatus)
the two PlayAreas ─▶ beeLeaderboard.ts     (LeaderboardEntry, via readLeaderboard)
                  ─▶ terminal.ts           (buildTerminalMessage — the pill and the
                                            action row's line at the end)
```

**The endings are shared because the games end alike.** Both modes, every play
state and every reason are the same in the two games, and so is every sentence
said about them; only the brand differs, and no sentence names it. Every other
game keeps its `buildTerminalMessage` in its own `lib/terminal.ts`
(docs/playarea.md → What leaves the component file). The day one bee game's
ending needs a word the other's doesn't, the function goes back to the game
folders.

**The header is read once and the found list is not.** `<schema>.games` is
immutable during play — the letters and both word lists never change, and
terminal lives on `common.games` — so the header is a one-shot fetch. Making it
a per-event refetch instead would re-download both word lists on every teammate
submission. `found_words` is the opposite: every submission appends a row, so it
refetches on realtime events.

**Two failure slots, not one.** The header is fetched once and never retried, so
a failure of it is permanent; the found list refetches constantly, so a failure
of it should clear the moment one read works. Sharing a slot would let a good
refetch erase a header failure that is still true. The header's wins at the
return, because once it has failed the board is not coming back however well the
found list is loading.

**The `games` subscription beside `found_words` is not redundant.**
`replay_board` only DELETEs found rows, and realtime filters do not reliably
match DELETE events — so the RPC's no-op write to `games` is what wakes every
client into refetching the now-empty list.
