# The error system — results, rejections, and faults

**Status: EVERY ROSTER ENTRY IS CONVERTED — 157 of 157.**

**`ERROR_COPY` IS EMPTY.** Its last key, `game-not-in-play`, was raised only by
`end_game` and `submit_timeout`; converting those took it.

**And the DELETION it ended with is done too** — the sprint's last act, since
none of this could go until the roster emptied:

- `src/common/lib/game/errorCopy.ts` — the table
- `src/common/lib/game/serverError.ts` — the classifier that read it
- `src/common/lib/game/callRpc.ts` — the old call wrapper
- `src/guards/serverErrorKeys.test.ts` — the guard that kept the table honest

`callSiteShape.test.ts`'s hand-kept `CONVERTED` list went with them, and its
`!== 'ok'` report is a hard assertion now — which its own docstring said to do
the day the roster emptied. `useStandardGameActions.ts`, the one file that list
was waiting on, converted with the cross-cutting four.

The prose took a second pass (2026-09-02): the count here was wrong, and it was
**nine** comments naming the deleted files rather than four — in `FaultModal`,
`faultStore`, `genericPills`, `callEdgeFn`, `games.ts`, `useCells`,
`guards/README.md` and two letterboxed tests. `docs/envelopes.md` needed it too:
its opening still described the convention as being rolled out.

**What the cross-cutting four taught.** These four are the durable half, and
they already live in [docs/envelopes.md](../docs/envelopes.md) → "Four things the
roster conversion taught", in a fuller form with the guard for each. Kept here
because this is where they were learned; the doc is what to read:

- A raise that looks unreachable is usually a raise something ABOVE it is
  answering instead. All sixteen `replay_board`s, and six sites in the other
  two, gated on membership before checking the game existed — so a deleted
  game was told "You are not in this game". boggle and crosswords had no check
  at all and returned SILENT SUCCESS. `gameDeletedFirst.test.ts` holds the
  order now.
- A race whose `ERROR_COPY` tone was `noted` needs `constraint = 'noted'` at
  the raise; `race` alone reads as `warning`.
- A HELPER that raises with a constraint has no handler of its own, so every
  caller's catch must read `constraint_name`. `raiseCodes.test.ts` walks
  outward to check that.
- One code CAN serve many sites when it is one question asked in many schemas
  (`_raise_game_deleted`, `_raise_game_over`, `require_game_player`). What a
  code distinguishes is which question failed — not which file asked it.

---

**DONE 2026-09-01. FOUR names broke the per-area rhythm** — `concede`,
`end_game`, `replay_board` and `submit_timeout`, each ONE frontend path over
SIXTEEN SQL definitions, so each converted as a single commit touching every
game. They appear in several areas below, ticked.

The first three share `useStandardGameActions`. **`submit_timeout` shares
`makeRpcDispatcher`** — and so does `end_game`, which is why one shared function
covers two of the four. There is no per-game call site for either: each
`src/<game>/manifest.ts` just names the RPC.

**`submit_timeout` joins the family rather than converting per area** (Joel,
2026-09-01). It `returns void` in all sixteen schemas and every body is the same
three lines — a member check, a no-op when the game already ended, `_finish` —
so unlike `submit_word` there is no per-game answer shape worth designing
separately. Sixteen identical conversions scattered across sixteen commits buy
nothing that doing them together does not, and `end_game` has to be in that
commit anyway.

The roster had it wrong twice: it listed `submit_timeout` **once**, under
boggle, when it exists in all sixteen schemas, and it was not flagged. Both were
counting errors predating the areas.

**A fourth name breaks it the same way, through a HOOK rather than a
component.** `useWordSubmit`'s `commit` callback is typed
`Promise<{ error: { message, code? } | null }>` and FOUR games pass one — boggle
`submit_word`, spellingbee `submit_word`, wordwheel `submit_word`, wordiply
`submit_guess`. The hook, not the game, decides what a failure looks like: it
calls `failureMessage(error, 'word')` and releases the optimistically-accepted
word.

**Count the `commit` callbacks, not the files that name the hook.** strands and
letterboxed mention `useWordSubmit` only in prose — strands' `submit_path` is a
standalone callback that already reads `data`, and letterboxed's header says it
is "deliberately NOT `useWordSubmit` … the commit is a plain RPC". Both are
ordinary entries in their own areas.

