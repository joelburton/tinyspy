# Common

Everything in the app that isn't a specific game: the layer every game sits
on. This is the map — the rules that hold across it, and how a game passes
through it from start to finish. The detail lives with each piece: the
frontend in `src/common/<folder>/doc.md` (organized in
[common-folders.md](common-folders.md)), the `common` database schema in
[common-schema.md](common-schema.md), and the dictionary every word game reads
in [word-list.md](word-list.md).

## What "common" means here

Common is **the layer beneath the games, never beside them.** `common/` may not
import from any game; a game may not import from another game; the one
legal direction is game → common. `src/gametypes.ts` is the exception, since
listing every game is its job. The same holds in the database: the `common`
schema never references a game's schema, and a game's tables reference
`common` (every game row belongs to a club), never the reverse. ESLint and the
guards enforce the frontend half.

The payoff is the **removability invariant**:

> Any game must be removable in three actions: delete its folder, delete its
> line from `src/gametypes.ts`, drop its schema.

If removing a game means editing anything in `common/` or in another game, the
boundary has leaked. `src/shared/` sits between the two: code a *family* of
games shares, which `common/` may not import either
([common-folders.md](common-folders.md)).

## The shell never names a game

The shell iterates a registry. Each game declares a **manifest**
([`common/manifest`](../src/common/manifest/doc.md)) — its identity, how it
presents, how many players it takes, its setup form, the RPCs the shell calls
for it, and `labelFor`, the club-list status line — and everything the shell
does for a game it does by reading that. Each game ships as its own lazily
loaded chunk, so a player downloads only the games they open.

**Solo play is a club of one.** Every game belongs to a club; each player gets
a solo club at sign-in, and "solo" is just a club with one member. There is no
separate solo code path. Whether a game can be started in a club is its
player-count range against the club's size.

## The sibling-manifest pattern

A game with a co-op and a compete mode is **two registered gametypes**
(`wordle_coop`, `wordle_compete`), each with its own manifest, start-list row,
saved setup defaults and URL — and **one of everything else**: one folder, one
schema, one `create_game` taking the mode, one doc. The mode is chosen by
picking the row, not by a radio in setup, which makes both modes visible and
lets each remember its own defaults. Removing the family removes both lines
together.

## Library-puzzle games: provenance, not dependency

A game drawn from a curated library (connections' archive, stackdown's
boards, crosswords) **copies everything it needs onto its own game row at
creation**, and keeps the library link as a soft reference (`on delete set
null`). The library says where a board came from; it is never something a
game in progress depends on, so puzzles can be retired or re-imported freely.

## A game's life, across the layers

Each step is one or two sentences here; the folder named has the rest.

- **Signing in.** A magic link or a code. On first sign-in the player claims a
  username and color, which creates their profile and their solo club in one RPC
  ([`common/auth`](../src/common/auth/doc.md),
  [`common/session`](../src/common/session/doc.md), [common-schema.md → Username
  claim flow](common-schema.md#username-claim-flow)).
- **The club.** The club page lists the games the club has and the gametypes
  it can start, and the club's chat and presence
  ([`common/club`](../src/common/club/doc.md)).
- **Starting a game.** The setup dialog collects the options
  ([`common/setup-form`](../src/common/setup-form/doc.md)); the game's own
  `create_game` validates them, calls `common.create_game` for the shared
  header row (the club, the players, the title, the clock), and adds its own
  detail rows. The new game becomes the club's current one, and every other
  player gets an **invitation toast** — nobody is pulled into a game
  ([`common/invitations`](../src/common/invitations/doc.md)).
- **The game page.** The shell resolves the gametype, loads the shared game
  row, and mounts the game's play surface inside the common chrome — header,
  menu, timer, pause, chat
  ([`common/game-page`](../src/common/game-page/doc.md),
  [playarea.md](playarea.md) for the play surface's shape).
- **Playing.** Every move is an RPC the server judges
  ([envelopes.md](envelopes.md) for how it answers), which writes the game's
  own rows and its event log, and updates the shared row's status line.
  Realtime brings the change to everyone
  ([`common/realtime`](../src/common/realtime/doc.md),
  [supabase.md](supabase.md)). The clock ticks while someone is playing; the
  game pauses when a player is missing; a game played in turns moves a shared
  turn pointer ([common-schema.md](common-schema.md)).
- **Ending.** A game ends by its own rules, by the clock running out, or by
  someone choosing to stop: **End** for everyone in co-op, **Concede** for
  one player in a race, who may be left done while the others play on. The
  record is shown in-page; a win alone celebrates
  ([`common/terminal`](../src/common/terminal/doc.md),
  [common-schema.md → Concede](common-schema.md#concede--per-player-drop-out),
  [win-lose.md](win-lose.md)).
- **After.** A player may look at the answer — personally, and only once the
  game is over for everyone ([`common/reveal`](../src/common/reveal/doc.md)) —
  restart the same board, or start a new one. Leaving a live game shelves it,
  and the club can resume it later
  ([states.md](states.md)).

## Where to read next

| for | read |
|---|---|
| where a new file goes, and every `common/` folder's job | [common-folders.md](common-folders.md) |
| the `common` tables, RPCs, contracts every game mirrors, RLS | [common-schema.md](common-schema.md) |
| the dictionary, the filter rule every word game follows, curation | [word-list.md](word-list.md) |
| the UI's principles | [ui.md](ui.md) |
| how the app talks to Supabase | [supabase.md](supabase.md), [envelopes.md](envelopes.md) |
| view state and play state | [states.md](states.md) |
