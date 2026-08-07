# Realtime: the lost-event failure mode

What we learned chasing a single failing e2e spec on 2026-08-06
(`wordwheel-coop-win.e2e.ts`). The short version: **a client can be connected,
report `SUBSCRIBED`, and still never receive `postgres_changes` events.** Not
slowly — never. Everything below is either measured or explicitly flagged as
unproven.

## The symptom

A game reaches a terminal state on the server, and the browser sitting on that
game never notices. The page keeps rendering mid-game: the board is live, the
"End game" button is still there, no verdict, no celebration.

In the spec that surfaced it, the team crossed its target rank, the row went
`play_state = 'won'` in Postgres, and the FE showed `Score 25/59` with an "End
game" button.

## It is LOST, not late

This is the whole point, and it was worth an hour to establish, because the two
look identical at a glance and lead to opposite fixes.

The spec waits 8s for the celebration. The obvious reading — "8s wasn't enough
on a loaded machine" — is **wrong**. Re-run with a 40-second budget:

```
PROBE RESULT: never within 40s — LOST, not late
```

So **raising the timeout fixes nothing.** It would only make the suite fail more
slowly, while removing the one signal that something is broken. If you find
yourself about to widen a realtime timeout, measure first: a late event arrives
at 9s, a lost one never arrives at all.

## Reproducing it

**The repro-turned-regression specs** (2026-08-06, supersede the
bare-restart recipe below): `e2e/realtime-deaf-window.e2e.ts`, two layers.

The **deterministic wiring guard** loads a game page normally and asserts
the factory's cause-tagged `refetch #N (attached)` console line follows the
data channel's `system ok` — no docker, no timing, red on every run if the
attach refetch is unwired (verified by planting; `useCommonGame`'s half is
pinned at the unit level).

The **engineered end-to-end test** lands a terminal write inside a real
deaf window: cap the tenant's CPU (a slow boot widens the window), restart
it, navigate at the moment it starts accepting joins, end the game
server-side, assert the verdict appears. Console-line guards keep the
timing honest — the write must land after the on-SUBSCRIBED refetch and
before `system ok`, else the attempt logs the window width it measured,
burns its game, and retries at a harder CPU cap. It was written
`test.fail`-pinned and reliably red (verdict never arrived); the
attach-refetch fix flipped it green — the event is still dropped by the
server, but the `system ok` refetch reads the terminal state — and the
marker came off. **It is best-effort by nature**: the window's width varies
with machine state (measured 5–22ms on one warmed-up boot vs seconds on
another, same CPU cap), so when no attempt can land inside it the test
SKIPS loudly with the measured widths instead of failing — an unhittable
window is an environment race, not an app bug, and the deterministic guard
above still covers the fix.

The original bare-restart recipe — kept because it's what the numbers below
came from:

```bash
docker restart supabase_realtime_codenames
# wait for healthy, then run any spec that needs a live event
npx playwright test e2e/wordwheel-coop-win.e2e.ts --grep "celebrates once"
```

**Caveat discovered later the same day: this recipe's determinism depends on
machine load.** The window's width tracks how slowly the tenant boots. On
the suite-loaded machine where this doc was first written it failed 3/3; on
an idle machine the same recipe passes 3/3, because the tenant boots fast
enough that the page's channels join after the window has already closed
(measured: an idle boot gives the first join batch ~1.3s of window, and
everyone joining later single-digit milliseconds — a browser page can't get
there in time). The CPU cap in the pinned spec exists precisely to take
machine load out of the equation.

Measured, three restarts, three runs:

| condition | result |
|---|---|
| first channel after a tenant restart | ✘ 9.3s / 9.2s / 9.3s (3 of 3) |
| second and third run, same tenant | ✓ 2.5s, 2.4s |
| full 173-spec suite, warm tenant | ✓ all pass, this spec at 2.5s |

**Only the first channel after a restart is deaf.** Everything afterwards is
fine, which is why this is so easy to mistake for flakiness.

## The mechanism

The local Realtime tenant **shuts itself down when nobody is connected**, and
boots again on the next connection. It says so plainly:

```
23:45:56.671 [info] Stop tenant realtime-dev because of no connected users
23:46:39.629 [info] Starting Elixir.Realtime.RateCounter for: {:channel, :joins, "realtime-dev"}
```

The grace period is on the order of 12–15 minutes after the last client leaves.
So this state is **reachable in ordinary local use** — the first run after a
coffee break pays for it, not just a hand-restarted container.