**DONE 2026-09-01.** Both halves have landed; what follows is the record.

Those four converted in TWO halves:

- **each game's SQL converted in its own area**, leaving its call site raw.
- **`useWordSubmit` converted ONCE, after the last of the four**, taking every
  call site with it and deleting the hook's use of `failureMessage`.

The contract is `commit: (entry) => Promise<NotOkEnv | null>` — `null` means the
word landed. The game owns the branch chain over its own answers (they are
per-game: `pangram` in one, `dealt` in another, so a shared hook could not read
them) and hands back only the fact the hook is entitled to: whether the
optimistic pill it just showed is still true.

That contract forced one SQL fix. **boggle's `gameOver` moved to the not-ok arm
as PN368**, where its three siblings already were. The word is not recorded on
that path, so an `ok` answer left the optimistic `+N` pill standing over a word
that never landed — invisible only because the call site read `error` alone.
There is no way to say "ok, but release the word", which is the contract
reporting that the answer was on the wrong arm.

Two behavior changes fell out, both from `getNotOkFeedback` replacing
`failureMessage`: a **race is orange now** rather than red, and a **fault shows
its sentence in the pill** while `runRpc` raises the modal centrally — where the
old classifier blanked the slot and left only the modal. `noRawServerMessage`
enforces the second ("the modal is raised centrally — use getNotOkFeedback and
let the pill carry the words"), and its `useWordSubmit` allowlist entry is gone.

**wordiply settles the hook's shape, so it goes last of the four.** Its `commit`
manufactures an error out of a SUCCESSFUL answer — `res.ok === false` becomes
`{ error: { message: rejectReason(…) } }` — to get the shared hook to pill a
refusal. A refused guess is a designed answer there (it is a TURN), so what
`commit` must be able to hand back is "refused, and here is why", not an error.
wordiply also has a second call site, `recordReject`, firing the same RPC with
`fe_legal: false`.

**A DUPLICATE is a race, not an answer** (Joel, 2026-09-01), in all four.
`useWordSubmit.submit` dedups against `foundWords` PLUS a synchronous
`pendingRef` and returns BEFORE calling `commit`, painting its own orange
`warning` pill — so the server's duplicate branch is reachable only when that
list is stale: a teammate found the word between the render and the submit
(coop), or the caller's own row had not landed (compete, a second tab). Nothing
is recorded, so it refuses. It is the §3 distinction exactly — `duplicate` is
"the call refused it", where `incorrect` is "recorded, and the game said no" —
and it matches connections' PN301. Codes: boggle PN359, spellingbee PN360,
wordwheel PN361.

The cost is a swallow window per game: a converted RPC answers `not-ok` with a
200, so `error` is null at a raw call site and a refused word stays
optimistically accepted until the next realtime refetch drops it. Accepted —
the alternative is either a four-area commit or a call site whose sentence is
still written by the system this sprint deletes.

Everything else is self-contained. `create_game` appears sixteen times but each
is a distinct function in its own schema, so it carries none of that cost — and
the same is true of every game's reads (`games_state`, `players_state`, …).

**`psychicnum` first among the games**, whatever its size: it is the
deliberately-minimal toy, every one of its raises is already classified in §5,
and its `submit_guess` is the first RPC returning a VERDICT rather than an
identifier — a shape nothing has exercised yet.

#### Club page

- [x] `create_club` · RPC
- [x] `delete_game` · RPC — and its feedback moved to toasts (see below)
- [x] `set_club_gametypes` · RPC — no outcomes of its own; envelope + handler only
- [x] `unset_current_view` · RPC — the club page's presence heal
- [x] `clubs` · read
- [x] `clubs_gametypes` · read
- [x] `clubs_members` · read
- [x] `games` · read — a refetch, so a failure leaves the last list on screen
- [x] `profiles` · read

#### Auth

- [x] `claim_username` · RPC — PN017 is the sprint's first caught UNIQUE-as-referee
  after create_club's; PN018 is the first `dbcode` a call site branches on
- [x] `profiles` · read (2 call sites) — both dropped `.maybeSingle()`/`.single()`:
  zero rows is the answer each was really asking for

#### Common

- [x] `add_word` · RPC — with update_word, delete_word and their two private
  helpers, which share every raise an editor actually hits
- [x] `anagrams` · RPC
- [x] `concede` · RPC — cross-cutting; DONE 2026-09-01
- [x] `delete_word` · RPC
- [x] `end_game` · RPC — cross-cutting; DONE 2026-09-01
- [x] `replay_board` · RPC — cross-cutting; DONE 2026-09-01
- [x] `send_message` · RPC
- [x] `set_current_view` · RPC — PA003 for a deleted game, the twin of unset's
      PA001. Its own pgTAP had it throwing `P0002 game-not-found|`; both that and
      the non-member `throws_ok` are envelope assertions now
- [x] `set_scratchpad` · RPC — three raises: PN304/PN306 are `BUG:` faults (the
      FE sends its own id or null, and the textarea carries maxLength=10000), and
      PN305 is a RACE — the debounced flush landing after the game ended, which
      is the one keystroke this system can actually lose. Its pgTAP gained that
      case, which it never had
- [x] `tick_timer` · RPC — PA004 for a deleted game (no clock to advance), and
      a POLL: `dbFetch` gained `isPolled` so a per-second call is logged, never
      presented. A 5s wifi drop was 5 fault modals with the queue refilling as
      you dismissed. The gap that leaves is docs/deferred.md → a disconnected
      player is the one person who is not told
- [x] `unset_current_view` · RPC — `useCommonGame`'s last-viewer-leave; ONE SQL
  definition serves both areas, so it converted with the club page's
- [x] `update_profile_color` · RPC — with EditProfileModal, as one unit
- [x] `update_word` · RPC
- [x] `clubs` · read (2 call sites)
- [x] `clubs_members` · read — `useClubRoster`; ClubPage's copy converted
      earlier. A failed read leaves `members` alone rather than emptying it: a
      club with nobody in it is a worse answer than a stale one
- [x] `found_words` · read — `makeFoundWordsGame`'s, converted in the useGame
      sweep; it is filed here because the factory lives in `src/common/`
- [x] `game_players` · read (2 call sites) — `useCommonGame`'s converted in the
      useGame sweep; `useGameInvitations`' embed here
- [x] `game_scratchpads` · read — a failed read leaves the pad alone; blanking
      one someone is typing in is the only thing worse than a stale one
- [x] `games` · read (2 call sites) — `useCommonGame`'s and `GamePage`'s
      pre-flight, both converted
- [x] `games_state` · read — `makeFoundWordsGame`'s, same as `found_words`
- [x] `messages` · read — the same chat, and a refetch: a failure leaves the
  transcript alone
- [x] `profiles` · read — ONE real site left when this began, not four: two of
      the four hits are docstring examples. A failed name lookup does not drop
      the invites, it only costs the inviter's name
- [x] `timers` · read — the seed beside the tick RPC, and it opts out for the
      SAME reason: a seed read and a tick fail together, so showing one while
      the driver swallows its twin would modal the mount and nothing after
- [x] `words` · read — the same dialog's load
- [x] `common-define` · edge fn — PN311/PN312 service-errors (the dictionary
      source down), PN313/PN314 faults. Three NAMED ok results replacing one
      shape with `unknown?` and `def: string | null` flags

#### bananagrams

- [x] `check_board` · RPC — THREE named ok results where the caller derived
      `empty` from a `placed` count. PN337 replaces a raise that said "no
      bananagrams.games row" while querying `player_boards`
- [x] `concede` · RPC — cross-cutting; DONE 2026-09-01
- [x] `create_game` · RPC (3 call sites)
- [x] `dump` · RPC
- [x] `end_game` · RPC — cross-cutting; DONE 2026-09-01
- [x] `peel` · RPC
- [x] `replay_board` · RPC — cross-cutting; DONE 2026-09-01
- [x] `save_player_board` · RPC — TWO named ok results where the two
      deliberate no-ops (terminal, conceded) used to be silent. The three
      call sites collapse to one: `save()` returns its promise, so the peel
      and check-words flushes await the same chain
- [x] `player_boards` · read (3 call sites) — converted in the useGame sweep
- [x] `progress` · read — converted in the useGame sweep

#### boggle

- [x] `create_game` · RPC, reached through `boggle-build-board`
- [x] `end_game` · RPC — cross-cutting; DONE 2026-09-01
- [x] `submit_timeout` · RPC — cross-cutting; DONE 2026-09-01
- [x] `submit_word` · RPC — **SQL only**; its call site is `useWordSubmit`'s
      `commit`, converted with the other three commits + wordiply's
      `recordReject` (see the hook note above).
      PN352 keeps the raise-not-a-soft-return intent of `you-conceded`:
      a refusal is what releases the optimistic word. PN359 makes a DUPLICATE a
      race — see the note below
- [x] `found_words` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `games` · read — converted in the useGame sweep; verified 2026-09-01

#### codenamesduet

- [x] `create_game` · RPC (2 call sites)
- [x] `get_clue_context` · RPC — **the roster never listed it** (found
      2026-09-01, converting the turn loop). PN387–PN389, and its two races are
      `submit_clue`'s sentences word for word: the AI button shares the
      below-board row with Submit and loses the same races, so a player must not
      be able to tell them apart by the words. It needed no seat check of its
      own — `is distinct from` is NULL-safe where `<>` is not. Converting it
      required the Deno caller first (`deno-callers.md` (deleted; its content is in docs/envelopes.md)),
      because the relay above it read "an envelope means a refusal" and would
      have swallowed the SUCCESS. PN316 is gone with it, and codenamesduet is
      off `ERROR_COPY` entirely
- [x] `pass_turn` · RPC — PN373–PN376 + PN385, ONE `ok` carrying the turn state
      `_end_turn` wrote. Sudden death rides in `data.play_state` rather than
      being a second answer
- [x] `submit_clue` · RPC — PN369–PN372 + PN384. THREE of its four refusals are
      races: the form is drawn from the giver seat and the turn's clue row, both
      arriving by subscription, while Submit unlocks on the reply
- [x] `submit_guess` · RPC — PN377–PN383 + PN386, and FIVE `ok`s: the three
      terminal ones named for the play_state they set, `agent` and `bystander`
      for the two that leave the game running. The old `returns text` label
      survives as `data.revealed`. `already-revealed` SPLIT in two (Joel,
      2026-09-01): PN382 is the board's reveal, PN383 is your own bystander —
      which blocks only you, so it is a different sentence
- [x] `clues` · read — `useClues`. Zero clues is an ORDINARY answer here (turn
      1 before the giver speaks looks exactly like it), which is why the
      failure had to become its own thing
- [x] `games` · read — `useGame`'s converted in the useGame sweep;
      `useBoard`'s here, losing its `.single()`: zero rows now clears the key
      cards so the PlayArea says "Game not found." instead of drawing from the
      last load
- [x] `guesses` · read — `useBoard`'s, in the same `Promise.all`
- [x] `profiles` · read — `useGame`'s; verified 2026-09-01
- [x] `words` · read — `useBoard`'s. Its unit test gained the failure case and
      was verified by planting: swallow the not-ok and it goes red
- [x] `codenamesduet-suggest-clue` · edge fn — PN319/PN320 service-errors (the
      model declined, or was cut off: it RAN), five faults, and
      `get_clue_context`'s own refusals relayed untouched — which is TRUE of the
      relay code and NOT yet true of the RPC, see the row above. `isEnvelope`
      added to the Deno shared envelope, which `startGame.ts` had inlined

#### connections

- [x] `create_game` · RPC (3 call sites)
- [x] `next_puzzle_for_club` · RPC (2 call sites)
- [x] `puzzle_for_date` · RPC
- [x] `submit_guess` · RPC
- [x] `games` · read
- [x] `guesses` · read
- [x] `players` · read

All three are one `Promise.all` in `hooks/useGame.ts` — the "2 call sites" above
counted `load()` being INVOKED twice (mount, then the postgres-attached
refetch), not two places in the source.

#### crosswords

- [x] `create_game` · RPC, reached through `crosswords-import-nyt / -guardian`
- [x] `create_game` · RPC
- [x] `check_cells` · RPC — PN473/PN474, and it NAMES how many cells it
      flagged: `wrong_count` was computed anyway and kept to itself, so a caller
      could not tell "checked, all correct" from "checked nothing"
- [x] `export_solution` · RPC (2 call sites) — PN477. A missing game was the
      same bare `null` a solution-less game returned
- [x] `library_for_club` · RPC — an EMPTY library stays an `ok` with an empty
      list: nothing is blocked and there is no input to fix, which is exactly
      what separates it from the two date pickers
- [x] `next_nyt_date_for_club` · RPC — PN478, a `form-validation` on `source`,
      carrying the sentence `crosswords-import-nyt` used to compose (approved
      2026-08-12). It moved into the RPC because TWO callers ask — the importer
      and the setup form's weekday field — and both deserve the same answer.
      PN227/PN228 deleted
- [x] `reveal_cells` · RPC — PN475/PN476, and `solved` in the answer: a reveal
      can complete the grid, which lands the ordinary coop `won` on purpose
- [x] `reveal_solved_word` · RPC — PN479, and TWO `ok`s (`solved` / `unsolved`)
      where `answer` being null used to carry the difference. **The last relay
      trap**: `crosswords-explain-clue` converted in the same commit, which is
      the tenth and final call site in `deno-callers.md` (deleted; its content is in docs/envelopes.md)
- [x] `set_cell` · RPC — PN464–PN467
- [x] `set_mark` · RPC — PN468–PN472
- [x] `cells` · read — `useCells`. **Ticked once before it was true**: that
      pass converted the file's two WRITES and left the read raw, which the
      read scan caught. A failed read now leaves the grid alone rather than
      emptying it — a blank crossword reads as a puzzle that was reset. The
      hook also stopped returning two bespoke result unions and hands the
      envelope back: they existed only to carry an error beside a value, which
      is what an envelope IS
- [x] `games` · read — `useGame`'s, and its only one; verified 2026-09-01
- [x] `games_state` · read — the solution fetch, and it lost its `.single()`
      too: zero rows means the shield is still up (games_state gates the
      solution to terminal), which is an answer rather than a failure
- [x] `crosswords-explain-clue` · edge fn — PN327/PN328 service-errors (the
      model ran, explained nothing), five faults, and `reveal_solved_word`'s
      refusals relayed. `unsolved` stays an OK: the menu item is live on any
      clue because the FE cannot see which are solved

#### letterboxed

- [x] `create_game` · RPC, reached through `letterboxed-build-board`
- [x] `clear_chain` · RPC — PN408–PN411. Converted and treated as real
      although NOTHING can reach it: `runChainRpc` is typed
      `'undo_word' | 'clear_chain'` and its one caller passes the first.
      Whether to delete it instead is now an item in
      [letterboxed.md](../docs/games/letterboxed.md) → Deferred
- [x] `log_help` · RPC — PN412–PN415, and its log-and-swallow ENDS: a refusal
      shows in the pill like any other (Joel, 2026-09-01). The comment that
      justified swallowing it — the turn log keeps the content — was true only
      of a write that succeeded
- [x] `submit_word` · RPC — PN396–PN403, and the area's one real judgment: of
      the five shape checks `rejectReason` also makes, the two that read the
      WORD and the BOARD are faults (both are fixed, so a disagreement is a
      broken client) and the three that read the CHAIN are races (coop's chain
      is shared and free-for-all, so a teammate moves it under you). The racing
      three keep `rejectReason`'s exact words. **I first classified all five as
      faults**; `errorCopy.ts`'s own comment had recorded the split years
      before, and reading it is what caught the mistake
- [x] `undo_word` · RPC — PN404–PN407. `nothing-to-undo` is a race twice over:
      two coop players can undo the same last word, and a fast double-click
      outruns its own row
- [x] `events` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `games_state` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `players_state` · read — converted in the useGame sweep; verified 2026-09-01

#### psychicnum

- [x] `create_game` · RPC (2 call sites) — the first game. Took the three shared
  guards with it (`require_valid_mode`, `require_player_count_max`,
  `require_valid_timer`, PN035–PN041): psychicnum's handler re-raises anything
  not `PN`/`PA`-coded, so an unconverted guard would have escaped it as a raw
  fault in the game being converted. They are called by 15–17 files, so until
  each of those converts, their failures wear the fault look elsewhere — right
  words, wrong weight, and not worth a shim for an afternoon
- [x] `request_hint` · RPC — PN390–PN392, and TWO `ok`s: `hint` and `no-hint`,
      where a magic "No hint available" string used to carry the difference
- [x] `request_reveal` · RPC — PN393–PN395, one `ok`. Both answer `warning`,
      matching stackdown's twins — help you asked for is neither good nor bad
      play. **Their "nothing left" branches turned out to be UNREACHABLE** and
      became faults: `submit_guess` ends the game the moment the last secret is
      found, in both modes, so the play_state gate always fires first. That
      closes the divergence `ERROR_COPY` recorded between these and stackdown's,
      in stackdown's direction, and takes psychicnum off that table
- [x] `submit_guess` · RPC
- [x] `games_state` · read
- [x] `guesses` · read
- [x] `players` · read

`games` was already read through the `games_state` view, so there was no second
read to convert; `submit_guess` has one call site, not two.

**This area was marked finished when it was not**, and is now finished for
real. The worked example in §5 covers `create_game` and `submit_guess`; the two
priced-help RPCs were never listed, and an audit of every `grant execute … to
authenticated` found them (2026-09-01). Converting them was where the
"unreachable branch" question got its answer — see the two rows above.

#### scrabble

- [x] `create_game` · RPC (2 call sites)
- [x] `ai_exchange_tiles` · RPC — PN452
- [x] `ai_pass_turn` · RPC — PN459
- [x] `ai_play_word` · RPC — PN444
- [x] `exchange_tiles` · RPC — PN445–PN451 through `_commit_exchange`
- [x] `get_ai_context` · RPC — PN463, and TWO `ok`s: `done` is the COMMON one,
      since every client pokes it on every version bump. `scrabble-ai-move`
      moved with it
- [x] `get_suggest_context` · RPC — PN460–PN462; `scrabble-suggest-move` moved
      with it
- [x] `pass_turn` · RPC — PN453–PN458 through `_commit_pass`
- [x] `play_word` · RPC — PN435–PN444 through `_commit_word`

**`stale` STOPPED being an `ok`** (Joel, 2026-09-01). The version gate is the
race this whole area turns on — somebody else's committed move, arriving by
subscription — and `outcomes.md` already named "scrabble's Board changed" as its
example of the tone a race defaults to. The `version` it used to return rides in
the raise's DETAIL now, where the `[db]` line shows it: nothing reads it (the
FE's `game.version` comes from the games-row subscription, which is the
authority), and if a caller ever needs the number rather than the record of it,
`meta` is the slot — a structured field on both arms — not a string to parse.

