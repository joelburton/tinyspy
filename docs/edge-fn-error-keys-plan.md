# Edge-function fe-error-keys — conversion plan (2026-08-12)

**STATUS: conversion COMPLETE, same day — all thirteen functions done, the
guard's left-to-do list is empty, durable rules recorded in docs/supabase.md →
"Edge functions speak the same language" and docs/ui.md → Faults.** What
remains live in this doc: the fault-MODAL follow-up round (below), and the
scrabble-suggest display question deferred to it. Delete the rest of this doc
whenever convenient.

A working document (delete once worked; durable rules land in
docs/supabase.md → Server errors). Agreed with Joel 2026-08-12, following the
server-error-keys branch review (docs/server-error-keys-review.md).

## Terminology

- **fe-error-key** — the `key|detail1|detail2|` format (kebab-case key, always
  ends with `|`). The term replaces the ambiguous "key"/"key-shaped".
- **code** — the SQLSTATE (five alphanumeric chars, e.g. `P0001`, `42501`).

## The agreed design (pattern B)

1. **Every edge-function error return carries an fe-error-key** in the same
   JSON envelope as today: `{ error: '<fe-error-key>', code?: '<SQLSTATE>' }`,
   with the existing HTTP statuses. The FE owns every player-facing word.
2. **`code` is included whenever the error came from the DB** — the relay
   points (`invokeCreateGame`, membership-check RPCs) have `error.code` in
   hand and currently drop it. Edge-authored errors have no SQLSTATE; the
   field is simply absent.
3. **Catch-alls wrap too**: `edge-internal|<message>|` — so even an uncaught
   exception comes back key-shaped. After this, a non-key response from an
   edge function can ONLY be environmental (network death, gateway garbage),
   which is what finally makes "Server; try refresh" honest by construction.
4. **One shared FE wrapper** (`callEdgeFn`, sibling to `callRpc`) owns invoke +
   unwrap + classification. Call sites never hand-build `{ message }` objects.
   The wrapper knows "unwrap succeeded = the server answered" and carries the
   returned `code` through, so `classifyFailure` sees edge-fn failures exactly
   as it sees direct RPC failures. Malformed 200s get `edge-internal|…|` minted
   FE-side and logged.
5. **`error || !data` convention** (applies as each site is touched):
   the classifier is only ever handed a real error object. Row-required reads
   use `.single()` (no-row becomes a real error+code; drop `|| !data`);
   no-row-is-an-answer reads use `.maybeSingle()` and handle `data === null`
   as a DOMAIN case with its own copy — never `classifyFailure(null)`.
6. **Guards, verified by planting**: a serverErrorKeys-style test over
   `supabase/functions/` — every `json({ error: … })` literal must be an
   fe-error-key. Plus the noRawServerMessage hardening from the review
   (string-channel detection, per-line allowlist).

## Inventory: every error site, its category, its fe-error-key

Categories are Joel's taxonomy: **ENV** (environmental — translated),
**IMP** ("impossible" without an FE bug — key only, renders as fault),
**REACH** (player-reachable — copy in the setup form; fault-with-copy from
in-game New game). **RELAY** = the DB's own fe-error-key passes through
(+ now `code`); already covered by ERROR_COPY decisions.

### Shared (`_shared/startGame.ts`)

| site | current text | category | fe-error-key |
|---|---|---|---|
| :78–:90 | `target_club (uuid string) required` etc. (4 sites) | IMP | `bad-request\|<field>\|` |
| :95 | `authorization required` | IMP | reuse `not-authenticated\|` |
| :135 | relays `error.message` from create_game | RELAY | pass through + add `code` |
| :140 | `create_game returned no row` | IMP | `edge-internal\|create_game returned no row\|` |

### Build-board functions (spellingbee, wordwheel, boggle, waffle, wordiply, letterboxed)

