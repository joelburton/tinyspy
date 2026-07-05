# Code review — 2026-07-04 (post-reorg / post-decomposition)

> **Status: findings report, not yet worked.** Nothing was edited — this is a
> point-in-time snapshot. Line numbers drift; re-confirm a finding before acting
> on it. When an item gets picked up, annotate it inline (the
> [2026-07-01 review](code-review-2026-07-01.md) convention) or move it to
> [`deferred.md`](deferred.md).

A whole-repo review taken right after the big `common/` flat→feature reorg
(`794f7df`), the PlayArea → BoardCol/InfoCol decomposition across all ten games,
the per-player concede feature (2026-07-02), and the docs audit passes
(`c2710bc`, `ed54b2c`). Requested dimensions: **correctness**, **dead CSS**,
**documentation accuracy** (markdown + code comments), **reuse opportunities**,
and **cross-game naming consistency**.

**Method.** Seven parallel reviewers (correctness × 3 — common/, five games
each; dead CSS; docs; reuse; naming), each instructed to read
[`code-review-2026-07-01.md`](code-review-2026-07-01.md) and
[`deferred.md`](deferred.md) first — **everything already tracked there is
excluded from this report**. Every claim carries a `file:line`; the two
highest-impact findings (§1.1-C1, §1.3-L1) were re-verified by hand, and several
subagent claims that failed cross-verification were dropped (see
[Verification notes](#verification-notes)).

## Headline

The reorg and decomposition **held up remarkably well where they were aimed**:
the dead-CSS sweep across all 96 modules found exactly *one* new deletable block;
the shared-layer taxonomy in `common-layout.md` matches the real tree exactly;
all import paths, `vi.mock` paths, and asset imports resolve. The convergence
machinery (shared hooks, two-column shell, feedback unification) is genuinely
shared and mostly consistently named.

The findings cluster in three places instead:

1. **The concede feature's integration seams.** Concede itself works, but the
   things *around* it weren't updated: presence-pause still counts conceded
   players (wedging every compete game the moment a conceder closes the tab —
   the single most impactful bug in this report), seven move RPCs still accept
   moves from conceded players, and two games' finishers can crown or
   celebrate players who quit.
2. **Terminal paths that end the game without waking the FE.** The
   "realtime touch" convention exists and is documented, but four
   timeout/concede/end paths across three games are missing it, so reveals
   (secrets, solutions, opponents' words) silently don't appear.
3. **Comments and docs the codemod couldn't see.** The reorg rewrote imports
   perfectly but left 53 stale flat-path references in comment prose, and a few
   docs still describe deleted hooks and the two-game era. One genuine guard
   drifted: `eslint.config.js`'s game-independence list is missing five games.

The reuse and naming sections are the "similar but not sharing" cleanup you
asked for: nine ranked extraction targets (the below-board pill builders and
manifest RPC boilerplate are the big two) and thirteen naming unifications
(turn-log component names, the Board layer, the `winner` status key).

---

## §1 Correctness

### §1.1 Concede integration seams

The per-player concede feature (shipped 2026-07-02) is correct in its core
(`common.game_players.conceded`, `common.concede`, the per-game wrappers), but
several systems that predate it were never taught about it.

**C1. [high] Presence-pause counts conceded players — a conceder who leaves
wedges the race for everyone else.** — **✅ DONE.** `useCommonGame` now passes
`players.filter((p) => !p.conceded)` to `computePause` (invited-but-not-yet-
joined players still count). The test fixture gained a distinct conceded peer
(`cara`) so the "peer missing → paused" test uses a live peer (`bea`) and a new
test pins "a missing conceder does not pause". 11 tests + `tsc -b` green.
`src/common/hooks/game/useCommonGame.ts:490` passes the **full** roster to
`computePause`; `src/common/lib/game/pause.ts:26–33` never looks at `conceded`.
The natural post-concede action — click Concede, close the tab — drops the
conceder's presence, `computePause` lists them in `missing`, and every remaining
racer gets a permanent "Waiting for &lt;quitter&gt;…" overlay (PlayArea unmounted, no
moves possible) until someone suspends or ends the game. This defeats the
documented contract (`docs/common.md`: a conceder drops out "while the others
keep racing") in **every compete game**, and in a 2-player race it fires
essentially every time. Note: `useCommonGame.test.ts:260–272` incidentally
*pins* the buggy behavior — the "peer missing → paused" test's missing peer is
the conceded fixture player. **Hand-verified.**
*Fix:* pass `players.filter((p) => !p.conceded)` to `computePause` in
`useCommonGame` (invited-but-not-yet-joined players must remain counted — that
part is deliberate); update the test fixture.

**C2. [medium] `boggle._finalize` lets a conceded player win.** — **✅ DONE.**
`_finalize` now computes `max_score` over non-conceded players only and forces
`won: false` for conceders (mirroring `scrabble._finish`); the leaderboard still
lists everyone (score shown, marked "Quit"). The FE `buildOver` gained a
self-conceded early return ("You conceded") and filters conceders out of its
`max`/winner computation. `tsc -b` + 48 boggle Vitest + `boggle/concede`
pgTAP green.
`supabase/migrations/20260628000000_boggle.sql:431–454` computes `max_score`
and per-player `won` over **all** players with no `conceded` exclusion. A player
can build the top score, concede, and on timeout/manual-end be recorded
`{won: true}`; `playerOutcome` ("won trumps everything",
`src/common/lib/games.ts:229`) then renders the quitter as the winner, and
`buildOver` (`src/boggle/components/PlayArea.tsx:344–369`) tells them "You win".
Contradicts `docs/common.md` ("a drop-out forfeits, even a tying score") —
which wordle and scrabble implement correctly.
*Fix:* mirror `scrabble._finish` — exclude conceded players from `max_score`
and force `won: false` for them (and ideally annotate them in
`status.leaderboard` so the FE max matches).

**C3. [medium] An all-conceded scrabble compete game ends `won_compete` and
displays "It's a tie — co-winners!"** — **✅ DONE.** `_finish` now ends `'lost'`
(not `'won_compete'`) when `v_max is null` (zero non-conceded players), matching
bananagrams' collective-loss pattern (`play_state 'lost'` + `outcome 'conceded'`).
The FE `buildOver` gained an `outcome === 'conceded'` branch ("Everyone
conceded — no winner", before the winner logic) and `labelFor` a `'lost'` case
("all conceded"). `tsc -b` + 39 scrabble Vitest + `scrabble/concede` pgTAP green.
`supabase/migrations/20260627000000_scrabble.sql:1048–1050` (last-player
concede → `_finish`) + `:545` (`_finish` unconditionally ends compete as
`won_compete`). With everyone conceded the winner query yields null and every
result is `{won: false}`, but `buildOver`
(`src/scrabble/components/PlayArea.tsx:269–273`) has no conceded branch: null
winner falls through to the co-winners tie, and `labelFor` shows "tie" on the
club card. The other common-concede games end this path as `lost` +
`outcome 'conceded'` and their FEs handle it.
*Fix:* in `_finish`, when no eligible player exists, end via
`common.end_game(…, 'lost', {outcome:'conceded', …})`; or minimally teach
`buildOver`/`labelFor` a conceded branch.

**C4. [medium] Seven move RPCs accept moves from conceded players — and in
three, a conceder can be recorded as the winner.** — **✅ DONE.** Added the
`peel`-style conceded guard (`raise 'you have conceded'`) to all seven inside
their existing lock, after the play_state check: `psychicnum.submit_guess`,
`connections.submit_guess`, `spellingbee.submit_word`, `waffle.submit_swap`,
`stackdown.submit_word`, `boggle.submit_word` (raises rather than a soft
`gameOver` return so `useWordSubmit` releases the optimistic word), and
`bananagrams.dump`. Migrations reapply clean; all seven touched games'
gameplay/dump/concede pgTAP green (after `npm run import` repopulates
`common.words` post-reset).
None of these checks `common.game_players.conceded`:
`psychicnum.submit_guess` (`20260615000002_psychicnum.sql:534`),
`connections.submit_guess` (`20260615000003_connections.sql:685`),
`spellingbee.submit_word` (`20260617000000_spellingbee.sql:797`),
`waffle.submit_swap` (`20260624000000_waffle.sql:628`),
`stackdown.submit_word` (`20260626000000_stackdown.sql:356`),
`boggle.submit_word` (`20260628000000_boggle.sql:330`),
`bananagrams.dump` (`20260623000000_bananagrams.sql:867`).
The FE gates on `myConceded`, so the trigger is a **race**, not cheating: a
submit in flight when the concede commits (or a stale second tab). A conceded
psychicnum/connections/spellingbee player can complete the win condition and be
recorded `won_compete`; a conceded stackdown player's 6th word crowns them
winner; a conceded bananagrams player can keep draining the shared pool via
`dump`. The codebase's own intended pattern exists in `bananagrams.peel`
(`raise 'you have conceded'`) — `peel` and `save_player_board` have the guard,
`dump` doesn't.
*Fix:* add the `peel`-style conceded check to all seven, inside the existing
lock.

**C5. [low] Concede vs. a concurrent final move can wedge a compete game in
`playing` (psychicnum, connections).** — **✅ DONE.** Both `concede` RPCs now
`perform 1 from <game>.games where id = target_game for update;` before
`_set_conceded`, so concede serializes against a concurrent `submit_guess`
(which already locks that row) instead of only locking `common.games`. Same
lock order as the move path (`<game>.games` → `common.games`), so no deadlock;
mirrors `scrabble.concede`. Migrations reapply clean; psychicnum + connections
concede/gameplay pgTAP green. (The wedge is a race, not single-session
testable; the lock is defensive.)
`common._set_conceded` locks `common.games`
(`20260615000000_common.sql:1275`) while the move RPCs lock the per-game
`<game>.games` row — they don't serialize. Each transaction's "anyone still
racing?" check reads the other's uncommitted state as still-alive (READ
COMMITTED), both decline to end the game, and it stays `playing` with nobody
able to move (recoverable via another concede / timeout / end_game). Traced for
`psychicnum.concede:766` vs `submit_guess:692` and `connections.concede:960` vs
`_maybe_finish_compete`; waffle/spellingbee share the lock split with narrower
windows.
*Fix:* have each game's `concede` RPC `select … for update` its own
`<game>.games` row first, so concede serializes against moves.

**C6. [low] An all-conceded spellingbee compete game lands in undeclared
`play_state='lost'` and the club label reads "no winner at Start".** — **✅ DONE**
(label fix). Taught compete `labelFor` an `outcome === 'conceded'` branch →
"all conceded", caught BEFORE the target-rank line so the missing
`status.target_rank` can't fall to `RANKS[0]`. The terminal MODAL was already
fine — `buildOver` reads `targetRankIdx` from setup, not status. Left
`common.concede`'s `play_state='lost'` as-is (delegating the terminal keeps the
wrapper thin; the label now handles it). `tsc -b` + 61 Vitest green.
`spellingbee.concede` delegates the last-player terminal to `common.concede`
(`20260615000000_common.sql:1353–1357`), which writes `play_state='lost'` —
not in spellingbee's declared set — with no `target_rank` in status. Compete
`labelFor` (`src/spellingbee/manifest.ts:241–258`) falls through to `RANKS[0]`:
"ended · no winner at Start".
*Fix:* write spellingbee's own terminal (play_state `'ended'`, status incl.
`target_rank` + `outcome:'conceded'`), or teach `labelFor` the case.

**C7. [low — verify intent] waffle compete: a player who already solved is
offered an enabled Concede, and conceding forfeits the win they've banked.** —
**✅ DONE** (Joel's call: gate it). The compete `ConcedeGameButton` is now
`disabled={myConceded || selfSolved}`, so a solved-and-waiting player can't
click Concede and silently forfeit a banked win — they wait it out via
Back-to-club. `tsc -b` + eslint + 31 waffle Vitest green.
`src/waffle/components/InfoCol.tsx:105–163` (button disabled only on
`myConceded`); `_maybe_finish_compete`'s winner query excludes conceded players
(`20260624000000_waffle.sql:584–590`), so a solved-and-waiting player who
clicks Concede ("I'm done waiting") silently loses a game they may have won.
Flagged rather than assumed — the "you can bow out either way" comment reads
possibly deliberate. Suggested if not: gate Concede on `!self.solved`.

### §1.2 Terminal paths that never wake the FE (missing realtime touch)

The "realtime touch" (a no-op self-update on the gametype table so per-game
subscriptions refetch after `common.end_game` writes only `common.games`) is an
established convention — but four paths are missing it. In each case the
symptom is the same: the game ends on other clients but the terminal *reveal*
never appears until a reconnect/remount refetch.

**R1. [medium] psychicnum: `submit_timeout` and a game-ending `concede`.** —
**✅ DONE.** Added the same `update psychicnum.games set club_handle = club_handle`
no-op touch (that `end_game` already has) to the tail of both paths, so the
secrets reveal loads on timeout / last-player-concede. gameplay + concede pgTAP
green.
`20260615000002_psychicnum.sql:945–1006` and `:751–789` — neither has the touch
that `psychicnum.end_game` explicitly adds (`:1085–1088`). On countdown expiry
`games_state.secrets` stays `null` on every client and `BoardCol` renders the
fallback `'Game over.'` pill instead of "The words were …"
(`src/psychicnum/components/BoardCol.tsx:217–231`).
*Fix:* add the same no-op self-set at the tail of both paths.

**R2. [medium] spellingbee compete: post-terminal reveal of opponents' finds
never loads on non-`submit_word` terminals.** — **✅ DONE.** The FE subscribes to
`found_words` alone, so the touch had to land there (not `games`): added
`update spellingbee.found_words set user_id = user_id where game_id = target_game`
to `submit_timeout`, `end_game`, and the terminal branch of `concede`, and
rewrote the two stale "no touch needed" comment blocks to explain the compete
RLS reveal. Harmless in coop (finds already live). gameplay + concede pgTAP
green.
`20260617000000_spellingbee.sql:1041` (`submit_timeout`), `:1172` (`end_game`),
`:1287` (`concede`) deliberately dropped the touch ("nothing to reveal — the
word lists ship from start"), but that reasoning misses the compete
`found_words` RLS reveal: peers' rows become SELECT-able only at terminal
(policy `:268–282`), and the FE refetches `foundWords` only on
`spellingbee.found_words` events (`src/spellingbee/hooks/useGame.ts:115–128`).
On timeout / manual end / all-concede, no event fires — every opponent find
renders as an unfound grey "missed" row with wrong attribution
(`src/spellingbee/components/PlayArea.tsx:351`). The `won_compete` path works
only because the winner's final INSERT lands post-commit when RLS is open.
*Fix:* restore a spellingbee-table touch on the three paths, or refetch
`foundWords` in the FE when `isTerminal` flips true.

**R3. [medium] waffle compete: a game-ending `concede` writes nothing to the
waffle schema.** — **✅ DONE.** Put the `update waffle.games set club_handle =
club_handle` touch inside `_maybe_finish_compete` right after its `end_game`
call (before `return true`), so it covers the concede path AND stays with the
end_game write. Harmless double-touch on the submit_swap path (which already
wakes via its `waffle.players`/`swaps` writes). gameplay + concede pgTAP green.
`20260624000000_waffle.sql:774–790`; when `_maybe_finish_compete` (`:557–613`)
terminates it calls only `common.end_game` — unlike `submit_timeout` (`:872`)
and `end_game` (`:951`), which both have the touch. `games_state.solution` and
opponents' `players_state.board/colors` stay `null` (InfoCol hides
`<SolutionReveal>`, `src/waffle/components/InfoCol.tsx:194–197`).
*Fix:* add the touch to `waffle.concede` (or inside `_maybe_finish_compete`
when it terminates).

### §1.3 Races and locks

**L1. [high] `scrabble.submit_timeout` takes no row lock — concurrent timeout
calls double-run final scoring.** — **✅ DONE.** Added
`perform 1 from scrabble.games where id = target_game for update;` at the top
(folding in the game-not-found check), mirroring `bananagrams.submit_timeout`
and the 5 other scrabble mutations. Migration reapplies clean; `end_game_test`
(the file covering `submit_timeout`) still green. (The double-run itself is a
concurrency race not expressible in single-session pgTAP; the lock is
defensive.)
`20260627000000_scrabble.sql:1077–1106`. On countdown expiry **every connected
client** races to call `submitTimeout` (`src/common/components/game/GamePage.tsx:175–196`
— by design). Every other scrabble mutation takes `select … for update` first
(`:709`, `:874`, `:967`, `:1037`, `:1134` — the loser of a race then sees the
terminal state and raises), but `submit_timeout` does a plain
`select play_state` with no lock. Two near-simultaneous calls both see
`playing` (MVCC) and both run `_finish` (`:450–548`), which is **not
idempotent**: in compete, `update … set score = score − Σ tile_value(rack)`
(`:487–490`) runs twice — the second UPDATE waits on the first's row locks,
re-evaluates against committed rows, and subtracts every player's leftover
value a **second** time; the second run then recomputes the winner from the
doubly-penalized scores (which can flip it) and overwrites
`status`/`player_results`. Coop double-subtracts `team_score` the same way
(`:469–474`). wordle/stackdown/bananagrams lock first; boggle's unlocked
`_finalize` is value-idempotent, so benign there. **Hand-verified** (the lock
is present at 5 call sites and absent here).
*Fix:* `perform 1 from scrabble.games where id = target_game for update;` at
the top, exactly like `bananagrams.submit_timeout`.

**L2. [medium] connections coop: two simultaneous submissions of the same
wrong/one-away tile set double-charge mistakes.** — **✅ DONE.** Added an
order-insensitive dedup (`gu.tiles @> submit_guess.tiles and <@`) at the top of
the wrong/oneAway branch, mode-scoped (coop = anyone's prior guess, compete =
caller's) — the analog of the correct branch's unique-index guard. The
games-row lock the RPC already holds serializes the race, so the SELECT sees a
concurrent duplicate's committed row. New pgTAP: a reordered repeat wrong guess
is a no-op (mistake_count stays 1). Migration reapplies clean; connections
pgTAP (gameplay/compete/rls) + 36 FE tests green.
`20260615000003_connections.sql:875–944` — the `correct` branch dedups via the
partial unique index, but the wrong/oneAway branch has no duplicate check;
dedup lives only in the FE against the *local* guess log
(`src/connections/components/BoardCol.tsx:159`). Coop selection is a shared
union, so "both players hit Submit on the same 4 tiles" is a realistic gesture:
the second transaction queues on the row lock, then inserts an identical row
and increments everyone's `mistake_count` again — one guess costs 2 of the 4
mistakes (possibly the losing one), plus a duplicate turn-log row.
*Fix:* in the wrong/oneAway branch, no-op when an existing row for the game has
the same order-insensitive tile set (mirroring the correct branch).

**L3. [medium] Refetch loads have no out-of-order guard — a slow stale
response can overwrite newer state.** — **✅ DONE.** Added a per-effect
monotonic generation token in the three row-replacement sites:
`useRealtimeRefetch` (its `mounted()` now returns false for a superseded load —
so ALL factory consumers, incl. every per-game `useGame`, are covered with zero
per-consumer change), `useCommonGame.load`, and `ClubPage.loadGames`. Each load
stamps a generation and skips its `setState` if a newer refetch has started —
"latest refetch wins," not "last to land." `useGameInvitations` needs no fix:
it's append-merge (`setPending(prev => [...prev, ...add])` with dedup), so a
stale load can't regress it (same reason `useClubChat` is safe). `tsc -b` +
eslint + 608 FE tests green.
`src/common/hooks/game/useCommonGame.ts:204–268` (`load`),
`src/common/hooks/realtime/useRealtimeRefetch.ts:139–176` (and consumers),
`src/common/components/club/ClubPage.tsx:419–460`,
`src/common/hooks/game/useGameInvitations.ts:60–102`. These deliberately fire
overlapping loads (immediate + on-SUBSCRIBED + one per event) and commit
whichever response *lands* last, not whichever *started* last: a slow initial
load resolving after a fast event-triggered load regresses
`play_state`/`is_terminal`/the board picture until the next realtime write.
The codebase already defeats this class elsewhere (`useClubChat.mergeSnapshot`
append-merge; `useGameTimer`'s `Math.max`) — the row-replacement loads have no
equivalent. Low probability per event, but it sits under all 10 games.
*Fix:* a per-effect monotonic generation token (`const gen = ++genRef.current`;
discard if `gen !== genRef.current` at resolution), added once in
`useRealtimeRefetch` + `useCommonGame.load`.

**L4. [low] Stable-name Realtime channels can be handed a mid-teardown
instance on fast remount; the comment claiming otherwise is wrong for the
shipped library.** — **➡️ DEFERRED** to [`deferred.md`](deferred.md) (Common /
architecture): library-deep, empirically not user-visible today; fix is a
teardown-await registry. The wrong self-echo comment is bundled there too.
`src/common/hooks/game/useCommonGame.ts:270–276` (`game:${gameId}`),
`src/common/hooks/realtime/useClubPresence.ts:52`,
`src/common/hooks/realtime/useClubSetupPresence.tsx:65`. Verified against
`@supabase/realtime-js` 2.108.1 in node_modules: `client.channel(topic)`
returns the *existing* instance while one is still registered
(RealtimeClient.js:343–355); `removeChannel` deregisters only after the async
unsubscribe resolves; and `subscribe()` silently no-ops (doesn't even register
the status callback) when the adapter isn't closed. A fast unmount→remount of
the same stable name (StrictMode double-mount; club↔game navigation inside the
unsubscribe RTT) can hand the new mount a dying channel whose `SUBSCRIBED`
never fires — no presence track, no `set_current_view`, no postgres-changes —
until the next reconnect. The comment at `useCommonGame.ts:273–275`
("removeChannel(ch) clears the per-client cache before the second effect run")
does not describe this library version. Filed low: empirically not
user-visible today (StrictMode dev + green cross-client e2e), but it's timing,
not guarantee. Related wrong-mechanism comment with no runtime effect:
`useCommonGame.ts:466–470` claims Realtime echoes broadcasts to the sender —
the default is `broadcast: { self: false }`; the code works because it applies
locally anyway.
*Fix direction:* await the prior `removeChannel` promise before re-creating a
same-name channel (small module-level teardown registry).

### §1.4 FE state bugs

**F1. [medium] `ClubPage.handleDelete` hangs forever if the courtesy broadcast
channel never reaches SUBSCRIBED.** — **✅ DONE.** The subscribe-wait now
resolves on any terminal status (SUBSCRIBED → send; CHANNEL_ERROR / TIMED_OUT /
CLOSED → give up) and races a 1s timeout, then ALWAYS proceeds to
`delete_game` (the send + the 150ms peer-beat run only when actually
subscribed). A wedged Realtime connection no longer blocks the delete.
`tsc -b` + eslint clean (Realtime-timing path, not unit-testable).
`src/common/components/club/ClubPage.tsx:276–292` — the delete awaits a promise
that resolves only on `SUBSCRIBED`; `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` never
resolve it, so `delete_game` is never called and the card sits at "Deleting…"
with the button disabled and no error. The likely trigger (Realtime wedged) is
exactly when friends want to delete a stuck game — and the RPC path would have
worked. The broadcast is explicitly "friendliness, not correctness" per its own
comment, yet its failure blocks the load-bearing step.
*Fix:* resolve on any terminal status (or `Promise.race` a short timeout) and
always proceed to the RPC.

**F2. [low] bananagrams: the board is not frozen at terminal — post-game
keystrokes/drags silently corrupt the displayed (and printed) final board.** —
**✅ DONE.** `usePlayerBoard` now computes `frozen = isConceded || isTerminal`
and feeds it into both `frozenRef` (the stable pointer/key handlers' bail check)
and `useBoardCursorKeys`' `enabled`. Previously PlayArea passed `isConceded =
conceded && !isTerminal`, so terminal *lifted* the freeze; now the board is
inert once the game's over, so the on-screen + printed final board can't
diverge from the stored one. `tsc -b` + eslint + 29 FE tests green.
`src/bananagrams/hooks/usePlayerBoard.ts:457` (`enabled: !isConceded`),
`:400–414` (pointer handlers gate only on conceded), compounded by
`src/bananagrams/components/PlayArea.tsx:210`
(`isConceded = conceded && !isTerminal` — even a conceder's freeze is *lifted*
at terminal). Every other game kills board input at terminal. After game over
— including with the `GameOverModal` open, since `useGlobalKeyHandler` passes
non-input keystrokes through — letters/Backspace/drags still mutate the local
board. `save_player_board` no-ops server-side at terminal
(`bananagrams.sql:515–517`), so the on-screen "final" board silently diverges
from the stored one, and "Print board (PDF)" snapshots the live `boardRef`
(`PlayArea.tsx:66,176–179`) — the paper record prints the corrupted board.
*Fix:* freeze on `isConceded || isTerminal` (feed both into `frozenRef` and
`useBoardCursorKeys`' `enabled`).

**F3. [low] `useProfile`: one failed first fetch is permanent for the
session.** — **✅ DONE** (primary fix). `ensureLoaded`'s error path now resets
`loadedFor = null`, so a later mount / navigation retries instead of no-opping
on the `loadedFor === userId` guard forever. (The compounding `setProfileColor`-
drops-color-while-null edge left as-is — the RPC already persisted it, so a
reload shows it.) `tsc -b` clean.
`src/common/hooks/session/useProfile.ts:46–63` — `ensureLoaded` sets
`loadedFor = userId` *before* fetching and the error path never resets it, so
every later call no-ops: UserMenu shows "…" forever until a full reload.
Compounding: `setProfileColor` (`:85–90`) silently drops a saved color while
`current === null`.
*Fix:* `loadedFor = null` on error so the next mount retries.

**F4. [low] `useDragGesture` never handles `pointercancel`.** — **✅ DONE.**
Added a `pointercancel` window listener that disarms the gesture and, if a
drag had started, clears drag/hover state + the body `dragClass` and calls
`onDragEnd` — no drop, no tap (the gesture never completed). New unit test
covers it (+ that a later stray pointerup no-ops). 5 useDragGesture tests green.
`src/common/hooks/ui/useDragGesture.ts:93–133` — only
`pointermove`/`pointerup`. A canceled pointer mid-drag (touch scroll takeover,
OS gesture) strands the armed gesture: ghost tile stays rendered, body
`dragClass` stays applied until an unrelated future pointerup.
*Fix:* add a `pointercancel` listener that clears the gesture/drag/hover state
and calls `onDragEnd` with no drop.

**F5. [low] Manual pause is a silent no-op for a non-player club member.** —
**✅ DONE.** Chose the "make it work" option: `manuallyPausedBy` now falls back
to a labeled pseudo-member (`{username: 'Someone'}`) when the pauser isn't in
`players`, so a spectating member's Pause actually pauses (overlay reads
"Someone paused") instead of being a dead control. Unknown color falls through
to body-text in `colorVarFor`. New test covers the non-player pause. 12
useCommonGame tests green.
`src/common/hooks/game/useCommonGame.ts:494–499` +
`src/common/components/game/GamePage.tsx:320`. Viewing is club-gated
(spectating members are a documented free affordance) and the header
`PauseButton` renders unconditionally — but a spectator's broadcast
`{userId}` misses `players.find(...)` on every client, so nothing pauses and
the clicker gets zero feedback. A silent dead control.
*Fix:* resolve the pauser with a fallback pseudo-member ("someone"), or
hide/disable Pause for non-players.

**F6. [low] psychicnum: the budget-exhausting guess shows "Incorrect" even
when it was correct.** — **➡️ DEFERRED** to [`deferred.md`](deferred.md)
(psychicnum): cosmetic/transient (the terminal pill replaces it in a beat).
`20260615000002_psychicnum.sql:692–719` returns `'lost'` for the final guess
hit-or-miss; `src/psychicnum/components/BoardCol.tsx:156–161` maps anything
but `'won'|'correct'` to the red "Incorrect" pill. A last guess that finds a
secret briefly shows "Incorrect" while the tile turns green (the terminal pill
then replaces it). Cosmetic/transient.
*Fix:* return a richer value (`'lost_correct'`) or branch on the local board
check.

### §1.5 Tooling guard drift

**G1. [medium] `eslint.config.js` `GAMETYPES` is missing five games — the
game-independence lint has silently not guarded half the roster.** — **✅ DONE**
(code half). Appended `bananagrams, waffle, wordle, stackdown, scrabble` (list
now all ten in registry order); rewrote the stale top comment (which falsely
claimed the drift would be "obvious") and the `:93–95` "only codenamesduet"
comment. `npx eslint .` clean — the five folders had no pre-existing cross-game
imports, so the guard is now enforced going forward with no new violations. The
README/deferred.md enforcement-claim fixes + the generate-from-registry follow-
up remain (docs batch / deferred).
`eslint.config.js:18` lists
`['codenamesduet', 'psychicnum', 'connections', 'spellingbee', 'boggle']` —
bananagrams, waffle, wordle, stackdown, scrabble were never appended. So
`README.md:49` ("ESLint's `no-restricted-imports` rules enforce this at lint
time") and `deferred.md:109` ("the lint failure on a missed update is
obvious") describe an enforcement that hasn't existed for those five folders,
and cross-game imports of them are currently unguarded. (The
generate-from-registry idea is already in deferred.md; *the drift having
actually happened* is the new information.) The stale comment at
`eslint.config.js:93–95` ("Today there's only codenamesduet…") is part of the
same neglect.
*Fix:* append the five games now; then do the deferred generate-from-registry
change so this can't recur.

### §1.6 Informational (not bugs, worth knowing)

- `psychicnum.create_game` samples N−1 five-letter words + one 9-letter word —
  explicitly commented `TEMP (texture for font-sizing)`; deviates from the
  documented length-agnostic sample. Left alone per the don't-remove prior.
- spellingbee **coop** terminals write `game_players.result` as
  `{finished, team_score, …}` with **no `won` key** — unlike every other
  game's `{won: bool}` contract. Currently unconsumed (`playerOutcome` is
  compete-only), but it would report all coop players as `'lost'` if ever
  read.
- wordle's coop `guess_index` race (2026-07-01 §1.5) now **appears fixed** —
  `submit_guess`'s `FOR UPDATE` means the second submitter re-reads
  `guesses_used` post-commit. Worth closing out in the old review doc after a
  confirming look.

---

## §2 Dead CSS

The sweep covered all 96 `*.module.css` files (~559 class tokens) + the 11
`theme.css` files, per-importer, with template-literal-prefix matching and
hand-verification of all 14 dynamic-access modules (`styles[tone]` etc.)
against their backing union types. Also checked: orphaned files (0), unused
keyframes (0), duplicate/fully-overridden rules (0), stale `[data-*]`
selectors (0), and a dedicated PlayArea-vs-BoardCol/InfoCol same-class
cross-check for all 10 games.

**One new finding:**

- **`src/scrabble/components/PlayArea.module.css:78–95` `.ghost` — verified
  dead.** A byte-identical duplicate of `BoardCol.module.css:80 .ghost` (the
  drag-ghost tile), left behind by the PlayArea → BoardCol decomposition. The
  only render is `BoardCol.tsx:788` against `BoardCol.module.css`; neither
  importer of `PlayArea.module.css` references `ghost`. Safe to delete the
  whole block. (Housekeeping note: the already-tracked `.commitPill` in this
  file now sits at line 70, not the line 185 recorded in the 2026-07-01 doc —
  the file was reshaped by the decomposition.)

Everything else flagged by a naive grep is either **alive via typed dynamic
access** (e.g. codenamesduet `KEY_SQUARE` key classes, ActionButton/pill/toast
tones, scrabble premium classes, the waffle/wordle color families), **already
tracked** (the 2026-07-01 §2 nine-item list, the `--tile-4/5` ramp question,
deferred.md's outcome `-bg` tokens — all re-verified still present and still
dead, so the tracked list remains accurate), or **deliberate** (the
`--color-outcome-*` vocabulary-completeness block that theme.css explicitly
marks "do NOT treat as dead", and the `.boardCol` debug tint). Token audit: 149
defined / 134 referenced; every unreferenced token is accounted for in one of
those buckets. Post-reorg, the CSS is in genuinely good shape.

---

## §3 Documentation accuracy

Mechanical passes were exhaustive: every `common/…` path string in every
`.md/.ts/.tsx/.css/.sql` file resolved against the real tree (712 refs → 53
stale, **all in code comments** — the docs' own path references all resolve);
every intra-repo markdown link + anchor validated with GitHub slug rules; all
238 `vi.mock` paths and `?url` asset imports resolve; all `npm run` references
exist in package.json.

### §3.1 Stale markdown

**Deleted `usePeerFeedback` hook still documented** (superseded by
`common/hooks/feedback/useGlobalFeedback.ts`; the code change is tracked in the
2026-07-01 review §4.1 but the doc updates were missed):

- `docs/games/spellingbee.md:338, 384, 425–431, 449` — including a
  folder-layout entry for `hooks/usePeerFeedback.ts`. Reality:
  `src/spellingbee/hooks/` contains only `useGame.ts`; the narration is
  `useGlobalFeedback` (`src/spellingbee/components/PlayArea.tsx:7`, `:238`).
- `docs/games/stackdown.md:348–357` — same folder-layout bullet. Reality:
  `src/stackdown/components/PlayArea.tsx:14` imports `useGlobalFeedback`
  (`:256`).

**psychicnum "hidden-target" → "hidden-secrets" rename not propagated:**

- `docs/code-conventions.md:71` — cites `psychicnum._target_for(uuid)` and the
  anchor `#the-hidden-target-mechanic`; the function is `_secrets_for`
  (`20260615000002_psychicnum.sql:266`) and the heading is "The hidden-secrets
  mechanic" (`docs/games/psychicnum.md:138`). Both identifier and anchor are
  dead.
- `CLAUDE.md:20`, `docs/naming.md:273`, `README.md:141` — "the hidden-target
  pattern" describing psychicnum; its vocabulary is hidden-*secrets*.
  (wordle's "hidden-target" mentions are correct — different game.)

**Nonexistent migration named:**

- `docs/games/spellingbee.md:115` — "The 20260621 `spellingbee_compete`
  migration:". No such file; everything is folded into
  `20260617000000_spellingbee.sql` (as the doc itself says at `:79`/`:538`).

**Broken anchors / links** (GitHub slug rules):

- `docs/common.md:183` — `[ui.md → Info-column readouts](../ui.md#info-column-readouts)`
  resolves to repo root; should be `ui.md#…` (heading exists, `docs/ui.md:611`).
- `docs/common.md:286` — "See [Timer](#timer) above": no such heading; the
  content is "### Idle accounting (timer-state preservation)" (`:121`).
- `docs/games/connections.md:482` — same missing `common.md#timer` anchor.
- `docs/games/scrabble.md:708` — `[§5.5](#55-end_game--submit_timeout)`:
  heading is now "5.5 `end_game` / `concede` / `submit_timeout`" (`:372`); the
  slug drifted when concede landed.
- `docs/games/boggle.md:85` — cites "§5" + `#5-board-generation` for board
  generation; it's **§4** (`:138`), and §5 is Dictionary delivery.

**Stale behavior claims:**

- `docs/common.md:183` — still splits games into "the shared PlayArea shell
  (psychicnum, connections, codenamesduet)" vs "games still on their old
  shells" registering an `end-game` menu item. Reality: all ten games are v3;
  every game renders `<EndGameButton>` in its InfoCol and **no game registers
  the menu item** (`useEndGameMenu` has zero consumers — see §3.2).
- `README.md:148` — "codenamesduet plays end-to-end and psychicnum exists as a
  deliberately-tiny second game… Next games slot into the same shape." Ten
  games are live (the README's own intro lists them). The Status paragraph
  needs a rewrite.
- `README.md:17` — "starting a new game **pulls the whole group into it**".
  That model was replaced by the invite-to-join popup (`useGameInvitations`;
  README's own `:68` describes the popup; deferred.md `:38` records the
  change).
- `README.md:33–37` — the architecture tree lists only `codenamesduet/` and
  `psychicnum/` with no ellipsis for the other eight. Minor.
- `docs/playarea-decomposition-plan.md:6–7` — "per-game `lib/history.ts` …
  seven games". Only six have `lib/history.ts`; scrabble's replay is
  `boardUpToSeq` in `src/scrabble/lib/play.ts:228` (the doc itself says so at
  `:105`). Echoed in `CLAUDE.md:14`.
- `docs/common-layout.md:162–164` — "the pre-existing `react-hooks/refs` lint
  errors … fail at HEAD too and were left alone". Since fixed (`f3b6cc2`);
  present tense now false.
- `docs/common-layout.md:44–84` — the components tree omits
  `components/icons.ts` (lives at the components root); minor, the lib section
  does list its root files.
- `CLAUDE.md:6` — says common-layout.md contains "the one-time migration
  plan"; the doc now has only the retrospective "How this was applied". Minor
  row drift.
- `docs/games/psychicnum.md:340–417` — folder tree omits `BoardCol.tsx`,
  `InfoCol.tsx`, `WordBoard.tsx` (+ their css), and lists a
  `SetupForm.module.css` that **does not exist**. Prose describes the
  decomposition correctly.
- `docs/games/connections.md:302–419` — same tree omission of
  `BoardCol.tsx`/`InfoCol.tsx`.
- `docs/games/spellingbee.md` — documents `submit_word(target_game, word)` as
  server-validating; the code is the trusting-commit
  `(word, points, is_pangram, is_bonus)` signature.
- **Naming-authority docs pointing at dead names** (they're the enforcement
  layer, so worth fixing promptly): `GuessHistory` (`docs/naming.md:133`;
  `docs/code-conventions.md:288,303,418,443` — now `GameTurnLog`);
  `connections/components/TileGrid.tsx` (`docs/naming.md:143` — now
  `Board.tsx`); "`lib/history` (every game with a turn-history viewer)"
  (`docs/code-conventions.md:303` — scrabble deviates, see above).
- README/deferred.md lint-enforcement claims — see §1.5 G1.

Clean bill: `docs/games/{codenamesduet,bananagrams,waffle,wordle,scrabble,boggle}.md`
verified in depth (paths, RPC/table/view names, concede wrappers, scrabble
version CAS, wordle mode-aware RLS, waffle `security_invoker` views, boggle
dual word lists, the codenamesduet edge function incl. model + effort);
`docs/common-layout.md`'s hooks/ and lib/ taxonomies match the tree exactly;
cheatsheet.md and testing.md paths/scripts all resolve.

### §3.2 Wrong code comments

**The reorg codemod rewrote imports but not prose — 53 comments still cite
pre-reorg flat `common/` paths.** Current homes:
`PlayArea.module.css` → `common/components/game/`;
`TurnLog.*`/`historyViewer.module.css` → `common/components/game/lists/`;
`EntryRow.*` → `common/components/game/entry/`;
`setupForm.module.css` → `common/components/fields/`;
`OpponentStrip` → `common/components/game/`;
`useTerminalModal`/`useCommonGame` → `common/hooks/game/`;
`useDefinePopover` → `common/hooks/definitions/`;
`layoutWidth.ts` → `common/lib/util/`;
`memberColor.ts`/`tileColor.ts` → `common/lib/color/`. Sites:

- **common/**: `components/game/entry/EntryRow.module.css:1`,
  `components/game/PlayArea.module.css:68`, `lib/game/peers.ts:4`,
  `lib/games.ts:197`, `lib/util/layoutWidth.ts:8`, `theme.css:64,202,250,311`
- **codenamesduet**: `components/BoardCol.module.css:5`,
  `components/GameTurnLog.module.css:4,11`, `components/PlayArea.module.css:3`,
  `components/PlayArea.tsx:223`
- **psychicnum**: `components/BoardCol.module.css:6`,
  `components/GameTurnLog.module.css:4,13`, `components/GameTurnLog.tsx:55`,
  `components/PlayArea.module.css:3`, `components/WordBoard.module.css:3,45`,
  `hooks/useGame.ts:104`
- **connections**: `components/GameTurnLog.module.css:4`,
  `components/PlayArea.module.css:2`, `theme.css:6`
- **spellingbee**: `components/PlayArea.module.css:2,67`
- **boggle**: `components/PlayArea.module.css:2,106`,
  `components/SetupForm.module.css:2`
- **bananagrams**: `components/PlayerBoard.module.css:2`,
  `components/SetupForm.module.css:3`
- **waffle**: `components/BoardCol.module.css:15`,
  `components/GameTurnLog.module.css:4,10`, `components/PlayArea.module.css:3`,
  `components/WaffleGrid.tsx:105`
- **wordle**: `components/GameTurnLog.module.css:3,12`,
  `components/GameTurnLog.tsx:93`, `components/InfoCol.module.css:2`,
  `components/PlayArea.module.css:2`, `lib/colors.test.ts:4`
- **stackdown**: `components/BoardCol.module.css:26`,
  `components/BoardCol.tsx:178`, `components/FoundWords.module.css:9`,
  `components/FoundWords.tsx:54`, `components/PlayArea.module.css:2`
- **scrabble**: `components/Board.module.css:22`,
  `components/BoardCol.module.css:42`, `components/PlayArea.module.css:2`,
  `components/PlayLog.module.css:9`, `components/PlayLog.tsx:38`

**psychicnum still says "target" where the code says "secrets":**

- `src/psychicnum/hooks/useGame.ts:19–24, 93` — docstring describes "the
  conditional `target` reveal … the view returns `target = null`"; the field
  is `secrets: string[] | null` (`:44`, selected `:128`).
- `supabase/migrations/20260615000002_psychicnum.sql:237–241` — grants comment
  block says `target` is the column-excluded column; the table has no `target`
  column — it's `secrets` (`:106–112`), and the grant below the comment
  correctly excludes `secrets`.

**`useEndGameMenu` is dead code with a docstring describing consumers that no
longer exist** — `src/common/hooks/game/useEndGameMenu.ts:12–16, 33–39` claims
six games use it and two deliberately don't; grep finds **zero consumers**
repo-wide (every game wires `<EndGameButton>` in InfoCol). Flagged, not
removed, per the don't-remove prior — but either the hook or the docstring
should go/change, and `docs/common.md:183` (§3.1) depends on the same fiction.

**`<FeedbackPill>` → `GenericFeedbackPill` rename: 8 comments still use the
dead name**: `src/common/theme.css:101`,
`src/common/components/game/PlayArea.module.css:117`,
`src/common/components/game/PlayersStrip.module.css:6`,
`src/common/components/game/StatusSlot.module.css:3`,
`src/spellingbee/theme.css:29`, `src/spellingbee/components/PlayArea.module.css:9`,
`src/boggle/components/PlayArea.module.css:8`,
`src/connections/components/PlayArea.module.css:218`.

**Minor:**

- `eslint.config.js:93–95` — "Today there's only codenamesduet…" (see §1.5).
- `supabase/migrations/20260624000000_waffle.sql:869` — "subscription (on
  waffle.{games,players})": it's `waffle.{games,players,swaps}`
  (`src/waffle/hooks/useGame.ts:75–77`). Conclusion unaffected.
- `src/common/lib/game/pause.ts:13, 23–24` — pointers to a nonexistent
  "three-state lifecycle" phrase in common.md (nearest: "Club-level game
  lifecycle", `:143`) and a renamed connections section (now "Pause
  (presence-driven + manual)", `connections.md:450`).
- `src/common/hooks/game/useCommonGame.ts:466–470` — the broadcast self-echo
  claim (see §1.3 L4).
- `src/scrabble/components/BoardCol.tsx:27` — docstring mentions an
  `onFeedback` prop that doesn't exist.

---

## §4 Reuse opportunities

Ordered by payoff (lines saved × drift risk). Each was checked against
deferred.md / the 2026-07-01 review for prior decisions; overlaps are noted.

> **✅ DONE (folds in §5.4).** New `common/lib/game/localPills.ts` with
> `stickyPill(tone, text)` (outline+sticky — replaces psychicnum `ownMove`,
> connections `ownGuess`, wordle `localPill`, AND `useWordSubmit`'s private
> copy; the three per-game `lib/` files are deleted, psychicnum's `capitalize`
> moved to `lib/capitalize.ts`), `terminalPill(tone, text)` (fill+sticky, maps
> won/lost/neutral; caller owns the text — verdict / message / custom reveal /
> `Game over — {indicator}`), and `outOfRacePill(myConceded, activeText?)`
> (the shared conceded copy, per-game active side). All ten games' terminal
> pills + the four locally-done pills now call these. **One deliberate visual
> change:** stackdown's terminal pill now keys on `over.tone` like every other
> game (and like its own info-line via `TerminalActionRow`) instead of
> `over.outcome`, so a manual end reads *neutral* not green — fixing an internal
> inconsistency. codenamesduet's `ownAction` stays (it's `dismiss:'timed'`, not
> sticky — a real difference). `tsc -b` + eslint clean; 350 FE tests green.
> §5.5 (the `showFeedback`→`showLocalFeedback` rename + resolved-pill prop
> drift) is left for the naming pass.

**4.1 [HIGH] The below-board pill builders — one contract, ~25 hand-rolled
copies.** Every game builds the same three `GenericFeedbackMsg` shapes by hand:

- *Terminal-verdict pill* — the `over.tone` → `success/error/neutral` ternary
  + `variant:'fill'` + sticky is **byte-identical in all ten games**:
  `bananagrams/PlayArea.tsx:241`, `boggle/BoardCol.tsx:126`,
  `codenamesduet/BoardCol.tsx:200`, `connections/BoardCol.tsx:292`,
  `psychicnum/BoardCol.tsx:222`, `scrabble/PlayArea.tsx:174`,
  `spellingbee/BoardCol.tsx:151`, `stackdown/PlayArea.tsx:335`,
  `waffle/PlayArea.tsx:204`, `wordle/PlayArea.tsx:226`.
- *Locally-done pill* incl. the identical copy string, 4 near-identical
  copies: `connections/BoardCol.tsx:304`, `psychicnum/BoardCol.tsx:257`,
  `waffle/PlayArea.tsx:213`, `wordle/PlayArea.tsx:235`.
- *Sticky own-move pill* — three per-game lib files that are the same function
  three times (`psychicnum/lib/ownMove.ts:17`, `connections/lib/ownGuess.ts:12`,
  `wordle/lib/localPill.ts:15` — each docstring cross-references the others)
  plus ~19 inline `{…, variant:'outline', dismiss:{kind:'sticky'}}` literals.

Not marked deliberate anywhere; the three lib files were created *during* the
decomposition — post-review drift. **Shared version:**
`common/lib/game/localPills.ts` (beside `terminalCopy.ts`, which it consumes):
`stickyPill(tone, text)`, `terminalPill(over, extraText?)`,
`outOfRacePill(myConceded)`. ~120–150 lines saved; the highest drift risk in
the repo — the fill-means-permanent / sticky-means-own-move contract from
ui.md currently exists only as 25 conventions-by-copy. (Naming rider: see
§5.4.)

> **✅ DONE (submitTimeout/endGame + edge-invoke; create_game deliberately
> left).** New `common/lib/game/manifestRpcs.ts`:
> - `makeRpcDispatcher(db, fnName)` — collapses **all** `submitTimeout`/`endGame`
>   wrappers, including the three games that had them inline in the export
>   (psychicnum/codenamesduet/bananagrams), so all ten games now share it. Typed
>   generic over the one fn name so bananagrams (no `end_game` RPC) still fits.
> - `invokeStartGameEdgeFn(fnName, body, brand)` — owns the subtle edge-invoke
>   `error.context` unwrap that boggle/spellingbee/waffle each copied verbatim;
>   dropped the now-unused `supabase` import from all three.
>
> The **plain-RPC `create_game` starters were deliberately NOT factored**: they
> vary too much for a clean helper — connections does a puzzle-dedup + roster-
> match dance, wordle/psychicnum/stackdown use `.rpc(...).single()`, codenames-
> duet/bananagrams are inline direct-rpc. Forcing a `makeCreateGameStarter`
> would either be a leaky lowest-common-denominator or wouldn't fit connections.
> `tsc -b` + eslint clean; 608 FE + boggle/spellingbee/board-geometry e2e green.

**4.2 [HIGH] Manifest RPC boilerplate.** Three dispatchers hand-copied across
manifests:

- `submitTimeout` — 7 near-identical 5-line wrappers (boggle, connections,
  spellingbee `:132`, scrabble, waffle, stackdown, wordle `:60`).
- `endGame` — 7 near-identical (boggle `:78`, connections `:179`, scrabble
  `:55`, spellingbee `:139`, wordle `:67`, waffle `:98`, stackdown `:66`).
- `startGameInClubFactory` — 8 copies in two flavors: plain-RPC (wordle `:35`,
  connections `:110`, psychicnum `:65`, stackdown `:34`, + direct-rpc variants
  codenamesduet `:86`, bananagrams `:71`) and edge-invoke with the ~25-line
  `error.context` Response-unwrapping block copied three times (spellingbee
  `:76–124`, boggle `:37–70` — whose comment literally says "Mirrors
  spellingbee's" — waffle `:42–96`).

**Shared version:** `common/lib/game/manifestRpcs.ts` —
`makeRpcDispatcher(db, fnName)`, `makeCreateGameStarter(db, brand)`,
`invokeStartGameEdgeFn(fnName, body, brand)` owning the error-context unwrap.
~180–220 lines across 10 manifests; the unwrap block is subtle enough that a
fourth copy would drift.

**4.3 [MEDIUM-HIGH] Edge-function HTTP scaffolding — no `_shared/` exists
yet.** All five Deno functions copy `corsHeaders`, a `json()` helper,
OPTIONS-preflight + POST-only guards, `req.json().catch(() => ({}))`, and (the
three board-builders) the target_club/setup/player_user_ids/mode/Authorization
validation + createClient-as-caller + `rpc('create_game')` + error mapping:
`boggle-build-board/index.ts:39–46,61–79,124–146`,
`waffle-build-board/index.ts:49–53,94–110`,
`spellingbee-build-board/index.ts:127–131,413–420`, `define/index.ts:46–56,94–95`,
`codenamesduet-suggest-clue/index.ts:51–65`. **Shared version:**
`supabase/functions/_shared/http.ts` + `_shared/startGame.ts`. ~80–120 lines;
a header added to `Access-Control-Allow-Headers` currently must be stamped 5×
(boggle's list already formats differently).

**4.4 [MEDIUM] InfoCol action-slot triple branch + "You conceded" row —
supersedes the deferred `<EndOrConcedeButton>`.** The concede feature
(2026-07-02, post-review) created new duplication: the full
`over ? <TerminalActionRow/> : isLocallyDone ? <conceded-row> : <End|Concede row>`
branch. Near-identical conceded-row: `boggle/InfoCol.tsx:125–142`,
`spellingbee/InfoCol.tsx:147`, `stackdown/InfoCol.tsx:152`,
`scrabble/InfoCol.tsx:149`. Same-shape with per-game done-copy:
`wordle/InfoCol.tsx:155`, `psychicnum/InfoCol.tsx:164`,
`connections/InfoCol.tsx:164`, `waffle/InfoCol.tsx:160`. The 2026-07-01 §4.2
`<EndOrConcedeButton>` covered only the End/Concede ternary — the extraction
target has grown: an `<InfoActionSlot over isLocallyDone doneLabel isCompete
onEndGame onConcede onBackToClub>` in `common/components/game/` folds the whole
slot and absorbs the deferred item. `doneLabel` stays per-game (those copy
differences are meaningful).

> **✅ DONE.** New `common/components/game/HelpPanel.tsx` (+ `.module.css`) owns
> the FloatingPanel + "How to play {brand}" title + right-aligned "Got it" row
> (the inline `style` is now a `.gotItRow` class). All ten games' `Help.tsx` are
> now just their rules copy wrapped in `<HelpPanel brand onClose size? minSize?>`
> — including **boggle, whose bare-`<div>` Help (no FloatingPanel) is fixed**, and
> spellingbee/scrabble, which gained the missing "Got it" button. Per-game sizes
> preserved (passed through), so no visual regression on the nine. `tsc -b` +
> eslint + 610 FE tests green.

**4.5 [MEDIUM, includes a real drift bug] Help modal chrome.** Nine games
wrap per-game rules copy in the same FloatingPanel + "How to play {brand}" +
right-aligned "Got it" (wordle's Got-it row via inline style) — and
**boggle's `Help.tsx` is a bare `<div>` with an `<h2>` and an unstyled button,
no FloatingPanel at all**, rendering visibly differently from every other
game. Nothing documents the divergence; ui.md says Help is part of the uniform
frame. **Shared version:** `common/components/game/HelpPanel.tsx`
(`<HelpPanel brand onClose size?>{children}</HelpPanel>`). ~12–18 lines × 10,
kills the inline style, fixes boggle.

**4.6 [MEDIUM] SQL: the Wordle coloring algorithm exists twice in plpgsql.**
`waffle._wordle_colors` (`20260624000000_waffle.sql:53`) ≡
`wordle.compute_colors` (`20260625000000_wordle.sql:61` — its own comment says
"Mirrors waffle._wordle_colors"), plus the documented-deliberate TS port
(`src/waffle/lib/colors.ts:31`, oracle-pinned). The 2026-07-01 §1.5 tracked
only *verifying parity*, not consolidating. **Shared version:** one
`common.wordle_colors(guess, answer)` (the `common` schema already hosts
shared helpers); waffle's board-merging `compute_colors` stays per-game. Under
the alpha prior, edit the two baseline migrations directly. ~40 SQL lines;
this algorithm is exactly where the old review said a subtle bug would live.

**4.7 [LOW-MEDIUM] OpponentStrip terminal `metricFor` verbs.** The
`playerOutcome(member)` → "Won at X"/"Quit at X"/"Lost at X" dance is the same
in `boggle/InfoCol.tsx:108–119`, `scrabble/InfoCol.tsx:127–140`,
`spellingbee/InfoCol.tsx:120–133`. The other five OpponentStrip users use
genuinely different metric vocab — leave those. **Shared version:** an
`outcomeVerb(member, value)` helper in `common/lib/game/`. The win is the
verbs staying in lockstep with `playerOutcome`'s vocabulary.

**4.8 [LOW] PDF word-list-family body skeleton.**
`boggle/pdf/printBogglePdf.ts:29–43` and
`spellingbee/pdf/printSpellingbeePdf.ts:31–46` share the body skeleton beyond
the shared helpers — the magic offsets (44/26/9/24) are copied constants
(spellingbee's docstring: "It's boggle's shape with a different board").
pdf.md already names the "two body families"; the layout could become
`common/pdf/wordListBody.ts` taking a `drawBoard(doc, x, y) → {w, h}`
callback. Small today, but it's the stated template for future word-list
printers — extracting pins the offsets. (Not diffed: the three
turn-log-family printers for the analogous skeleton; worth the same check.)

**4.9 [LOW] SQL micro-dups: mode guards.** The create_game
`if mode not in ('coop','compete')` stencil and the concede compete-gate
(`if (select mode …) <> 'compete' then raise`) repeat ~10×
(e.g. `20260628000000_boggle.sql:494`, `20260625000000_wordle.sql:660`).
Could be `common.validate_mode(text)` + `common.require_compete(uuid)`. Low
urgency — the wrappers otherwise delegate cleanly.

**Investigated and rejected** (valuable non-findings): per-game `useGame`
hooks (thin, typed, documented Pattern B for connections); per-game
`lib/history.ts` (identical signature, genuinely different bodies —
documented-deliberate split); per-game `lib/setup.ts` + SetupForms (thin,
content-only); `create_game`/concede SQL bodies (already delegate to `common.*`
helpers); wordle-vs-waffle FE color code (no FE-FE dup); remaining CSS hexes
(protected game vocabulary or tracked); the four animation keyframes (genuinely
different); the on-screen keyboard (single consumer); turn-log row anatomy
(tracked anti-recommendation, §4.7 of the old review); `useWordSubmit` adoption
(correct as-is); `isLocallyDone` (one line, waffle divergence documented).

---

## §5 Naming consistency

Authority: `docs/naming.md`, with `docs/playarea-decomposition-plan.md`'s prop
glossary and `docs/code-conventions.md` where they apply. Ordered by leverage.

**5.1 The turn-log component: `GameTurnLog` vs `FoundWords` vs `PlayLog` —
unify on `GameTurnLog`.** — **✅ DONE.** `git mv` stackdown `FoundWords` +
scrabble `PlayLog` → `GameTurnLog` (`.tsx` + `.module.css`), updated all
component refs/imports + the stale cross-reference comments (TurnLogActor,
psychicnum css, waffle) + the docs. Generic-heading rider: unified the three
drifting generic headings (`"Turn Log"` stackdown, `"Moves"` scrabble,
`"Turns"` psychicnum) on **"Turns"**; the domain-appropriate `"Guesses"`
(connections/wordle — a guess IS the turn), `"Swaps"`, `"Clues"` left as
deliberate. `tsc -b` + 65 Vitest green. Same slot in all 7 history games (info-column log on
shared `<TurnLog>`, `#N` handles, `onSelectTurn`): five games say
`GameTurnLog`; stackdown says `FoundWords` (`src/stackdown/components/FoundWords.tsx`
— self-refuting: its own docstring says "so it's a **turn log**", and its
rendered heading is `heading="Turn Log"`, line 80); scrabble says `PlayLog`.
Majority + self-description + the recorded GameTurnLog-over-GameLog precedent
all point the same way. Rider: the generic headings also drift — "Turns"
(psychicnum) vs "Turn Log" (stackdown) vs "Moves" (scrabble); domain headings
("Swaps", "Clues") are fine.

**5.2 The board-layer component: six names for one role — unify on `Board`.** —
**✅ DONE** (the four renamable ones). `git mv` `BoardGrid` (codenamesduet),
`WordBoard` (psychicnum), `WaffleGrid` + `WordleGrid` (the codename-in-identifier
smell) → `Board` (`.tsx` + `.module.css`), all refs + docs updated. Now 8/10
games name it `Board` (bananagrams `BoardArena` is the documented exception).
Left as genuinely-different: spellingbee's `Letters`/`Letter` (the hex-tile
two-vocabulary question — separate from this rename) and boggle (grid still
inline, no component to rename). `tsc -b` + eslint + 608 Vitest green.
naming.md's own worked example says "The `Board` is still `Board` — just in a
different folder." connections/scrabble/stackdown conform. Deviations:
`BoardGrid` (codenamesduet), `WordBoard` (psychicnum), `WaffleGrid` /
`WordleGrid` (**codename in the identifier — the documented smell**),
`Letters` + `Letter` for spellingbee's hex tile (design-decisions.md: "we
always call them tiles"), boggle (grid inline in BoardCol — the one game
without the layer; the decomposition plan's own table flags it).
`BoardArena` (bananagrams) is the documented exception — not flagged.

**5.3 `common.games.status` winner key: `winner_username` vs `winner` — unify
on `winner_username`, and it costs label quality today.** — **✅ DONE.** All
seven compete games now write `winner_username` in status. wordle/waffle/
stackdown **added** it alongside the UUID `winner` (which stays — `buildOver`'s
self-won check reads it) and their `labelFor` now renders "won by {name}"
instead of "winner decided"; scrabble's `winner_name` → `winner_username`
(SQL + FE + pgTAP). The internal plpgsql locals still named `winner_name` in
psychicnum/connections/bananagrams are left (the status KEY they write is
already `winner_username`). Migrations reapply clean; touched games' pgTAP +
610 FE tests green. psychicnum
(`psychicnum.sql:682`), connections (`:854`), bananagrams (`:782`) store
`winner_username` (a username); waffle (`waffle.sql:608,863`), wordle
(`:470,747`), stackdown (`:488`), scrabble (`:538`) store `winner` (a
**UUID**). Not just naming: `labelFor` is pure/no-I/O, so the UUID camp cannot
render a name — psychicnum's club label says "ada won the race"
(`psychicnum/manifest.ts:143`) while waffle/wordle can only say "winner
decided" (`waffle/manifest.ts:113`). The "username caching is fine" prior
explicitly blesses caching the username into status jsonb.

**5.4 The own-move pill builder: four copies, three names.** — **✅ DONE via
§4.1** (unified as `stickyPill` in `common/lib/game/localPills.ts`). `ownMove`
(psychicnum + private copy in `common/hooks/game/useWordSubmit.ts:93`),
`ownGuess` (connections), `localPill` (wordle), inline fold (scrabble). Same
function; promote one builder to `common/` under one name — pairs with §4.1.
`localPill` matches the plan's canonical prop name; `ownMove` has plurality.

**5.5 Feedback-channel naming violations (the codebase's own hard rule —
mechanical fixes).** — **◐ PARTLY DONE.** ✅ `WordSubmitApi.showFeedback` →
`showLocalFeedback` (internal `useLocalFeedback` return aliased to `showPill` to
avoid the clash; boggle/spellingbee consumers updated). ✅ scrabble BoardCol's
stale `onFeedback` docstring → `showLocalFeedback` (the real prop). ⬜ The
resolved-pill BoardCol **prop** drift (`localPill` vs `localFeedback` vs
wordle's `localFeedbackMsg`) — deferred: it tangles with the `useLocalFeedback`
return also named `localFeedback`, so a clean unify on `localPill` needs care.

- `WordSubmitApi.showFeedback` (`src/common/hooks/game/useWordSubmit.ts:87`) —
  bare, in a *common* hook, next to correctly-named `localFeedback` /
  `clearLocalFeedback` in the same type; consumed in
  `boggle/PlayArea.tsx:177,188` and `spellingbee/PlayArea.tsx:213,225`.
  → `showLocalFeedback`.
- Resolved-pill prop drift across BoardCols: `localPill` (codenamesduet,
  scrabble, stackdown, waffle — glossary-correct) vs `localFeedback` (boggle,
  connections, psychicnum, spellingbee) vs `localFeedbackMsg` (wordle — a name
  the plan explicitly calls out as drift).
- Stale docstring: `onFeedback` in `src/scrabble/components/BoardCol.tsx:27`
  (no such prop).

**5.6 `selfId` vs `selfUserId`.** — **✅ DONE.** Global rename `selfUserId` →
`selfId` across all of `src/` (game-context AND the lower-priority club-context
surfaces — verified every mixed file used both names for the same
`session.user.id`, so merging them is conflict-free). `tsc -b` + eslint + 608
Vitest green. Glossary + shared `OpponentStrip` canonize
`selfId` (64 uses). `selfUserId` (16) survives in
`connections/components/BoardCol.tsx:63,104` (its own InfoCol uses `selfId` —
intra-game drift), `connections/Board.tsx`,
`spellingbee/components/PlayArea.tsx:345,459`, bananagrams (`PeersStrip.tsx`,
`PlayArea.tsx`), and lower-priority common club-context surfaces
(`FloatingChat`, `ClubPage`, `GamePage`, `SetupGameDialog`,
`useClubSetupPresence`).

**5.7 InfoCol roster prop: `members` vs `players` — a doc-vs-doc conflict the
code split on.** — **✅ DONE.** Reconciled on naming.md's authority (`players`):
scrabble/stackdown/waffle dropped the `ctx.players → members` alias and now use
`players` throughout their PlayArea + InfoCol (prop + internals), matching the
other six games. Updated the decomposition-plan prop glossary (`members` →
`players`) so the two docs agree. `tsc -b` + eslint + 96 Vitest green. scrabble/stackdown/waffle pass `members` (per the
decomposition plan's glossary); the other six pass `players` (per
naming.md/code-conventions.md's Member-vs-Player table: game-context variable
name is `players`, type stays `Member`). Worse, scrabble/stackdown/waffle call
the same array `members` in InfoCol and `players` in their own turn-log child.
First reconcile the docs (naming.md is the authority ⇒ `players`), then align
the three-game camp.

**5.8 Per-game DB-row type names.** — **✅ DONE** (the 5 renames; two judgment
riders left). `PsychicnumGuess`→`GuessRow`, `PsychicnumPlayer`→`PlayerRow`,
`WordleGuess`→`GuessRow`, `WaffleSwap`→`SwapRow`, `BananagramsProgress`→
`ProgressRow` (each scoped to its game folder, no collisions). Left: scrabble/
stackdown declaring a `type Player` alias, and the `<Codename>Game` shape
blessing — both are the "doc/one-line" riders below, deferred to a naming.md
pass. Rule: DB-shaped types end in `Row`, no codename prefixes. Conformers: `GuessRow`, `PlayerRow`, `PlayRow`,
`SubmissionRow`, `FoundWordRow`, `WordRow`, `ClueRow`. Deviants (each "one row
from `<schema>.<table>`" per its own docstring): `PsychicnumGuess` →
`GuessRow`, `PsychicnumPlayer` → `PlayerRow`
(`src/psychicnum/hooks/useGame.ts:75,60`), `WordleGuess` → `GuessRow`
(`src/wordle/hooks/useGame.ts:36`), `WaffleSwap` → `SwapRow`
(`src/waffle/hooks/useGame.ts:44`), `BananagramsProgress` → `ProgressRow`
(`src/bananagrams/hooks/useGame.ts:59`). Related: scrabble and stackdown don't
export `type Player` (naming.md says every game declares the alias). Judgment
call, not drift: the enriched `<Codename>Game` shape (8/10 games) is
internally consistent but contradicts the no-prefix principle — worth a
one-line doc blessing rather than code churn; codenamesduet's private
`GameRow` tracks a genuinely different shape.

**5.9 Brand leaks + the `--mg-*` token prefix.** — **✅ DONE** (soft test-fixture
item left). `--mg-cursor/-error/-grid-edge` → `--bananagrams-*` (defs +
5 usages). Brand names in comments → codename: MothCubes→boggle (5 boggle
files), TinySpy→codenamesduet (TurnLog), FreeBee→spellingbee (WordList,
useWordSubmit), MonkeyGrams→bananagrams (icons). Left: `common/pdf/frame.ts`
+ `useClubSetupPresence` (both legitimately *illustrate* the brand value), and
the soft `PlayArea.test.tsx` brand fixtures. Brands belong only in the
manifest `BRAND`:

- Comments using brands: `boggle/theme.css:1`,
  `boggle/components/PlayArea.module.css:1`, `boggle/components/Help.tsx:1`,
  `boggle/components/PlayArea.tsx:25`, `boggle/lib/solver.ts:2` (MothCubes);
  `common/components/game/lists/TurnLog.tsx:12` (TinySpy);
  `common/components/game/lists/WordList.module.css:3` (FreeBee);
  `common/hooks/game/useWordSubmit.ts:7` (MothCubes/FreeBee);
  `common/components/icons.ts:39` (MonkeyGrams).
- **`--mg-cursor` / `--mg-error` / `--mg-grid-edge`**
  (`src/bananagrams/theme.css:15–17`) — brand-initial prefix mixed in the same
  file with correct `--bananagrams-tile-*`. (The `--mg-cursor` *value* is
  tracked in 2026-07-01 §3.5; the prefix is not.) → `--bananagrams-*`.
- Soft: the 10 `PlayArea.test.tsx` fixtures hardcode `brand: 'TinySpy'` etc. —
  a second copy of each brand string; consider reading the manifest.

**5.10 History-viewer keying + the viewed-cell class.** — **✅ DONE.** Retired
`viewingTurn` into the documented scheme: codenamesduet → `viewingSeq` (its
value is a `turn_number` seq, like scrabble); connections/psychicnum/wordle →
`viewingIndex` (they key on the log position, like stackdown/waffle). Viewed-
cell CSS: the two out-of-family outliers — scrabble's present-tense
`.viewingTile` and waffle's concept-less `.highlighted` — both → `.viewedTile`,
so every game is now `.viewed*`. `tsc -b` + eslint + 175 Vitest green across the
6 games.

- The viewed-turn id prop is a 3-way split where docs bless two:
  `viewingIndex` (stackdown, waffle) vs `viewingSeq` (scrabble) —
  documented — plus undocumented `viewingTurn` in codenamesduet, connections,
  psychicnum, wordle, which is *internally* inconsistent (codenamesduet's is a
  seq-like `turn_number`; psychicnum/wordle's are log positions, i.e. the
  concept docs call `viewingIndex`). Graduate `viewingTurn` into the scheme or
  align psychicnum/wordle to `viewingIndex`.
- The viewed-cell CSS class: **seven names for one concept** — `.viewedCell`
  (`codenamesduet/BoardGrid.module.css:143`), `.viewedTile`
  (`connections/PlayArea.module.css:155`), `.viewed`
  (`psychicnum/WordBoard.module.css:84`; `stackdown/Board.module.css:58`),
  `.viewedRow` (`wordle/WordleGrid.module.css:47` — row granularity,
  semi-justified), `.viewingTile` (`scrabble/Board.module.css:127` — lone
  present tense), `.highlighted` (`waffle/WaffleGrid.module.css:116` — the
  only one not naming the concept). Favor the `.viewed*` past-tense family.
  (The prop-level `greenTiles` vs `highlight` split is documented-deliberate —
  untouched.)

**5.11 SQL: same purpose, different names.**

- Cheat RPCs: `request_hint`/`request_reveal` (`psychicnum.sql:827,881`) vs
  `reveal_next_hint`/`reveal_next_word` (`stackdown.sql:515,588`). Pick one
  verb family.
- Move-log ordinal column: `seq` (stackdown, scrabble) vs `guess_index`
  (wordle) vs `swap_index` (waffle) — same pure per-move counter; favor `seq`.
  (`turn_number` in codenamesduet is justified — a turn spans clue+guesses;
  timestamp-only ordering in the four unordered-log games is fine.)
- Private compete-finisher: `_maybe_finish_compete` (connections, waffle,
  wordle) vs `_finish` (scrabble) vs `_finalize` (boggle). Low stakes, pure
  drift.
- `game_players.result` numeric key: `score` (scrabble) vs `found` (stackdown)
  vs `found_words_score`+`found_words_count` (spellingbee) — three names for
  "what this player earned" (`won` is uniform).
- boggle writes terminal `play_state='ended'` for a **normal** completion
  (`boggle.sql:457`), with the outcome only in `status` — every other schema
  reserves `'ended'` for the manual end; its own sibling spellingbee writes
  `won`/`won_compete`. Diverges from the states.md compete convention.

**5.12 Smaller confirmed items.** — **◐ PARTLY DONE** (the two clean ones).

- ✅ **DONE.** wordle's InfoCol passes `target` (`wordle/InfoCol.tsx:54,97`) where
  waffle/stackdown use the glossary's `solution` for the same terminal-reveal
  slot (the DB column `target` is doc-blessed; the *prop* glossary says
  `solution`). → Renamed the InfoCol prop `target` → `solution` (value still
  comes from `game.target`).
- The board-gate prop, six names: `readOnly` (stackdown, waffle — glossary) vs
  `entryDisabled` (boggle) vs `showInput` (connections) vs `canGuess`
  (psychicnum) vs `guessingAllowed` (wordle) vs `cellsClickable`
  (codenamesduet).
- Per-player metric InfoCol prop: `playerStates` (scrabble, stackdown, waffle,
  wordle — glossary) vs `scoreByUser` (boggle) / `rankByUser` (spellingbee) /
  `opponentFound` (connections) / `playerBudgets` (psychicnum) — the
  Map-vs-rows shape split is real, but three identically-shaped Maps carry
  three names.
- ✅ **DONE.** Setup validators: `boggleLegalError` / `spellingbeeLegalError` carry
  codename prefixes the folder already provides (vs wordle's
  `legalGuessError`). → Both renamed to `legalError` (dropping the codename;
  src + tests + docs). The remaining §5.12 items (board-gate prop's six names +
  polarity flips, per-player metric prop, edge-fn `define` prefix, spellingbee's
  `on*` callback drift) are **deferred** — fiddlier / lower-value.
- Edge function `define` lacks the documented `common-<feature>` prefix
  (code-conventions.md → Edge Functions); all game-scoped functions conform.
- spellingbee BoardCol breaks the `on*` callback convention (`submit`/`setWord`
  raw, where boggle wraps the same `useWordSubmit` engine as
  `onSubmit`/`onChange`); `onSubmit` (boggle) vs `onSubmitWord` (stackdown)
  for the same act; spellingbee's `over` prop is `{tone; indicator}` where all
  others pass `TerminalCopy | null` under the same name.

**5.13 Graduation candidates for naming.md's canonical table** (per its own
"third game adopts a term" rule): `submit_word` (3 schemas), `concede`,
`submit_timeout`, and `lib/history.ts`'s `TurnSnapshot`/`turnSnapshot`
(6 games, perfectly uniform today — worth pinning before game 11). — **✅ DONE.**
All four verified uniform (submit_word × 3 schemas, concede × common + 9
wrappers, submit_timeout × 10, turnSnapshot × 6) and added to naming.md's
"Cross-game canonical names" table, each noting the deliberate exceptions
(submit_swap/play_word are distinct verbs; scrabble's replay is `boardUpToSeq`).

**Rejected as genuinely different** (checked, not findings): the
`submit_guess`/`submit_word`/`submit_swap`/`play_word` verb split (tracks real
move concepts); hidden-thing DB naming `secrets`/`target`/`solution`/key-cards
(column-tracked, doc-blessed per family); `PeersStrip` vs `OpponentStrip`
(tracks the member/peer distinction); move-entry components (different
mechanics); codenamesduet's seat-based actor columns (intrinsic to fixed
seats); bananagrams' bare `won`/`lost` (single-mode — no sibling to
disambiguate); per-game `setup`/`status` jsonb keys (genuinely different
settings); `.hex`/`.canvas`/decided-tile vocabularies (protected two-vocabulary
territory); `selfDone` vs `isLocallyDone`, `greenTiles` vs `highlight`,
scrabble BoardCol owning RPCs (all documented-deliberate).

---

## §6 Suggested sequencing

1. **The concede seams + timeout lock (§1.1 C1–C4, §1.3 L1)** — C1 is a
   one-line filter + test fix and removes the worst UX in every compete game;
   L1 is a one-line `for update`; C2/C3 are small SQL edits; C4 is the same
   three-line guard stamped into seven RPCs.
2. **The realtime touches (§1.2)** — three small SQL edits restoring an
   existing convention.
3. **`eslint.config.js` GAMETYPES (§1.5)** — one array literal now; the
   generate-from-registry fix later.
4. **The two HIGH extractions (§4.1, §4.2)** — best lines-saved-per-effort in
   the repo, and §4.1 folds in the naming fixes §5.4/§5.5.
5. **Docs batch (§3)** — the two `usePeerFeedback` doc fixes, the
   hidden-secrets rename sweep, README's status/join-model paragraphs, the
   broken anchors, and (as a mechanical sweep) the 53 stale-path comments +
   8 `FeedbackPill` comments. Decide `useEndGameMenu`'s fate (delete or
   re-document) at the same time as the `common.md:183` fix, since they
   describe each other.
6. **Naming unifications (§5)** — mechanical renames first (`GameTurnLog`,
   `Board`, `selfId`, the pill props after §4.1); the `winner_username`
   unification (§5.3) when next touching the four schemas, since it improves
   labels; doc reconciliations (§5.7 members/players, §5.8 `<Codename>Game`
   blessing, §5.13 graduations) as a naming.md pass.
7. Everything else as opportunity arises; move surviving items to
   `deferred.md`.

---

## Verification notes

- **Hand-verified by the coordinating reviewer** (fresh greps/reads at
  `main` @ `ed54b2c`): §1.1 C1 (`computePause` receives the unfiltered roster;
  `pause.ts` contains no `conceded`) and §1.3 L1 (`for update` present at the
  5 other scrabble mutation sites — `:709/:874/:967/:1037/:1134` — and absent
  in `submit_timeout`).
- **Subagent claims dropped after failing cross-verification** (recorded so
  they don't resurface): "codenamesduet lacks a concede RPC" (coop-only —
  concede is a compete feature; correct as-is); "wordle/waffle use `solved`
  play_states" (they write `won`/`won_compete`/`lost_compete`; the claim
  conflated status-jsonb keys with play_state — connections' documented
  `solved`/`solved_compete` is real); "`.inputRow` is the canonical entry-row
  class" (it's chat-only today).
- **Library-source verification**: §1.3 L4's channel-reuse semantics were
  checked against `@supabase/realtime-js` 2.108.1 in `node_modules`
  (RealtimeClient.js:343–355, `removeChannel`/`subscribe` behavior), not
  assumed from docs.
- **Known limits**: ui.md / naming.md / design-decisions.md / features.md got
  mechanical (paths, links, names) + targeted spot-checks rather than
  line-by-line behavioral verification; per-game FE hook docstrings outside
  psychicnum/spellingbee/stackdown/waffle were sampled, not exhaustively read;
  the three turn-log-family PDF printers weren't diffed for the §4.8 skeleton;
  pure game-logic libs (solvers, evaluate, ranks) were leaned on from the
  2026-07-01 verified-correct list rather than re-derived.