**The version gate is also what classifies the rest.** Every check below it is a
fault, because any server state a later gate could disagree with would have
bumped `version` first — so a MATCHING version plus a disagreement means the
client's own state is wrong. Only `play_state` escapes, living on
`common.games`, which is why "Game over" is the other race.

**The six wrappers each needed their own catch block**, which the first pass got
wrong: a wrapper's seat gate raises BEFORE it delegates, so the core's block
never sees it. The pgTAP caught it — an uncaught raise aborted the transaction
and took twenty assertions with it.
- [x] `games_state` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `players_state` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `plays` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `scrabble-ai-move` · edge fn — PN333–PN336, all faults, and a relay
      written for the five `ai_*` RPCs' envelopes. Those RPCs caught up in the
      same area (PN444, PN452, PN459 — their rows are above), so the relay is no
      longer waiting for something that has not happened. `moves` renamed
      `turns`: one loop pass is one seat's TURN however many words it crossed,
      and 0 is the common value since every client pokes and one wins. It was
      also the last raw `callEdgeFn` call site, and is not one now:
      `callEdgeFn` has exactly one consumer, `runEdgeFn`, with a guard in
      `callSiteShape.test.ts` keeping it there — the export cannot say who it is
      for, and an auto-import is all a second would take
- [x] `scrabble-suggest-move` · edge fn — PN330–PN332 faults, and
      `get_suggest_context`'s refusals relayed. TWO ok results: an empty
      `moves` array was standing in for `no-legal-moves`, which the panel
      already renders as its own sentence

