# Peer-feedback audit — 2026-07-01

> **Status: historical, partially acted on.** The consolidation this audit was
> taken to plan (the bucket-A seen-set unification / §1.1) is **complete** — see
> "Resolved — the consolidation (Stage 3)" at the bottom. Of the peer-feedback
> **gaps** it catalogs, only boggle's (the GAP 1 header-less coop game) has since
> been closed; the rest of the "Gap summary" (scrabble both modes, bananagrams,
> the silent compete strips in connections/stackdown, waffle-coop, wordle-coop)
> remains **open** design surface. Kept as the peer-feedback map + a record.

A whole-repo audit of **peer feedback**: every UI signal that tells the viewing
player what *another* player just did or how they're doing. Taken while planning
a consolidation of the peer-narration code (the "seen-set bootstrap" that three
games get wrong — see [`code-review-2026-07-01.md` §1.1](code-review-2026-07-01.md)).

**Method.** One careful reader per game, each reading the game's `PlayArea` +
hooks *in full* (feedback is added under many different names — `feedback.show`,
`showFeedback`, `setFeedback`, `flashAction`, `useResultFlash`, per-game
`usePeerFeedback` — so a grep misses things). Every row carries a `file:line`.

> **Point-in-time snapshot.** Line numbers drift; re-confirm before acting.

## The governing principle (agreed 2026-07-01)

**Peer feedback belongs in the GLOBAL feedback area (the GamePage header pill).
The LOCAL below-board pill is for the player's OWN move / own state.** Persistent
ambient surfaces (OpponentStrip, PeersStrip, the shared WordList, the turn log)
are a separate, complementary layer and stay as-is.

Coop and compete deliberately differ in *what* they say:

- **coop → narrate the move.** Peers' actual actions are visible (coop RLS shows
  everyone's rows), so we say what happened: "moth found APPLE".
- **compete → convey threat level.** Peers' moves are RLS-hidden, so we surface
  the competitively-meaningful signal only: a milestone or a rising aggregate —
  "moth reached Amazing", "moth solved it", "moth: 4 of 5".

## Three framing findings