| site | current text | category | fe-error-key |
|---|---|---|---|
| sb/ww validateCustomLetters (5 messages: center a–z / six (eight) letters / all different / no s) | prose | REACH* | `bad-custom-letters\|<which>\|` |
| sb:326, ww:314 | `those letters yield no required words at difficulty N — try a lower required difficulty or different letters` | REACH | reuse `no-required-words\|N\|` — the SQL backstop's key; copy exists ("No words for those letters") |
| ww:333 | `no pangram seeds at required difficulty N` | REACH | `no-pangram-seeds\|N\|` (copy needed) |
| ww:351 | `no unique-letter boards at required difficulty N — try a higher difficulty or turn off "unique letters only"` | REACH | `no-unique-letter-boards\|N\|` (copy needed) |
| boggle:92 | `No board met those constraints — please relax them.` | REACH | `no-board-fits\|` (copy needed) |
| boggle:65–79, waffle:117, lb:184 | dice_set/band/ladder/difficulty range checks | IMP | reuse `bad-band\|` where it's a band; `bad-request\|<field>\|` otherwise |
| sb:350, ww:359 | `no eligible pangram seeds after applying overlap cap` | IMP | `overlap-cap-exhausted\|` (shared: same rule in both fns) |
| sb:390, ww:404 | `could not build a board with ≥30/15 required words` | IMP | `quality-gate-failed\|<min>\|` (shared) |
| waffle:125 | `no candidate words for band N` | IMP† | `no-candidate-words\|N\|` |
| waffle:132 | `could not build a band-N board` | IMP | `board-attempts-exhausted\|N\|` |
| wordiply:209 | `could not build a wordiply board — try again or a different difficulty` | IMP | `wordiply-build-failed\|` |
| lb:200 | `could not build a board in N attempts` | IMP | `board-attempts-exhausted\|N\|` (shared with waffle:132: same rule — generation retries ran out) |
| lb:211 | `built an unsolvable board` | IMP | `unsolvable-board\|` |

Distinct keys per RULE, not one `board-build-failed|cause|` umbrella — decided
2026-08-12: a cause enum in a detail slot is a second, unlintable taxonomy;
the key IS the taxonomy (matching how the SQL sweep minted keys). Keys are
shared across functions only when the rule is genuinely the same.
| all catch-alls | `String(e.message)` | — | `edge-internal\|<message>\|` |

\* RESOLVED 2026-08-12: the FE pre-validates (`customLettersError` in
spellingbee/lib/setup.ts:84, wired through the manifest's validate; wordwheel
likewise), so `bad-custom-letters` is **IMP** — key only, no copy.
† waffle:125 could be REACH if a band can legitimately have no candidates in a
healthy DB — believed IMP (data/config problem). Confirm.

### AI functions (codenamesduet-suggest-clue, crosswords-explain-clue, scrabble-suggest-move, scrabble-ai-move)

| site | current text | category | fe-error-key |
|---|---|---|---|
| method/args/auth checks | `POST only`, `gameId required`, `authorization required`, `invalid or expired session` | IMP | `bad-method\|`, `bad-request\|<field>\|`, `not-authenticated\|` |
| membership 403s | relays `error.message` | RELAY | pass through + `code` |
| `ANTHROPIC_API_KEY not configured…` | config | IMP | `ai-unconfigured\|` |
| `the model declined…` | model refusal | ENV-ish | `ai-declined\|` (copy needed — panel text) |
| `the model response was truncated; try again` | | ENV-ish | `ai-truncated\|` (copy needed) |
| `model did not return a structured suggestion` / `malformed suggestion JSON` / `returned no explanation` | | IMP | `ai-malformed\|` |
| scrabble-ai `fail(where, message)` | relays RPC messages | RELAY | pass through + `code`; non-RPC → `edge-internal\|…\|` |

The AI panels (CluePanel, crosswords explain, suggest panel) render these in
their own message areas — they'd translate via ERROR_COPY like any sink.
Wording for `ai-*` copy = Joel's call; current sentences carried as proposals.

### common-define