#### setgame

- [x] `create_game` · RPC (2 call sites)
- [x] `record_hint` · RPC
- [x] `submit_set` · RPC
- [x] `events` · read
- [x] `games_state` · read
- [x] `players` · read

#### spellingbee

- [x] `create_game` · RPC, reached through `spellingbee-build-board`
- [x] `submit_word` · RPC — **SQL only**; the call site is `useWordSubmit`'s
      `commit` (see the hook note above). The WIN became its own named result in
      BOTH modes: it used to be a `won: true` field bolted onto coop's
      `accepted`, and nothing at all on the compete path, so one event was
      reported two different ways depending on mode. PN360 makes a duplicate a
      race
- [x] `found_words` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `games_state` · read — converted in the useGame sweep; verified 2026-09-01

#### stackdown

- [x] `create_game` · RPC (2 call sites)
- [x] `reveal_next_hint` · RPC — a hintless word is now a FAULT, not an answer
- [x] `reveal_next_word` · RPC — its "all cleared" branch is unreachable, kept
  as a `BUG:` assertion that clearing the last word really does end the game
- [x] `submit_word` · RPC
- [x] ~~`games` · read~~ — **there is no such read.** The entry came from
  `stackdown/db.ts`'s docstring, which spells `db.from('games')` as its EXAMPLE
  of what the schema-scoped client buys you. Same false positive as the dead
  `ERROR_COPY` key a docstring kept alive; the roster is one entry shorter
