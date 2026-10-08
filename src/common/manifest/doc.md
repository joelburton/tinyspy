# manifest

What a game declares about itself — the contract every manifest is written against, and the status label it produces. The manifest LIST is `src/gametypes.ts`, the one file allowed to import games.

## Intro to area

The shell draws every game on the roster and names none of them. It can do that
because
every game exports one object saying what it is — its identity, how it presents,
what it needs from a club, and the handful of functions the shell may call on
its behalf. That object is an instance of a class extending `Manifest`
(`manifest.ts`), which is also the type the shell reads it as. A coop/compete
pair is a family class holding what the two modes share and a leaf per mode,
each leaf created once; a game that leaves out a member does not compile.

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
the shell has to branch on them without knowing which game it is holding —
and, for starting one, so a refusal that names a setup field can land under the
box that wrote it. `Manifest` itself implements the other two, since every
game's version is the same call against a different schema, and `makeLead`,
the one helper every club line uses.

The one thing this folder produces rather than describes is the **status
line**: the second line of a game's row on the club page, written by the
game's own `summaryFor` out of the game's `summary_data`, whose common part is
`summaryData.ts`. `summary.ts` holds the vocabulary those all speak, so no game
invents its own word for "in progress", and `npm run report:summaries` prints
what every game actually says.

## Details

- **`summaryFor` is pure and synchronous, and that is a constraint on the
  SERVER.** The club page draws a whole club's games from one query, so
  everything a summary needs has to be in the game's `summary_data` already —
  which is why every state-changing RPC rewrites the blob for it to read rather
  than leaving the frontend to go ask. A summary that needed a second query
  would turn one query into one per row.

- **A summary may only say what every player already sees.**
  `common.games.summary_data` is club-readable, so a compete game's private
  progress must never be written there. Several compete labels are a bare
  `Playing` for exactly that reason, and it is a rule about the status builder,
  not about the label.

- **`TimerMode` lives here without a member needing it.** Every setup form and
  `useGameTimer` speak it, and the manifest is where a game's contract with the
  shell is read, so this is where a reader goes looking.

- **The registry's ORDER reaches no player.** The two lists that walk the
  registry — the club page's start list and the Edit-club enrollment list —
  each sort by brand, coop first, explicitly.

- **A gametype string can miss the registry, and a miss means three
  things.** From the URL it is a typo and earns the error page; from another
  manifest it is impossible and faults; from a `common.games` row it means
  this bundle is behind the server, because removing a game deletes its rows.
  `manifestFor` says so where it sits, and `unknownGametype.ts` is the third
  answer: one fault per load, telling the player to reload.

- **`manifest` and `game-page` import each other.** This direction is type-only
  — a manifest names `PlayAreaLoaderProps` to type its `PlayArea` — so the cycle is
  erased at runtime, and the import says so where it sits.