| site | current text | category | fe-error-key |
|---|---|---|---|
| args/auth | as above | IMP | `bad-request\|word\|`, `not-authenticated\|` |
| :164 | `dictionary source returned <status>` | ENV-ish (external API) | `dictionary-source-failed\|<status>\|` (copy: current fallback behavior to review) |
| :171 | `dictionary lookup failed: …` | ENV-ish | `dictionary-source-failed\|\|` |

### crosswords imports (nyt, guardian)

| site | current text | category | fe-error-key |
|---|---|---|---|
| body/args checks incl. `setup.date must be YYYY-MM-DD`, `setup.series must be…` | IMP | `bad-request\|<field>\|` |
| NytAuthError | bad/expired NYT-S cookie (player-supplied) | REACH | `nyt-auth\|` (copy needed) |
| NytNoPuzzleError | no puzzle for that date (player-picked) | REACH | `nyt-no-puzzle\|<date>\|` (copy needed) |
| NytFetchError / GuardianFetchError | upstream unreachable | ENV-ish | `nyt-fetch\|` / `guardian-fetch\|` (copy needed) |
| GuardianConvertError | puzzle didn't convert | IMP | `guardian-convert\|<detail>\|` |
| `create_game returned no row` | | IMP | `edge-internal\|…\|` |

## FE work items (from the review, integrated)

1. `callEdgeFn` shared wrapper + `code` passthrough (dissolves finding 8's five
   hand-built `{message}` sites: SetupGameDialog, useDefinition, CluePanel,
   crosswords explain, scrabble suggest).
2. The seven in-game New-game sites → fault-always via the classifier
   (finding 1), carrying copy words where they exist.
3. `useStandardGameActions.showError` widened to `GenericFeedbackMsg`
   (finding 10).
4. crosswords useCells caller classifies (finding 3); strands `lookupError`
   classified (finding 4); WordEditDialog `.maybeSingle()` no-row → domain
   copy `No such word: <word>` (finding 5); stackdown hint/spoiler labels
   un-swapped (finding 6); scrabble sink stops overriding `mode` (finding 7).
5. Guard hardening (findings 7's regex + 9's per-line allowlist) + the new
   edge-fn key-shape guard — every guard verified by planting.

## Follow-up round (after the conversions): the fault MODAL

Agreed 2026-08-12. Faults stop rendering in the below-board slot (too small —
scrabble's especially — and ellipsis fights the read-it-aloud goal) and pop a
MODAL instead: room for the action, the full unellipsised message, and a
possible copy-details affordance. Rules:

- **Faults only** — feedback pills and form validation are untouched.
- Initially a modal for EVERY fault, simplest behavior; refinements (e.g.
  replace-don't-stack under a per-keystroke fault storm) can come later.
- A fault during SETUP-DIALOG submit also gets the modal (the dialog's red
  line stays for validation only).
- scrabble's AI-suggest errors: discuss at scrabble's conversion; Joel leans
  fault-dialog for those too.
- Implementation shape: route at the chokepoint (the shared pill renderer's
  `fault: true` branch → a single global fault-modal host, ToastHost-style),
  so all fifteen games convert with no per-game edits; `failureMessage` /
  `faultMessage` unchanged. Behavior-matrix table first, per
  [[error-ux-behavior-matrix]].

## Open points for Joel

- Copy for the REACH keys (proposals to be presented verbatim before any
  wording lands): `no-pangram-seeds`, `no-unique-letter-boards`,
  `no-board-fits`, `bad-custom-letters` (if reachable), `nyt-auth`,
  `nyt-no-puzzle`, `nyt-fetch`/`guardian-fetch`, the `ai-*` panel texts,
  `dictionary-source-failed`.
- Verify whether the setup forms pre-validate custom letters (decides
  REACH vs IMP for `bad-custom-letters`).
- Confirm waffle:125 (`no candidate words for band N`) is IMP not REACH.
- ~~The `board-build-failed` consolidation~~ RESOLVED 2026-08-12: distinct
  keys per rule (see the builders table); details carry data only, never a
  cause enum.