- [x] `games_state` · read
- [x] `players` · read
- [x] `submissions` · read

#### strands

- [x] `create_game` · RPC (2 call sites)
- [x] `next_puzzle_for_club` · RPC (2 call sites) — PN416, connections' PN302
      verbatim: same condition in the other dated-archive game, so the same
      sentence and the same `puzzle_id` field. `create_game` reads its envelope
      rather than its rows now, and the New game path deliberately says MORE
      (an acknowledge dialog naming the fetch command) because the server's
      sentence points at a form field that surface lacks
- [x] `puzzle_for_date` · RPC — PN417, connections' PN303 verbatim. Stays
      SECURITY INVOKER: it reads only the archive
- [x] `spend_hint` · RPC — PN428–PN434. THREE races the shared coop pool makes
      real (a teammate can fill the bar, spend it, or ring a word between your
      check and your click), one fault for the unreachable empty board, and an
      `ok` in `warning` — help you asked for is neither good nor bad play
- [x] `submit_path` · RPC (2 call sites) — PN418–PN427, and SIX `ok`s. Three of
      them read like refusals and are not: `duplicate`, `too_short` and
      `invalid` are the rules applied to a move that happened, and NOTHING local
      was consulted first — strands ships no word list to the client and the FE
      does not gate on `min_word_length`, so there is no stale copy to lose a
      race against. That is the opposite of letterboxed, where `rejectReason`
      checks first and the same class of answer is a fault. The six path faults
      share one justification: `clickTile` BUILDS the trace, so a shape that
      fails them did not come from our board. `path-crosses-found` is the
      exception and the one race — a teammate's find eating your cells