What we did *not* measure is the internals: the `postgres_changes` subscription
is registered per channel and matched against the WAL by a poller, and the
plausible story is that the poller isn't carrying that subscription yet when the
channel reports `SUBSCRIBED`. Plausible, not proven — treat the boundary as
"first channel after a boot", which is what's actually been observed.

**Update 2026-08-06 — the two-phase subscribe is real and measurable.**
Reading realtime-js 2.108.1: the client fires `SUBSCRIBED` on the **join ack**
(the tenant accepted the topic and assigned binding ids). Attaching those
bindings to the WAL poller is a *second, asynchronous phase* on the server,
and its outcome arrives later as a separate `system` message on the channel:

```
{ "message": "Subscribed to PostgreSQL", "status": "ok",
  "extension": "postgres_changes", "channel": "…" }
```

(or `status: "error"` when it fails). Measured against the local stack with a
bare supabase-js probe, **warm** tenant:

```
+39ms    STATUS: SUBSCRIBED
+3025ms  SYSTEM: Subscribed to PostgreSQL (status ok)
```

So even on a healthy tenant there is a ~3s window where the client believes
it's live but the poller attachment is unconfirmed. And the window is not a
formality — **events committed inside it are permanently lost**. Measured
with a second probe (tenant restarted, then one message committed every
300ms against a `common.messages` subscription):

```
+22ms     STATUS: SUBSCRIBED
+2223ms   SYSTEM: Subscribed to PostgreSQL (status ok)

committed  314…1824ms   → LOST      (6 of 6, every one before system-ok)
committed 2228…10009ms  → delivered (27 of 27, every one after)
```

