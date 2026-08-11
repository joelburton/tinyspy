# server-error-keys branch — review findings (2026-08-12)

A working document: the verified findings from the multi-agent code review of
the `server-error-keys` branch (20 commits, `9523ae05`, diffed against local
main `5de8039e`). **Delete this file once the findings are worked** — durable
decisions move into docs/supabase.md → Server errors and docs/ui.md → Faults.

Review shape: 33 agents — one finder per correctness angle plus cleanup
angles, then an independent adversarial verifier for every distinct
(file, line) candidate. All 10 findings below are CONFIRMED (survived a
verifier told to refute them). Nothing here has been fixed; the working tree
at review time held only the one-line `no-required-words` copy edit.

## The rules the branch was reviewed against

Stated by Joel, 2026-08-12 — these are the system's ground truth:

- SQL never embeds player-facing text; it raises `key|detail|…` shapes that
  are self-evidently machine text if they leak.
- A **pill** is gameplay information and carries a tone. A **fault** is an
  unexpected problem, has no tone (never neutral/friendly), and never wears
  the pill look.
- Any raw DB text appearing in a **pill** is a defect in our work, full stop.
- Faults come in three kinds with different translation rules:
  1. **Environmental** (server down, network dead) — happen with zero bugs;
     translated, so no raw browser prose. "Server; try refresh" belongs here
     and ONLY here.
  2. **"Impossible"** (reachable only through an FE bug) — no translation;
     the raw key on screen IS the message: it announces "bug".
  3. **Player-reachable setup failures** (boggle constraints too tight,
     spellingbee letters with too few words) — in the **setup form**: a
     form-validation error (player fixes the form, retries). From **in-game
     New game** with a setup that already built a game once: a **fault,
     carrying the real message** — never flattened to a generic
     environmental line.
- Edge-function error returns are part of the player-facing surface. Their
  TEXT is not to be rewritten by default — where a message is lost or
  misfiled, report it; wording changes are Joel's call.

## Verdict in one paragraph

The core held: zero findings against the SQL conversion itself — the 418
raises, the key format, the copy table, and the pill/tone rules all survived
adversarial review. Every confirmed defect sits in the FE classification seam
(six findings) or in the guard that was supposed to prove that seam complete
(two findings), plus two cleanup findings naming the shared-layer fixes.
Fixes should land in the shared layer, not as per-game patches.

## Correctness findings

### 1. In-game New game pills the raw server string — seven sites

`src/letterboxed/components/PlayArea.tsx:374` (in this diff), plus
`scrabble:459` (in this diff) and `spellingbee:350`, `boggle:327`,
`waffle:292`, `wordwheel:355`, `wordiply:218` (pre-existing on main, never
converted). All render `New game failed: ${res.error}` in a normal pill,
bypassing the classifier entirely.

Failure: spellingbee New game gets `no-required-words|` back → the player
sees a normal error pill reading `New game failed: no-required-words|` — raw
DB key text in a pill, no fault styling, no `[db]` log. On a dead connection
the same sites pill functions-js's generic non-2xx prose.

### 2. crosswords `useCells` errors reach a pill raw — and the guard's allowlist justification is false

`src/crosswords/components/PlayArea.tsx:243`. setCell/setMark failures render
`useCells`' raw `error.message` in a sticky pill. The `noRawServerMessage`
ALLOWED entry for useCells.ts claims "returns the message to its caller,
which classifies" — the caller never classifies.

Failure: in compete, a rival finishes while you're mid-word; your in-flight
`set_cell` raises `game-not-in-play|` and the pill shows the raw key instead
of the ERROR_COPY info pill "Game over". Highest per-keystroke RPC rate in
the app, so the most likely place to hit it.

### 3. strands pills raw transport prose via a renamed error variable

`src/strands/components/PlayArea.tsx:390`. `lookupError.message` reaches a
pill; the guard's regex `\berr(or)?\??\.message\b` only matches identifiers
named exactly `err`/`error`, so renamed variables are invisible to it.

Failure: New game on a dropped connection → the pill reads
`TypeError: Load failed` — raw browser prose, the exact string the redesign
exists to eliminate — and the repo-wide guard stays green.