- [x] `events` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `games_state` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `players_state` · read — converted in the useGame sweep; verified 2026-09-01

#### waffle

- [x] `create_game` · RPC, reached through `waffle-build-board`
- [x] `submit_swap` · RPC
- [x] `games_state` · read
- [x] `players_state` · read
- [x] `swaps` · read

#### wordiply

- [x] `create_game` · RPC, reached through `wordiply-build-board`
- [x] `submit_guess` · RPC — **SQL only**; the call sites are `useWordSubmit`'s
      `commit` AND `recordReject` (see the hook note above). PN362–PN367. Two
      shapes that shared `ok: false` split across the arms: a DUPLICATE records
      nothing and refuses (PN365), while a REJECT inserts a `guesses` row and
      may spend the caller's go — it is a move the game said no to, so it stays
      `ok`. It must also RETURN rather than raise: catching is a savepoint, and
      a raise would roll back the row that is the point of the call. And
      `fe_legal` tells the two callers apart — a structural break claimed legal
      by `commit` is PN367, a fault, because the FE holds `legalWords` and
      checks `minWordLength` before committing
- [x] `games_state` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `guesses` · read — converted in the useGame sweep; verified 2026-09-01

#### wordle

- [x] `create_game` · RPC (2 call sites)
- [x] `submit_guess` · RPC (2 call sites)
- [x] `games_state` · read
- [x] `guesses` · read
- [x] `players` · read

