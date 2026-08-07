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

Deterministic:

```bash
docker restart supabase_realtime_codenames
# wait for healthy, then run any spec that needs a live event
npx playwright test e2e/wordwheel-coop-win.e2e.ts --grep "celebrates once"
```

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

Two things that are NOT the cause, both checked and cleared:

- **Subscribe latency.** A cold tenant reports `SUBSCRIBED` in 25ms, a warm one
  in 15ms. The join is not slow; it's the events that never come.
- **The realtime publication.** `wordwheel.found_words`, `wordwheel.games` and
  `common.games` are all in `supabase_realtime`. A missing table there kills the
  whole subscription silently ([supabase.md](supabase.md)), so it's always worth
  ruling out first — but it was intact here.

## Why the app can't recover

`useCommonGame` refetches on every `SUBSCRIBED`, which is the right defence
against a *reconnect*: come back, re-read, catch up. It does not help here,
because **`SUBSCRIBED` already fired** — before the channel could carry events.
The refetch ran, saw a game still in progress, and that was the last time this
client learned anything.

There is no heartbeat, no staleness check, and no post-move re-read. A client in
this state stays deaf until something else remounts the channel.

**This is a real player-facing risk, not only a test artifact.** A player whose
client connects at the wrong moment sees a game that quietly stops updating —
their partner's moves never arrive — with nothing on screen suggesting a
problem. Nothing has been done about it; see
[deferred.md](deferred.md) → Common.

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
  same signature with the tenant up the whole time.
- The internal reason the first channel is deaf is inferred, not measured.

So: the mechanism below the "first channel after a boot" boundary is a
hypothesis, and a failure that doesn't show a `Stop tenant` in the logs is not
explained by this document.

## What was deliberately not changed

- **The spec's 8s timeout stays.** It is not too tight; the event never comes.
- **No retry was added to the Playwright config.** Retries would paper over a
  reproducible bug.
- **The spec itself is correct** and was left alone.