### 4. WordEditDialog: a missing row reads as a transport fault

`src/common/components/definitions/WordEditDialog.tsx:88`. The load path
collapses `err || !data` into `failureText(err, 'dictionary')`; when the
query succeeds but `maybeSingle()` finds no row, `err` is null and
classifies as transport.

Failure: an editor opens Edit on a word another editor just deleted → the
dialog says "dictionary: Server; try refresh" and logs a `[db]` FAULT,
though nothing failed. Pre-branch behavior showed "No such word: <word>".

### 5. stackdown's hint/spoiler action labels are swapped

`src/stackdown/components/PlayArea.tsx:271` and `:294`. `reveal_next_word`
(the spoiler) is labeled `'hint'`; `reveal_next_hint` is labeled
`'spoiler'`. A failed Spoiler faults as `hint|…` on screen and in the `[db]`
line, sending the debugger down the wrong path.

### 6. scrabble's sink re-stamps `sticky`, defeating the manual fault contract

`src/scrabble/components/PlayArea.tsx:114`. The local-feedback wrapper
overrides every message with `mode: { kind: 'sticky' }`; `failureMessage`
deliberately sets `manual` on faults so they survive until dismissed.

Failure: a play_word fault renders bare-red but sticky — replaced by the
very next feedback event, vanishing mid-read. Every callRpc-based game keeps
the same fault up until its × is clicked.

### 7. The guard cannot see string-channel bypasses

`src/noRawServerMessage.test.ts:78`. The detection regex only matches
`.message` property reads, so `New game failed: ${res.error}` (where
`res.error` is already a bare string carrying the server key) passes
untouched — the exact class the test's docstring says it catches. Planting
`showLocalFeedback('error', res.error)` in any PlayArea does not fail it.

## Cleanup findings (the shared-layer fixes)

### 8. `classifyFailure` has no representation for "the server answered, but codelessly"

`src/common/lib/game/serverError.ts:93`. Five call sites hand-build a
codeless `{ message }` from an edge-fn body (SetupGameDialog:190,
useDefinition:83, codenamesduet CluePanel:270, crosswords PlayArea:475,
scrabble suggest:310) and each independently misfiles prose answers as
transport — "X: Server; try refresh" replacing a real answer like boggle's
"No board met those constraints — please relax them."

Fix direction: a shared `callEdgeFn` wrapper (sibling to `callRpc`) or a
CallError marker meaning "server answered", routing codeless non-keys to the
fault path with the raw text preserved. NOT per-site patches, and NOT
rewriting the edge functions' own message text without Joel's sign-off.

### 9. The guard's allowlist is file-granular

`src/noRawServerMessage.test.ts:37`. One justified `.message` read exempts
every other line in that file forever — scrabble PlayArea's entry currently
shields the unrelated raw-pill sink at its line 459. A per-line or
per-pattern allowlist (path + matching snippet) keeps each exemption as
narrow as its justification.

### 10. `useStandardGameActions.showError` is still a string

`src/common/hooks/game/useStandardGameActions.ts:86`. The shared
End/Concede/Replay trio flattens every failure to text, so a fault on those
actions wears an ordinary pill in all twelve consuming games. Widening
`showError` to `(msg: GenericFeedbackMsg) => void` closes the gap once for
the roster. (`failureText`'s own docstring records this as the known gap.)

## Working notes

- Findings 1, 7, 9 interlock: the bypasses exist (1), the guard can't see
  them (7), and the allowlist hides one more (9). Fixing 1 without 7 and 9
  leaves the door open for the same class to return.
- Finding 8 is the root cause of finding 1's worst rendering and of the
  setup-dialog misfiles; fix it first and the call sites become one-liners.
- Every fix should be verified by planting (see memory: a check that can't
  fail is worse than none).
- Full behavior-matrix discipline for any work here: input class (keyed with
  copy / keyed without / prose with SQLSTATE / codeless prose / transport /
  malformed 200) × surface (board move, End/Concede/Restart, New game, setup
  form, suggest panel) → exact on-screen text + look + logged-or-not, before
  and after.