The cut is exact: last loss at 1824ms, first delivery at 2228ms, `system ok`
at 2223ms. So "the first channel after a boot is deaf" refines to: **every
fresh channel has a multi-second deaf window between `SUBSCRIBED` and
`system ok`, and an event committed in that window is dropped, not
delayed.** This also explains why most specs (and most real play) survive:
the refetch-on-any-event hooks heal a mid-window loss at the *next*
delivered event — the permanent damage is when the lost event is the LAST
one (a coop win, an opponent's final move), which is exactly the shape of
every observed failure.

Until 2026-08-06 nothing in the app listened for the `system` message — a
deaf-window channel, an errored channel, and a healthy one looked identical.
Now every channel logs it (see Instrumentation below).

Two things that are NOT the cause, both checked and cleared:

- **Subscribe latency.** A cold tenant reports `SUBSCRIBED` in 25ms, a warm one
  in 15ms. The join is not slow; it's the events that never come.
- **The realtime publication.** `wordwheel.found_words`, `wordwheel.games` and
  `common.games` are all in `supabase_realtime`. A missing table there kills the
  whole subscription silently ([supabase.md](supabase.md)), so it's always worth
  ruling out first — but it was intact here.

## Why the app couldn't recover — and the fix

`useCommonGame` refetches on every `SUBSCRIBED`, which is the right defence
against a *reconnect*: come back, re-read, catch up. It did not help here,
because **`SUBSCRIBED` already fired** — before the channel could carry events.
The refetch ran, saw a game still in progress, and that was the last time this
client learned anything. This was a real player-facing bug, not only a test
artifact: a player whose client connected at the wrong moment saw a game that
quietly stopped updating — their partner's moves never arrived — with nothing
on screen suggesting a problem.

**The fix (2026-08-06): refetch again when the attach is confirmed.** The
`system` "Subscribed to PostgreSQL" message is the missing signal — it means
the WAL poller really carries this channel's subscription, so a re-read at
that moment closes the window: anything committed during the gap is picked up
by the refetch, and everything after it arrives as events. The helper is
[`common/lib/supabase/postgresAttached.ts`](../src/common/lib/supabase/postgresAttached.ts)
(`onPostgresAttached(channel, cb)`), and every postgres_changes consumer
wires it in next to its SUBSCRIBED refetch: the `useRealtimeRefetch` factory
(all pattern-A game hooks), `useCommonGame`, the ClubPage games list,
`useGameInvitations`, `useClubChat`, `useScratchpad`, connections' `useGame`,
and crosswords' `useCells`. Like SUBSCRIBED, the confirmation re-fires on
every rejoin, so reconnects keep the same protection. The regression test
below flipped from red to green on exactly this change.

## Instrumentation (2026-08-06)

Every Realtime channel in the app is instrumented centrally — `supabase.ts`
wraps the `supabase.channel()` factory with
`common/lib/supabase/realtimeDiag.ts`, so all fifteen games' data channels,
the game/club rooms, chat, presence, and scratchpad are covered without
per-hook wiring. Always-on console lines (low-frequency by design):

| line | meaning |
|---|---|
| `[rt …] <topic> — status SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED` | every subscribe-status transition; failures are `console.warn` |
| `[rt …] <topic> — system ok: Subscribed to PostgreSQL` | **the poller really carries this channel's subscription** — the all-clear |
| `[rt …] <topic> — event UPDATE common.games` | a delivered postgres-changes event (payload `errors` surfaced when set) |
| `[rt …] <topic> — broadcast "manualPause"` | a delivered broadcast |
| `[rt …] <topic> — refetch #3 (event)` | `useRealtimeRefetch` ran its load, and why (`mount` / `subscribed` / `event`) |
| `[rt …] game:<id> — load #2: play_state=playing terminal=false players=2` | what `useCommonGame`'s load actually saw |
| `[rt …] <topic> — unsubscribing / teardown ok` | deliberate teardown — distinguishes "left" from "went deaf" |
| `[rt …] socket — heartbeat timeout/disconnected` | the socket itself is in trouble (routine `sent`/`ok` pulses are not logged) |

**Reading the trail:** healthy is `status SUBSCRIBED` → `system ok` (~2–3s
apart even on a healthy tenant — that gap IS the deaf window; events
committed between the two lines are lost). A channel with `SUBSCRIBED` and
**no** `system ok` ever is fully deaf. A stale-looking client whose last
lines are a `(subscribed)` refetch and a `system ok` — with no `(event)`
refetch after a peer's move — lost that move inside the window.

For deep debugging in a deployed browser there is a verbose mode — the raw
realtime-js socket log (every push/receive/heartbeat):

```js
localStorage.setItem('rt-verbose', '1')   // then reload
localStorage.removeItem('rt-verbose')     // back to normal
```

## Which specs are sensitive

Most aren't, which is why one spec failed and 172 passed. A spec only notices if
it needs an event delivered **after** the page has loaded and subscribed:

- **Sensitive**: a state change made by someone else (or by the server, as a
  consequence of your move) that must appear without a reload — coop wins,
  presence-pause, peer narration, opponent counters.
- **Not sensitive**: anything the initial `load()` already covers, and anything
  driven by the caller's own RPC response.

## Diagnosing the next one

When a realtime-dependent spec fails, before assuming flake:

1. **Check whether the event was lost or late.** Re-run with a much longer
   timeout. Late is a timing problem; lost is this.
2. **Check the tenant's lifecycle around the failure time:**
   ```bash
   docker logs supabase_realtime_codenames 2>&1 \
     | grep -E "Stop tenant|:channel, :joins"
   ```
   A `Stop tenant` / start pair just before the failure is the signature.
3. **Check the server actually did its half.** Query `common.games.play_state`
   for the game the run left behind. If it's terminal, the bug is in delivery,
   not in the game logic — which immediately rules out most of the code.
4. **Check the publication** (see above) if *every* update is missing rather
   than one.

## What is NOT established

Being straight about the limits of this:

- The **original failure in a full-suite run has not been tied to a tenant
  restart.** 172 specs passed before it, with clients connected throughout,
  which argues against the tenant having shut down mid-run. The reproduction
  above is real and deterministic, but it may be one route to a lost event
  rather than the only one — a narrow subscription/WAL race could produce the
  same signature with the tenant up the whole time. (The measured
  SUBSCRIBED→`system ok` deaf window is exactly such a race, and it exists on
  a warm tenant too — so a full-suite failure no longer needs a tenant
  restart to be explained: it needs an event committed within ~2–3s of the
  page's subscribe.)
- Whether the window is the SAME width on hosted (prod) Realtime as on the
  local stack has not been measured — only that the mechanism (join ack ≠
  poller attachment, confirmed by the `system` message) is protocol-level,
  not a local-stack artifact.

So: the mechanism below the "first channel after a boot" boundary is a
hypothesis, and a failure that doesn't show a `Stop tenant` in the logs is not
explained by this document.

## What was deliberately not changed

- **The spec's 8s timeout stays.** It is not too tight; the event never comes.
- **No retry was added to the Playwright config.** Retries would paper over a
  reproducible bug.
- **The spec itself is correct** and was left alone.