1. **The code already matches the principle** — peer feedback goes to the header
   pill; the local pill is own-move only in *every* game. (The sole leak is
   scrabble's "Pre-play cleared: conflict", which reaches the local pill.)

2. **Three games never use the header channel at all** — **boggle, scrabble,
   bananagrams** don't destructure `ctx.feedback`. Their peer info is *only*
   ambient (a strip / the word list / the turn log); they fire **no transient
   peer narration**. These are the biggest gaps.

3. **coop = narrate / compete = threat-level is already the de-facto pattern**
   where peer feedback exists — but it's applied inconsistently, and two compete
   modes (connections, stackdown) have **no live peer signal at all** beyond a
   silently-ticking strip.

**Modes.** codenamesduet is **coop-only**; bananagrams is **compete-only** (solo
allowed). Every other game is a coop+compete sibling pair. → 18 gametype rows.

## How peer feedback is implemented today (three mechanisms)

- **A — transient seen-set** (coop move-narration): diff an append-only row list
  against a remembered `Set` of seen keys; fire a header pill per new row.
  Bootstrap silently on first load. *spellingbee-coop, stackdown-coop (hooks);
  wordle-coop, psychicnum-coop, connections-coop (inlined).*
- **B — transient delta** (compete threat-level + codenamesduet turn status):
  remember a per-key scalar (`Map<user, value>` or a single `prev` string) and
  fire on a transition. *waffle-compete, wordle-compete (solve), psychicnum-
  compete (count), spellingbee-compete (rank), codenamesduet (phase string).*
- **C — declarative surface** (no transient pill): render current peer state.
  *scrabble, boggle, bananagrams.*

Under the governing principle, **C is not a third way of doing peer feedback** —
it's "peer feedback missing" (+ a strip that stays). And **A is a special case
of B** (a Set is a `Map<key, present>`): both are "silently bootstrap, then diff
and fire". The seed-timing bug in §1.1 lived in that shared bootstrap.

> **Update — Stage 3 (2026-07-01):** bucket A is now unified. All five games
> (wordle coop+compete, psychicnum-coop, connections-coop, spellingbee-coop,
> stackdown-coop) route their event-stream narration through one shared
> `common/hooks/feedback/useGlobalFeedback.ts`, which owns the **one correct bootstrap**
> (gate before seed) — so **§1.1 is fixed** (no backlog replay; the first peer
> event of a fresh game fires; batched events all fire). The two per-game
> `usePeerFeedback` hooks (spellingbee, stackdown) are deleted; the three inline
> `announce*`/`lastSeenGuessIdRef` copies are gone. Bucket B (delta detectors:
> psychicnum-compete count, spellingbee-compete rank, waffle-compete milestone,
> codenamesduet phase) stays hand-rolled, as planned. A 7-case regression test
> (`useGlobalFeedback.test.ts`) covers both §1.1 variants; five independent
> re-audits confirmed no message/tone/surface changed.

## The inventory

Surface key: **Head**=global header pill · **Local**=below-board pill ·
**Strip**=Opponent/PeersStrip · **List**=shared WordList · **Log**=turn log ·
**Board**=board tiles/frames · **Info**=info-column line/banner · **†**=terminal-only.

| Gametype | Peer signal (text / indicator) | Fires when | Surface | Tone |
|---|---|---|---|---|
| **codenamesduet · coop** | "{peer} is writing a clue" | peer composing (you guess) | Head | neutral |
| | "{peer} is making guesses" | peer guessing your clue | Head | neutral |
| | "{peer} is waiting for your clue / turn" | peer idle on you | Head | neutral |
| | partner's clue "{n} {WORD}" | clue lands | Log + Info | — |
| | partner's guess outcome (agent/neutral/assassin) | peer guesses | Board + Log | color |
| | "{peer} found all their agents…" | peer finishes agents | Info | — |
| | *(gap)* partner's guess result as a pill | — | none | — |
| **psychicnum · coop** | "{name} found a secret — {WORD}!" | peer correct | Head | success |
| | "{name} guessed {WORD} — not it" | peer wrong | Head | error |
| | "{name} asked for a hint" / "revealed a word" | peer helper | Head | warning |
| | peer guesses paint board + log rows | live | Board + Log | color |
| **psychicnum · compete** | "{name} guessed a secret word" (count only) | secrets_found ↑ | Head | success |
| | "Found: ● You:n · ● Bea:m" | live | Strip | — |
| | "{winner} won" † | race ends | Info/Modal † | lost |
| | *(gaps)* opponent hints/reveals, wrong guesses | — | silent | — |
| **connections · coop** | "{name} found {CATEGORY}!" | peer correct | Head | success |
| | "{name} was one away" | peer one-away | Head | near |
| | "{name} guessed wrong" | peer wrong | Head | error |
| | peer tile-selection frame + log rows | live | Board + Log | color |
| **connections · compete** | "Found: ● You:n · ● Bea:m" (matched) | live | Strip | — |
| | "Beaten to the punch" / winner † | ends | Info/Modal † | lost |
| | *(BIG gap)* opponent solves / mistakes / elimination | — | strip only | — |
| **spellingbee · coop** | "{name} found {WORD}" | peer find | Head | success |
| | "🐝 {name} found a pangram — {WORD}!" | peer pangram | Head | success |
| | finder-colored WordList row + recent-underline | live | List | color |
| **spellingbee · compete** | "{name} reached {RANK}" *(threat-level)* | opponent rank ↑ | Head | info |
| | "Rank: ● You · ● Bea" | live | Strip | — |
| | "{winner} beat you to {rank}" † + peer-word reveal † | ends | Modal/List † | lost |
| **wordle · coop** | "{name} guessed {WORD}" | peer accepted guess | Head | neutral |
| | shared board (unattributed) + "Team" log rows | live | Board + Log | color |
| | *(gap)* no "teammate solved it!" moment | — | neutral pill only | — |
| **wordle · compete** | "{name} solved it" *(only peer event)* | opponent solves | Head | success |
| | "Guesses: ● You · ● Bea" | live | Strip | — |
| | opponent board hidden→revealed † / "Opponent won" † | ends | Log/Modal † | lost |
| **stackdown · coop** | "{name} found {WORD}" (+green WordEntry flash) | peer valid | Head + Board | success |
| | "{name} tried {WORD} — not a word" (+red flash) | peer invalid | Head + Board | error |
| | "{name} revealed a hint / a word" | peer helper | Head | warning |
| | teammate log rows + tiles leave shared board | live | Log + Board | color |
| **stackdown · compete** | "Found: ● You · ● Bea ✓" (count + solved ✓) | live | Strip | — |
| | "Beaten to the clear" / winner † | ends | Info/Modal † | lost |
| | *(BIG gap)* opponent finds / hints / solve | — | strip only | — |
| **waffle · coop** | per-teammate swap rows "S(A1)↔E(C2)" | peer swaps | Log | neutral |
| | *(gap)* no header pill, **no OpponentStrip** in coop | — | silent | — |
| **waffle · compete** | "{name} solved it" *(milestone)* | opponent solves | Head | success |
| | "{name} is out of swaps" | opponent exhausts | Head | warning |
| | "Swaps: ● You · ● Bea ✓/✗" | live | Strip | — |
| | "Beaten on swaps" / winner † | ends | Info/Modal † | lost |
| **boggle · coop** | finder-colored WordList row + recent-underline | peer find | List | color |
| | team aggregate progress line | live | Info | — |
| | *(gap flagged by Joel)* **no pill, no header, no log** | — | List only | — |
| **boggle · compete** | "Score: ● You · ● Bea" | live | Strip | — |
| | peer-word reveal † / "{winner} won" † | ends | List/Modal † | lost |
| | *(gap)* mid-game opponent activity | — | strip only | — |
| **scrabble · coop** | team-score line + peer plays "+{score} {WORD}" in log | live | Info + Log | — |
| | *(gap)* teammate commit silently voids your staged tiles | — | none | — |
| **scrabble · compete** | "Turn: ● {name}" / "Your turn" | turn flips | Info | — |
| | "Score: ● You · ● Bea" | live | Strip | — |
| | **"Pre-play cleared: conflict"** *(only peer→local pill in repo)* | opponent plays onto your staged square | Local | warning |
| | peer plays in log / "{name} won" † | live/ends | Log/Modal † | lost |
| | *(gap)* ordinary opponent word/pass/swap | — | ambient only | — |
| **bananagrams · compete** | "Tiles left" per-opponent count, closest-first, 'out'/'done!' | live | Strip | — |
| | "{winner} went out — Bananas!" † | ends | Local † | lost |
| | *(gaps)* peer peel / dump / **concede** | — | strip only | — |

**Local feedback area today (all games):** own-move results + own errors + own
terminal verdict. Only exception where a peer event reaches it: scrabble's
"Pre-play cleared: conflict".

## Gap summary (where peer feedback is missing or thin)

- **No transient peer narration at all:** boggle (coop + compete), scrabble
  (both), bananagrams. (The header-less three.)
- **compete modes with no live peer signal but a silent strip:** connections,
  stackdown. (wordle/waffle/psychicnum/spellingbee compete each have exactly one
  milestone pill.)
- **coop narration holes:** waffle-coop (log only, no pill, no strip),
  wordle-coop (no distinct "teammate solved it!"), scrabble-coop (none).
- **Silent state-loss (not feedback, but adjacent):** scrabble — a teammate's
  coop commit clears your staged tiles + reorders your rack with no explanation.

## Resolved — the consolidation (Stage 3)

Done. `common/hooks/feedback/useGlobalFeedback.ts` backs every bucket-A game's peer pill:
`{ enabled, items, keyOf, messageFor, globalFeedback }` — the caller supplies the
gate + the message; the hook owns the seen-set + the one correct silent bootstrap
(gate before seed), killing §1.1. We scoped it to the coop **event-stream** flavor
only; the compete **snapshot-delta** signals (bucket B) stayed hand-rolled, since
folding them in would be false consolidation of a genuinely different mechanism.
The declarative strips/lists/logs are orthogonal and untouched.