#### wordwheel

- [x] `create_game` · RPC, reached through `wordwheel-build-board`
- [x] `submit_word` · RPC — **SQL only**; the call site is `useWordSubmit`'s
      `commit` (see the hook note above). PN356–PN358 + PN361, and the win
      becomes one named result in both modes exactly as in spellingbee, which
      this is a fork of
- [x] `found_words` · read — converted in the useGame sweep; verified 2026-09-01
- [x] `games_state` · read — converted in the useGame sweep; verified 2026-09-01

### Edge functions

A second producer with a different mechanism: they return
`json({ error: … }, 4xx)` rather than raising, so none of the SQL machinery
reaches them.

**The seven board builders are NOT deferred.** They are how seven games start a
game — the setup dialog calls the function, the function calls that game's
`create_game` — so deferring them would mean deferring seven `create_game`
conversions, which is most of what §7 has left. They are listed with their games.

**200 whenever the function answered**, faults included. The status says whether
the function RAN; the envelope says what it decided. A function that answers 400
for "that difficulty has no buildable board" makes the status carry two
unrelated jobs, and the frontend then cannot tell a `not-ok` that belongs under a
field from a container that never woke up. `runEdgeFn` reads the envelope for
the verdict and the status for nothing but "did this reach the function at all".

The pieces, all shared:

