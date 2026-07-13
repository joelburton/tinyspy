# Plan: an opt-in turn-by-turn mode for free-for-all coop games

> **Status: proposal / implementation plan** (not current-state docs). Coop games are
> free-for-all today; nothing below is built yet. Once this ships, the durable parts move
> into [common.md](common.md), each game's doc, and [code-conventions.md](code-conventions.md),
> and this file is retired (per the "docs = current state, not plans" convention).

## The problem

Several coop games are **free-for-all**: every player can act at any time. For find-many-words
games (spellingbee, boggle, …) that parallelism *is* the game. But for **discrete-move** coop
games it causes accidental collisions — two players type near-identical wordle guesses without
realising someone else is mid-guess, and the shared budget burns twice for one idea.

**The feature:** a per-game **setup toggle** that makes a coop game **turn-by-turn**. Same rules,
same shared board/budget — the only change is that guesses/moves rotate through the players in
order instead of firing whenever. A second setup option picks **who goes first**; the rest of the
order is randomised (that's fine).

**Target games (6), all discrete-move coop:** psychicnum, wordle, connections, waffle, wordiply,
scrabble-coop. More games may adopt it later, so the mechanism should be **common**, not per-game.
psychicnum earns a special role here: it's the deliberately-minimal **reference v3 toy whose whole
job is exercising the multi-game architecture**, so it's the natural pilot — proving the common
primitive on psychicnum first is exactly what that game exists for.

## Why this is tractable (what already exists)

The load-bearing pieces are already in the codebase — this is assembly, not invention:

1. **A proven turn model** — scrabble *compete* already does server-authoritative turn-gating:
   `scrabble.games.current_seat` + a mode-agnostic `_advance_turn` helper (skip-conceded, wraps,
   never deadlocks; `supabase/migrations/20260627000000_scrabble.sql:440`) + a one-line gate in
   its move RPC (`if p_seat is distinct from g.current_seat then reject`).
2. **Every coop move RPC already locks the game row.** psychicnum `submit_guess`, wordle
   `submit_guess`, connections `submit_guess`, waffle `submit_swap`, wordiply `submit_guess`,
   scrabble `_commit_word` each do `select … from <game>.games where id = … for update` — the exact
   serialization point a turn gate belongs in. All six moves are **discrete** (one call = one
   turn-worthy action).
3. **The common realtime channel already delivers common game-state.** `useCommonGame` subscribes
   to `common.games` **and** `common.game_players` postgres-changes for the game
   (`src/common/hooks/game/useCommonGame.ts:290–316`). A turn pointer on `common.games` reaches
   every peer through that existing subscription — **no new channel, no per-game touch, publication
   unchanged.**
4. **A "pick a player at setup" precedent.** codenamesduet's SetupForm already renders a
   member radio (`members.map(m => ({value: m.user_id, label: m.username}))`), auto-seeded to the
   first member, stored as `setup.firstClueGiverUserId`
   (`src/codenamesduet/components/SetupForm.tsx:71–82`). "Who goes first" is this pattern.
5. **A "waiting for X" UI precedent.** scrabble *compete* already renders "Your turn" / "Turn: ●
   name" in the reserved `.infoState` slot (`src/scrabble/components/InfoCol.tsx:140–158`), and
   codenamesduet has `PeerWaiting` (`<ActorTag>`-based). No new UI primitives needed.

A happy consequence of going **common**: the six games have inconsistent per-player storage —
wordiply has **no players table** at all (only a `guesses` table), while psychicnum/wordle/etc.
key theirs on `(game_id, user_id)` and scrabble keys on `(game_id, seat)`. Under a common design
none of that matters: turn order lives on `common.game_players`, which every game already has, so
even wordiply needs no new table.

## Design

### Data model (common-owned)

Two nullable additions; **null = free-for-all** (the current behaviour, so nothing changes for
games/that don't opt in):

- `common.games.current_turn_user_id uuid null references common.profiles(user_id)` — whose turn it
  is right now. Null ⇒ not a turn game. Directly comparable to `auth.uid()` server-side and to the
  session user client-side.
- `common.game_players.turn_seat int null` — the player's position in the rotation (0-based).
  Assigned at create-time when turn-order is on; null otherwise. (`joined_at` can't serve as the
  order — every row shares the transaction's `now()`, so it's not deterministic.)

**Two reserved setup keys** (a documented common convention, so future games inherit it):

- `setup.turn_order: boolean` — the opt-in toggle. Savable as a club default.
- `setup.firstTurnUserId: string (uuid)` — who goes first. A member id, so like codenamesduet's
  `firstClueGiverUserId` it is **stripped from `saved_default`** (a specific person isn't a
  reusable club preference).

### Server: three common helpers + a one-line-per-game wiring

New in the common migration:

- `common._assign_turn_order(game_id uuid, first_user_id uuid)` — sets `turn_seat` for the game's
  players (seat 0 = `first_user_id`, the rest shuffled), and sets
  `games.current_turn_user_id = first_user_id`.
- `common._advance_turn(game_id uuid)` — walk `game_players` by `turn_seat`, skip conceded, wrap,
  set `current_turn_user_id` to the next player. (A direct port of scrabble's `_advance_turn` onto
  the common tables. In coop, skip-conceded is nearly a no-op — concede is compete-only — but it's
  harmless and future-proof.)
- `common._require_turn(game_id uuid, caller uuid)` — raise `P0001 'not your turn'` when
  `current_turn_user_id is not null and caller <> current_turn_user_id`. No-op for free-for-all
  games (pointer null) and for solo (you're always the current turn).

Each of the six games then changes in exactly **two spots**, mirroring what scrabble compete
already does:

- **create_game** — after `new_id := common.create_game(...)`, if `setup.turn_order` is true:
  validate `firstTurnUserId ∈ players`, then `perform common._assign_turn_order(new_id, first)`.
- **the move RPC** — right after the existing `FOR UPDATE` lock + `require_game_player`:
  `perform common._require_turn(target_game, caller_id)`; and **only after an ACCEPTED,
  non-terminal move**, `perform common._advance_turn(target_game)`. The "accepted" qualifier is
  load-bearing: psychicnum, wordle, and wordiply have **soft-reject** paths (not-a-word, duplicate,
  out-of-word) that don't consume the budget — those must **not** advance the turn (the same player
  retries), so the advance call goes on the success branch only, past the soft-reject early-returns.

> **Design choice — where opt-in is triggered.** I recommend the per-game one-line call above
> (keeps `common.create_game`'s documented "persist what we're handed" contract intact; opt-in is
> explicit per game). The alternative is to let `common.create_game` itself read the two reserved
> setup keys and self-assign — zero per-game create_game boilerplate, at the cost of
> `create_game` no longer treating `setup` as opaque. Either keeps the *logic* in common; the
> difference is whether the *trigger* is one line per game or centralised. Flagging for Joel.

### Frontend

- **Setup control (shared).** A new common `TurnOrderField` (checkbox + first-player radio, built
  on the existing `RadioRow`) that all six SetupForms drop in. It writes `turn_order` +
  `firstTurnUserId`. **Scoping wrinkle:** per-game SetupForms currently receive `members` = *all*
  club members, but the actual roster is the checked subset chosen in `SetupGameDialog`
  (`selectedIds`, `src/common/components/setup/SetupGameDialog.tsx:113–182`). The first-player
  picker must list only **selected** players, so `SetupGameDialog` should pass the selected subset
  down (a small `players: Member[]` addition to `SetupBodyProps`), and `TurnOrderField` re-seeds
  `firstTurnUserId` if the chosen player is deselected. Hidden/disabled for solo (1 player).
- **Reading whose-turn.** `useCommonGame` already exposes common game-state and refetches on
  `common.games` changes, so `current_turn_user_id` rides along for free. Derive
  `isMyTurn = current_turn_user_id === null || current_turn_user_id === session.user.id` once
  (ideally in `useCommonGame` or a tiny shared selector) and thread it into each game's **existing**
  single gate variable:

  | game | existing gate | file:line | change |
  |---|---|---|---|
  | psychicnum | `canGuess` | `psychicnum/components/BoardCol.tsx:57,176` | `&& isMyTurn` |
  | wordle | `canGuess` | `wordle/components/BoardCol.tsx:126` | `&& isMyTurn` |
  | connections | `canSubmit` | `connections/components/BoardCol.tsx:159` | `&& isMyTurn` |
  | waffle | `readOnly` (prop) | `waffle/components/BoardCol.tsx:37,66` | PlayArea folds in `!isMyTurn` |
  | wordiply | `entryDisabled` (prop) | `wordiply/components/BoardCol.tsx:50` | PlayArea folds in `!isMyTurn` |
  | scrabble-coop | `canCommit` | `scrabble/components/BoardCol.tsx:242` | already `canPlace && myTurn`; feed coop `myTurn` from the common pointer |

- **Waiting indicator (shared).** A small common `TurnStatusLine` (`<Dot>` + `<ActorTag>` →
  "Your turn" / "Waiting for ● Name…") rendered in each InfoCol's **already-reserved** `.infoState`
  slot — so **no reflow** (the slot reserves height today). scrabble compete's
  `InfoCol.tsx:140–158` is the literal template; extract it so all six render identically.

### Realtime

Nothing new. `_assign_turn_order` / `_advance_turn` UPDATE `common.games`, which every peer's
`useCommonGame` channel already listens to → `load()` refetches → the turn flips for everyone.
`common.games` is already in the `supabase_realtime` publication, so the
[publication invariant](../src) is not touched.

## Edge cases & decisions

- **Solo coop (1 player).** Turn-order is a no-op: `current_turn_user_id` = you, `_require_turn`
  always passes. Hide the toggle when the selected roster is 1.
- **The current player disconnects.** No deadlock — a missing player already **pauses the game for
  everyone** (pause-on-disconnect). Their turn simply freezes until they're back, which is exactly
  the Zoom-call behaviour we want. No skip needed; **deliberately** no "kick the AFK player's turn"
  mechanism (out of scope; End the game or wait).
- **Concede.** Coop has no per-player concede (End is a group stop), so `_advance_turn`'s
  skip-conceded is effectively inert here — kept only for uniformity with the scrabble port.
- **First-player re-seed.** If the setup roster changes so the chosen `firstTurnUserId` is no longer
  playing, re-seed to the first selected player (mirrors codenamesduet's mount seed).
- **scrabble is the reconciliation case.** scrabble compete already has its **own** turn system
  (`scrabble.games.current_seat` + `scrabble.players.seat`). scrabble-coop turn-order would use the
  **common** pointer instead, so scrabble would carry two turn mechanisms (compete: its own; coop:
  common). That's workable and scrabble is sequenced last for this reason; unifying compete onto the
  common primitive later is possible but out of scope. Coop's shared-rack commit path already
  exists — turns just gate it; players alternate playing from the one shared rack.
- **Optimistic concurrency (scrabble).** `_commit_word` uses `base_version`; the turn gate sits
  after the lock and before validation, so a stale/out-of-turn play is rejected cleanly.

## Testing

- **pgTAP (common):** a new suite for `_assign_turn_order` / `_advance_turn` / `_require_turn`
  (assignment seats the chosen first player; advance wraps; require rejects the wrong caller;
  free-for-all pointer null ⇒ everyone passes; solo ⇒ always passes).
- **pgTAP (per game):** one `turn_order_test.sql` each — out-of-turn `submit_*` rejected; a valid
  move advances the pointer; solo no-ops; free-for-all (toggle off) unchanged. Reuse each game's
  existing setup fixtures.
- **Vitest:** `TurnOrderField` (renders selected players, re-seeds on deselect); the `isMyTurn`
  gate flips each game's input disabled state; `TurnStatusLine` render. Extend each
  `PlayArea.test.tsx` smoke test with a turn-order mount.
- **e2e (optional, high-value for psychicnum or wordle):** two browser contexts, turn-order on —
  player B's input is inert on A's turn, flips after A guesses.

## Docs

- This file while building; then fold the durable design into **common.md** (the turn primitive +
  the two reserved setup keys as a convention), each of the six **game docs** (the per-game gate +
  test), and **code-conventions.md** (the `turn_order` / `firstTurnUserId` setup-key convention +
  the `saved_default` strip rule).

## Phasing & effort

- **Phase 1 — common primitive + psychicnum pilot.** Columns, the three helpers, common pgTAP, the
  shared `TurnOrderField` + `TurnStatusLine`, the `SetupBodyProps` selected-roster plumbing, and
  psychicnum end-to-end. psychicnum is the right pilot: it's the minimal reference game built to
  exercise exactly this kind of new architecture, so the common primitive gets proven on the
  smallest possible game-logic surface before any real game. This is the bulk of the *design* work;
  ~2–3 focused days.
- **Phase 2 — wordle, connections, waffle, wordiply.** Each is now a repeat: two SQL lines, one
  setup field, one gate, one status line, one pgTAP file. ~0.5–1 day each. (wordle is nearly
  identical to psychicnum — both are `canGuess` + `submit_guess` with soft-rejects — so it's the
  cheapest follow-on.)
- **Phase 3 — scrabble-coop.** Same wiring plus the two-turn-systems reconciliation and a pass over
  the shared-rack/turn interaction. ~1–1.5 days.

**Total ≈ 6–8 focused days** for all six, front-loaded into Phase 1. The per-game marginal cost is
small precisely because the primitive, the realtime delivery, the setup-picker pattern, and the
waiting-UI template all already exist.

## Open decisions for Joel

1. **Opt-in trigger:** per-game one-line call in each `create_game` (recommended, preserves
   `common.create_game` opacity) vs. `common.create_game` reads the reserved setup keys itself
   (zero per-game boilerplate, less opaque).
2. **Turn-order + timer interaction:** if a game has a per-move/total timer on, does a turn timeout
   auto-pass to the next player, or is timer simply orthogonal (recommended for v1: orthogonal — the
   existing timeout logic is unchanged; turn-order just gates who may act)?
3. **Scrabble unification:** leave scrabble compete on its own seat system (recommended) or plan a
   later migration onto the common primitive?
