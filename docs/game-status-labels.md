# Game titles + club-page status lines

A game's row in ClubPage's games list is two strings: its **title** and its
**status line**.

```
┌─────────────────────────────────────────┐
│  Sun 2026-07-04            ← title      │
│  Sun 2026-07-04 · solved   ← status     │
└─────────────────────────────────────────┘
```

They come from opposite ends of the stack. The title is written by the server
and stored; the status line is computed by the frontend each time the list is
drawn.

## The title

`common.games.title`, seeded by the gametype's `create_game`. Some gametypes
rewrite it as play goes on, so a game's formula is in its SQL: `create_game`,
and its move RPCs or `_sync_title` where the title changes. Three rules shape
every formula:

1. **A title names the game after its content.** Whatever a player would
   recognize the game by — the board's words, the puzzle's date, the answer —
   beats an opaque id. A game with no shareable content to name (bananagrams:
   private grids, private hands) takes a pure identifier instead, the head of
   its own uuid. So does a game whose only nameable content changes every few
   seconds (setgame's sets found), because a title has to be something one
   player can say to another to point at the game.
2. **A title may be a readout.** A game with nothing to show at create time
   starts on the placeholder `'New game'` and rewrites it from play; a mode that
   holds the placeholder for a whole race says `'New compete'`, since that is
   the label a club list actually sits on. When the title can carry **hidden**
   state — at terminal it may become the answer, but only once the answer is
   legitimately shown — the rewrite is derived, not assigned: a `_sync_title`
   helper recomputes it from state and every transition calls it, so a
   timeout, a concede, a manual end and a **replay** all land on the right
   string, and a replayed game stops advertising the answer. A title that only
   mirrors already-public play is assigned by the move RPC instead, and replay
   resets the placeholder.
3. **A title can only carry what every player already sees.**
   `common.games.title` is readable club-wide, so a title is a side channel
   around a game's hidden state. That is why a compete game with private
   guesses stays on its placeholder while the race runs.

Multi-word titles join with a dash: `APPLE-BERRY-CHERRY`.

## The status line

`manifest.labelFor(row)`: a **pure, synchronous** function of one `common.games`
row (see [`common/manifest`](../src/common/manifest/doc.md)), which ClubPage
calls through each row's gametype. Everything a label needs must therefore
already be on the row, which is why the RPCs write a `status` jsonb blob for it
to read. And because `status` is club-readable, the rule for titles holds here
too: a line says only what every player already sees.

Every line has one shape:

```
OUTCOME (why) · other · facts
```

**The rules are in the code** —
[`statusLabel.ts`](../src/common/manifest/statusLabel.ts)'s header holds them:
the four leading words, the two devices and no third, where a reason may and may
not go, and that every `labelFor` is an exhaustive `switch`. That file is what a
`labelFor` author has open. Each helper's own docstring carries the rest —
`dictLabel` why the band comes off `setup` rather than `status`, `wonBy` why a
winner takes no parentheses.

## The guard

[`gameStatusLabels.test.ts`](../src/guards/gameStatusLabels.test.ts) runs every
registered manifest's `labelFor` over a hand-written matrix of the states each
game can reach, with the `status` keys its RPCs really write. It checks that
every gametype has a matrix, that an unknown play state never renders as the
in-progress line (a finished game must not look live in the club list), and
that no `status.reason` value doubles as a `play_state`.

To see every game's actual lines, run `npm run report:labels`: it prints them
as a table, generated from the real `labelFor`s.