- **`_shared/envelope.ts`** — `ok` / `formValidation` / `serviceError` / `fault` /
  `crash` (plus `faultEnvelope` for the inbound path and `isEnvelope`), the Deno
  twins of `common.ok_envelope` and `common.raised_envelope`. The severity is
  the FUNCTION NAME, so unlike SQL's `hint` there is no second string to
  mistype: `deno check` owns it.
- **`_shared/startGame.ts`** — `invokeCreateGame` forwards the RPC's envelope
  **untouched**, which is what lets a raise written in SQL reach the player with
  its own words and its own field. `error` then means only "the RPC never ran".
  `parseBuildBoardRequest`'s four gates are faults on the form: the setup dialog
  composes every one of those fields itself.
- **`runEdgeFn`** in `dbResult.ts` — the twin of `runRpc`, and the only place a
  declared fault arriving 200 gets reported, since `dbFetch`'s seam only reads a
  non-2xx body.
- **`raiseCodes`** reads `supabase/functions/**/*.ts` too. One sequence, two
  spellings.

Because those are shared, converting the first board builder converts the
handoff for all seven — the other six are red until they land. That is the
chosen sequencing, not an accident.

**ALL SEVEN ARE DONE**, crosswords last, because it needed a field before its
one validation had anywhere to land — see plans/areas/forms.md → F50
`puzzle-source-picks-in-a-dialog`, which turned its four source tabs into one
`source` field — named for the setup key it writes, like every other field.

Crosswords is also where the third severity finally appears. `error` — "something
we depend on didn't answer" — had been in the type and in the `[db]` line with
nothing producing it, because it belongs to services outside us and only the two
importers talk to any: NYT rejecting a stale cookie, the Guardian unreachable.
Both keep Joel's approved words.

**The three temporary start-game adapters are gone** (`startEnvelope`,
`edgeStartEnvelope`, `invokeStartGameEdgeFn` — `manifestRpcs.ts` is 146 lines
down to 70). They existed to make an unconverted RPC's `{ data, error }` look
like an envelope so the frontend could convert first; every `create_game` returns
one now, so a manifest calls `runRpc` or `runEdgeFn` and there is nothing to
adapt. That was the stated end and this is it.

**ALL THIRTEEN ARE DONE.** The five that answer a question rather than start a
game — `common-define`, `codenamesduet-suggest-clue`, `crosswords-explain-clue`,
`scrabble-ai-move`, `scrabble-suggest-move` — were held back here until the seven
builders had shown what an envelope costs, then converted with the games that
call them; their rows above are ticked. So the question this section left open is
answered: **every** edge function returns an envelope, and the status means only
"did this reach the function".

**Their CRASH path was a separate, later job — done 2026-09-02.** All five kept
`edgeInternal(e)` in their `catch` long after their ordinary paths were
envelopes: the deleted `{"error":"key|detail|"}` shape at HTTP 500. Nothing
caught it because nothing reaches a catch-all until something throws, and each
still logged to the serve output, so only the player-facing half was wrong — and
wrong in the case that least wants it, since `runEdgeFn` takes a non-2xx down its
transport branch and replaces the crash's own message with "The server refused
the request." They end with `crash()` now, like the other eight, and
`edgeInternal` is deleted rather than left unused so a fourteenth function cannot
reach for it.
