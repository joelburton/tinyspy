# Turn bell — a sound when the turn becomes yours

**BUILT on branch `turn-bell`, steps 1–9 (2026-09-23), uncommitted; not
deployed.** Left: an e2e run on Joel's word, and the deploy (step 10).
codenamesduet's clue-arrival ring waits for its own area (`sounds/todo.md`).

Two things the build changed from the design below, both recorded where they
apply: a game passes `false` to the bell for a finished game rather than the
hook taking a terminal flag, and the turn edge takes `null` for "not known
yet" — scrabble's rows load after its surface mounts, and without it a page
opening on your turn rang as its data landed.

The five questions were answered by Joel, 2026-09-23 (end of file). In a game where the turn passes from player to player, ring a
bell the moment it becomes yours — the same instant the yellow "your turn"
frame flashes, in the games that have it. A profile setting, **"Enable
sounds"**, turns off every sound the app plays, the bell and the win jingle
alike; it is ON by default, including for every account already on
production.

Planned as shared machinery from the start (Joel: *"plan it as if we'll use
it with many games"*), with psychicnum as the game it is proven in.

## What exists today

- **The moment is already detected, in one hook.**
  `common/board-marks/useTurnStartFlash(myTurn)` returns true for a beat on the
  false → true edge of "it is my turn", never on mount (opening a game that is
  already your turn is not the turn arriving). Four games call it for the
  yellow frame: psychicnum, wordle, connections, waffle.
- **"Is it my turn" has one common source, and two private ones.**
  `useCommonGame` derives `isMyTurn` from `common.games.current_turn_user_id`
  and hands it down as `ctx.isMyTurn`: null pointer means free-for-all, so it is
  permanently true and never has an edge. **The turn is not each game's own
  state**: nine games move that one column through one server function,
  `common._advance_turn`, called on each accepted move — psychicnum, wordle,
  connections, waffle, wordiply, strands, letterboxed, setgame's turn mode and
  scrabble coop. The shell already subscribes to the row, which is why a
  game's flash reads `ctx.isMyTurn` rather than working anything out. **Two
  are private:** scrabble compete keeps its own seat (`game.currentUserId`),
  and codenamesduet's "your turn" is an EVENT rather than a pointer — being
  given a clue (Joel) — so neither reaches `ctx.isMyTurn`.
- **One sound plays in the app today**: `CelebrationBlockingModal` does
  `new Audio('/audio/tada.mp3')` inline, best-effort, every failure swallowed
  (autoplay refusals, and jsdom, which implements no media). The file is in
  `public/audio/`.
- **The profile is read once, into a store.** `useSession` selects
  `username, color, can_edit_words` from `common.profiles` and fills
  `session/useProfile`'s module-level store, which any component reads with
  `useProfile()`. The only write is `common.update_profile_color`, called from
  `account/EditProfileModal` — there is no UPDATE policy or grant on
  `profiles`. `fields/CheckboxField` exists for the modal's new row.

## The design

### 1. The preference — a column, a default, no backfill statement

A new forward migration adds

```sql
alter table common.profiles
  add column sounds_enabled boolean not null default true;
```

`add column … not null default <constant>` fills every existing row with the
default as it adds the column (and since Postgres 11 without rewriting the
table), so **every account on prod starts with sounds ON** with no separate
UPDATE. New accounts get the same default from `claim_username`'s insert,
which names its columns and not this one.

**`sounds_enabled`, not `turn_bell`**: it governs every sound (Joel), so the
name says so, and a sound added later is covered without a second column.

### 2. The write — one RPC for the profile dialog

The dialog saves color and bell together, so the write should be one call. Two
shapes:

- **`common.update_profile(new_color text, new_sounds_enabled boolean)`**, retiring
  `update_profile_color` (a `drop function` in `supabase/sql/common.sql`, since
  that file is re-applied rather than diffed). One save, one answer, one
  refusal path. **Recommended.**
- Keep `update_profile_color` and add `update_profile_sounds(boolean)`: two
  calls on Save, and a dialog that has to decide what a half-saved profile
  means.

Either way it is security-definer and caller-scoped, like the color RPC, and
answers `ok` / `{ result: 'saved' }` — a boolean cannot be out of range, so it
adds no refusal of its own.

### 3. The read — the profile store carries it

`Profile` gains `sounds_enabled: boolean`, `useSession` selects it, and a
general `setProfileFields` replaces `setProfileColor` to tell the store after
a save. Every tab reads it through `useProfile()`, so
turning it off takes effect on the next turn without a reload. It is per
ACCOUNT, not per device — the same answer on a phone and a laptop.

### 4. The sound — a shared player, not another inline `new Audio`

A new `common/sounds/` folder:

- **`public/audio/bell.mp3`** — Joel's file (`~/Downloads/bell.mp3`, 246 KB),
  trimmed of any silence and re-encoded smaller before it ships (Joel: fine);
  `tada.mp3` is 132 KB.
- **`playSound(name)`** — the one place a sound is played: builds the
  `Audio`, sets its volume, calls `play()` and swallows every failure, exactly
  as the celebration does now. **It checks `sounds_enabled` itself**, reading
  the profile store directly (the store's snapshot, not the hook, so it works
  from an effect or a handler), so no caller can forget the setting and every
  future sound obeys it. The celebration's inline copy converts to it, which is
  also how the win jingle comes under the setting.
- **Preloading.** A first `play()` on a cold `Audio` can lag the flash by the
  download; `playSound` keeps one element per sound and loads it on first use
  of the hook, so the bell and the yellow frame land together.

### 5. The moment — one edge, two consumers

The rising edge `useTurnStartFlash` already computes is the right moment for
the bell too — Joel's "the same as when the yellow attention box flashes". So
the edge is factored out rather than detected twice:

- **`useTurnArrival(myTurn)`** — the edge itself: true exactly on a
  false → true change after mount. `useTurnStartFlash` becomes the flash's
  timer on top of it.
- **`useTurnBell(myTurn)`** — rings `playSound('bell')` on that edge;
  `playSound` decides whether sounds are on. Nothing to render.

**Where `useTurnBell` is called** (question 2, answered: not per game):

- **In the shell, once.** `GamePage` calls
  `useTurnBell(isMyTurn)` with the common turn pointer. Every game on
  `current_turn_user_id` rings with no game code at all — including wordiply,
  strands, letterboxed, scrabble coop and setgame's turn mode, which have no
  yellow frame — because the bell has no board to paint and so needs nothing
  from the game. The two games whose turn is private ring from their own code:
  **scrabble compete** calls `useTurnBell(myTurn)` with its own seat value, and
  **codenamesduet** rings when a clue arrives for you to guess from (Joel) —
  an event it already receives, so it calls `playSound('bell')` there rather
  than going through the edge hook. Neither can double-ring with the shell: a
  game on a private turn has a null common pointer, so the shell's `isMyTurn`
  is permanently true and never edges.
- *(Rejected: per game, beside the flash. Every new turn game would have to
  remember it, and the five turn games without the frame would each need
  adding.)*

What rings, and what doesn't, under the shell placement:

| case | bell? | why |
|---|---|---|
| the turn passes to me mid-game | yes | the edge |
| I open a game that is already my turn | no | never on mount |
| a free-for-all or solo game | no | the pointer is null, so no edge |
| a club member watching, not seated | no | the pointer never names them |
| my move just ended my turn | no | falling edge |
| the game ends | no | `GamePage` passes `isMyTurn && !gameOver`, so a finished game is a falling edge |
| a Restart that hands the first turn to me | yes | the turn did arrive — a fresh game |
| the tab is in the background | yes | the point of a sound; browsers allow it once the page has had a click |
| the game is paused | no | the play surface is unmounted and no turn moves |

**Autoplay.** Browsers refuse audio until the page has had a user gesture.
Anyone taking a turn has clicked, so the bell will play in practice; the one
gap is a player who opened the game and has touched nothing — the refusal is
swallowed and the yellow frame still says it.

### 6. The setting — one row in the profile dialog

A `<CheckboxField>` under the color swatches, labeled **"Enable sounds"**
with no help line (Joel). It starts from `profile.sounds_enabled`, and Save
sends both values in the one RPC.

## Getting it into psychicnum

psychicnum is the proving ground because it is the smallest turn game and
already has the yellow frame. With the call in the shell it needs **no
psychicnum code**: its turn-by-turn coop mode moves `current_turn_user_id`, so
the shell's call rings for it. What psychicnum contributes is the proof:

- **A GamePage-level test on a psychicnum game** — the case the feature is
  for: a two-player turn-order game rerendered with the pointer moving to me
  rings once, a rerender that keeps it rings nothing, and a profile with
  `sounds_enabled: false` rings nothing — with the audio element spied, so the
  setting check inside `playSound` is exercised too. Planted red both ways.
- **Its flash is the check that the two agree**: the same rerender that flips
  the yellow frame on is the one that rings, which is what "the same as the
  yellow box" means, pinned.
- **An e2e run of psychicnum's turn-order spec**, on Joel's word, with
  `HTMLMediaElement.prototype.play` stubbed in the page to count calls — a
  browser can't be asked what it heard.

## Steps

1. **Migration** `<ts>_profiles_sounds_enabled.sql`: the column. pgTAP: it
   exists, defaults true, a new claim gets true.
2. **SQL**: `common.update_profile` (and the drop of the color-only RPC), with
   its pgTAP; the next free PN codes from `raiseCodes.test.ts` if any refusal
   is new.
3. **Types + store**: regenerate `src/types/db.ts` (restore its `cs-na` stamp,
   which `gen types` strips); `Profile.sounds_enabled`, the select,
   `setProfileFields`.
4. **Sound**: `common/sounds/` with `playSound` (and its setting check),
   `bell.mp3` trimmed and re-encoded, the celebration converted — the win
   jingle now obeys the setting; tests that sounds-off plays nothing and a
   failed `play()` is swallowed.
5. **Edge + bell**: `useTurnArrival`, `useTurnStartFlash` rebuilt on it (its
   tests unchanged and green), `useTurnBell` with its own tests (never on
   mount, rising edge only, silent once terminal).
6. **The calls**: `GamePage`, once; scrabble compete's private-seat call.
   codenamesduet's clue-arrival ring waits for its own area, and is a line in
   its register until then.
7. **The dialog**: the checkbox row, the one RPC, `EditProfileModal.test`.
8. **psychicnum's proof**: the PlayArea cases above.
9. **Docs**: `account/doc.md` (the dialog edits two things now),
   `docs/common.md` (the column and the RPC), `board-marks/doc.md` (the turn
   arrival has a sound as well as a frame), a `sounds/doc.md`.
10. **Deploy**, by the migration playbook: `supabase migration list --linked`
    for the real cut, `db-backup` + `db-rehearse` against a prod dump to see
    every existing profile come out `sounds_enabled = true`, then `gmake
    deploy ENV=prod`.

## Answered (Joel, 2026-09-23)

1. **The setting governs ALL sounds**, the win jingle included — hence
   `sounds_enabled` and the check inside `playSound`.
2. **Not per game.** Asked whether each game manages "new turn" itself: for
   nine it does not — the turn is `common.games.current_turn_user_id`, moved by
   the shared `common._advance_turn`, and the shell already reads it — so the
   bell is one call in `GamePage`. Only scrabble compete and codenamesduet ring
   from their own code.
3. **codenamesduet rings when you are given a clue**, done at its own area.
4. **The label is "Enable sounds"**, with no help line.
5. **`bell.mp3` is trimmed / re-encoded** before it ships.
