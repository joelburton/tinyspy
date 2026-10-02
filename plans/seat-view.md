# The seat's view — `gd.me` is my player, and a player holds every fact about a seat

**Status: DECIDED 2026-10-01, nothing built.** Joel and Claude settled this in
one conversation at the end of connections' BoardCol pass; this file is the
record. It pauses the per-game component passes (connections' InfoCol and
Board) until the three converted games — psychicnum, wordle, connections —
carry the shape below; those passes then resume on it.

It supersedes the spectating plan, deleted with step 1: there is no
spectating.

## The decisions

### 1. No spectating

You must be seated in a game to open it. A club member who opens a game they
are not in is sent to the club page with a toast ("You're not in this game").
RLS stays as it is — a member reading rows for a page they cannot open does no
harm — so this is one gate in the game page, not a schema change.

`create_game` requires the caller among `p_player_user_ids`: nobody starts a
game they are not in. (The "Ada facilitates a game between Bea and Cade" case
in the SQL docs goes.)

Why: every nullable `me`, every `?.` on my seat, every `SPECTATING:` tag and
the unanswerable "which board does a watcher see in compete" came from a
feature nobody has used. If it is ever wanted, it comes back with its own
design.

### 2. `auth`, not `authSession`

The loader prop is `auth: Session` (Supabase's type, unchanged), read as
`auth.user.id`: the signed-in user. Not `sess` (a third abbreviation beside
`cg`/`gd`, and there is a `common/session` folder), not `auth.id` (a wrapper
type for one field, and `user` is the word that says this is the login
identity and not a player). It lives on `PlayAreaLoaderProps` and
`useCommonGame`'s options, not on `cg`: the viewer is the page's business.

### 3. `gd.me` IS my player

`gd.me` is `gd.playersById[auth.user.id]`, the same object, never null (no
spectating). `cg.me` is the same with the common `GamePlayer`. Gone: the
`standing` group, `isPlayer`, the `myId` parameters on hooks and InfoCol, and
`solvedByMe`.

### 4. One home: every seat fact is on the player type

The test, in two questions:

- **Is it intrinsically about the table?** Whose turn it is, how the game
  ended, what the puzzle is, whether the board is shared. On `gd`:
  `gd.turns.turnHolder`, `gd.gameEnding`, `gd.puzzle`, `gd.isSharedBoard`.
  Putting "moth's id" on every player would be nonsense; that is the tell.
- **Would a component ask it of a player?** On the player, whether or not the
  value happens to be the same for everyone. A component asks a PLAYER for
  anything about a player and never knows which facts are table-wide; that
  knowledge is the hook's (and the DB's), which is the meta-goal.

So the player type carries, computed for every seat (cheap: at most six
players, one comparison each):

| on each player | what it is |
|---|---|
| the server's facts | `playerEnding`, `outcome`, `finalRanking`, `solvedAt`, the counts |
| read off them | `isConceded`, `isPlayerEnded`, `isEliminated`, `hasSolved` (= `solvedAt !== null`; a coop solve stamps every teammate, so it is right in both modes) |
| the turn | `isStillPlaying`, `isOnTurn` (was `isMyTurn`), `isWaitingForTurn`, `isBoardInteractive` — derived by the hook from `gd.turns`, so no component writes `turnHolder.user_id === me.user_id` itself |
| the former `readout` | `maxMistakes` / `maxGuesses`, `requiredCategoriesCount` / `requiredSecretsCount` (the same for every player; the field comment says so), `mistakeCount` / `guessesUsed`, `foundCount` (own in compete; the team's on every player in coop, as the SQL already writes `mistake_count`) |
| the board | `board`: the seat's view — connections' `matchedCategories` + `remainingTiles`, wordle's rows, psychicnum's `tileResults` + `decidedBy`. In coop the hook builds one and gives every player the same reference, which is what `isSharedBoard` means |
| the picks (connections) | `picks`: mine held by the hook, a teammate's by Broadcast in coop, an opponent's null in compete |

**Move, don't copy.** When a fact goes onto the player there is no `gd.x`
beside it, or the component is back to choosing. `readout` dissolves; it is
not mirrored.

`gd` is OUTPUT — the hook rebuilds it on every reload and nothing else writes
it — so the same number on six players is a view of one row, not two truths.

### 5. A player's id is `id`; `gd` and `cg` are frozen

`gd.me.user_id` says "user" about a player. A player's id is `id`: `gd.me.id`,
`p.id`, `playersById[p.id]`. This renames the common `Member.user_id` field,
which chat, club and presence read too, so it is cross-cutting and lands as
its own commit inside step 3; the database column stays `user_id`.

`gd` and `cg` are **read-only, fully frozen**: the hook builds them and nothing
else writes them, ever. A surface that wants a different value rebuilds its
own; a hook that wants to add one adds it in `makeGameData`. Their types are
`Readonly` where TypeScript lets that be said cheaply.

### 6. What null means on another player

Null on another player's field means **the server withheld it** (compete RLS
mid-game: an opponent's `board` and `picks`), never "didn't compute". At the
end the rows arrive and the fields fill in.

A seat fact that is expensive and that only I read today still goes on the
player type, null for the others, with a comment saying "computed for me
only": promoting it later fills in a value and moves no reader. (`gd.my…` for
a viewer-only value has no present example; that rule is not written until one
appears.)

## What this touches

- **Writing first (done 2026-10-02).** CLAUDE.md → Audience ("Spectators are
  friends too" goes; you must be seated to open a game), the plans table (this
  file in, the spectating plan deleted), README, docs/common-schema.md
  (seated-only; `create_game` requires the caller seated), docs/win-lose.md →
  Where a player stands (the terms are per player; `isOnTurn`; `isPlayer`
  gone), docs/code-conventions.md → Names about the viewing player (`auth`,
  `gd.me`, frozen `gd`/`cg`), docs/playarea.md's vocabulary line.
- **The gate.** `GamePageGate` / `GamePageLoader`: not seated → the club page
  with a toast. Every `create_game` gains the seated-caller check and a pgTAP
  case; the e2e fixtures that seat a game without its creator follow.
- **Common.** `whereIStand` becomes a per-player computation
  (`standingOf(player, …)` or folded into the players' construction in
  `useCommonGame`); `Standing` goes; `cg.me`; `PlayAreaLoaderProps.auth`; the
  test fixture; `useStandardGameActions`' options; `solvedByMe` deleted.
- **Each converted game** (psychicnum, wordle, connections): `useGame` builds
  the player type with the fields above and `me`; PlayArea, BoardCol, InfoCol,
  Board and the hooks read `gd.me.…` and `p.…`; `readout`, `standing`,
  `boardEvents` / `boardRows` / `matchedCategories` / `remainingTiles` /
  `picks` move under `board` and `picks` on the player; every `SPECTATING:`
  branch and tag goes (sixteen files today); tests follow.
- **Then** connections' InfoCol and Board passes resume on the new shape, and
  the next game converts straight onto it.

## Owed when the problem children open

crosswords (one shared grid, per-cell authors), scrabble (one board, private
racks, a shared bag) and bananagrams (per-player boards, a shared bag) may not
fit "a seat's view" cleanly. Decide the exception, if any, when each area
opens, with the simple games already on the shape.
