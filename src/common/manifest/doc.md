# manifest

What a game declares about itself — the contract every manifest is written against, and the status label it produces. The manifest LIST is `src/gametypes.ts`, the one file allowed to import games.

## Intro to area

The shell draws every game on the roster and names none of them. It can do that
because
every game exports one object saying what it is — its identity, how it presents,
what it needs from a club, and the handful of functions the shell may call on
its behalf — and `GameManifest` is the shape of that object. A game
that fills it is playable; a game that stops filling it does not compile.

Which games exist is a separate question, and its answer is a list rather than
a type: `src/gametypes.ts`, the one file ESLint lets import from every game
folder. Everything the shell renders is a walk over that list. Removing a game
is deleting its folder, its lines there, and its schema, with no game-specific
code left anywhere else to find — the removability invariant in
`docs/common.md`, which also holds the add-a-game checklist. That property is
the monorepo's structural integrity check rather than a convenience.

Most of a manifest is data the shell reads. Three members are functions the
shell CALLS — starting a game, ending one, and answering a countdown that
expired — and all three answer in the envelope every RPC answers in, because
the shell has to branch on them without knowing which game it is holding.
`manifestRpcs.ts` builds two of the three, since every game's version is the
same closure over a different schema.

The one thing this folder produces rather than describes is the **status
line**: the second line of a game's row on the club page, written by the
game's own `labelFor` out of a `common.games` row. `statusLabel.ts` holds the
vocabulary those all speak, so no game invents its own word for "in progress",
and `docs/game-status-labels.md` shows what every game actually says.

## Details

- **`labelFor` is pure and synchronous, and that is a constraint on the
  SERVER.** The club page draws a whole club's games from one query, so
  everything a label needs has to be on the row already — which is why every
  state-changing RPC rewrites the row's `status` blob for it to read rather
  than leaving the frontend to go ask. A label that needed a second query would turn one query
  into one per row.

- **A status line may only say what every player already sees.**
  `common.games.status` is club-readable, so a compete game's private progress
  must never be written there. Several compete labels are a bare `Playing` for
  exactly that reason, and it is a rule about the RPC, not about the label.

- **`TimerMode` lives here without a member needing it.** Every setup form and
  `useGameTimer` speak it, and the manifest is where a game's contract with the
  shell is read, so this is where a reader goes looking.

- **The registry's ORDER carries one thing and not the other.** It sets the row
  order of the generated `docs/game-status-labels.md`, so reordering it rewrites
  that doc. It reaches no player: the two lists that walk the registry — the
  club page's start list and the Edit-club enrollment list — each sort by
  brand, coop first, explicitly.

- **A gametype string can miss the registry, and a miss means three
  things.** From the URL it is a typo and earns the error page; from another
  manifest it is impossible and faults; from a `common.games` row it means
  this bundle is behind the server, because removing a game deletes its rows.
  `manifestFor` says so where it sits, and `unknownGametype.ts` is the third
  answer: one fault per load, telling the player to reload.

- **`manifest` and `game-page` import each other.** This direction is type-only
  — a manifest names `GamePageCtx` to type its `PlayArea` — so the cycle is
  erased at runtime, and the import says so where it sits.
