# setgame (HareTrigger) — build plan

**Temporary doc.** This is the worked plan for game #16. When it ships, the
durable content moves to `docs/games/setgame.md` and this file gets deleted
(the usual convention — reference docs describe the current state, not plans).

- **codename** `setgame` — schema, folder, `setgame_coop` / `setgame_compete`
- **brand** `HareTrigger` — the `BRAND` const in `manifest.ts`, nowhere else

Why not `set`: `SET` is a Postgres keyword, `Set` is a TS builtin, and
`docs/naming.md`'s watch list bans `set` as a wide-visibility name outright.
The domain word survives in **player-facing copy only** ("Set!"); in code the
found thing is a **claim** (`setgame.claims`, `type Claim`), and the move RPC
is `submit_set` — the `submit_guess` / `submit_word` sibling.


## 1. The game

81 cards, one per combination of four attributes with three values each:
count (1/2/3), color, shading (solid / striped / open), shape. Twelve are
dealt face-up. A **set** is three cards where each attribute is either all-same
or all-different across the three. Claim a set, it leaves the board. The board
refills to twelve from the deck, and grows by three whenever no set is present.
Play ends when the deck is empty and the board holds no set.

Verified against the Wikipedia article: the deal rule really is "twelve, then
fifteen, then eighteen or more as necessary."


## 2. The math — why this game is cheap

Encode a card as four base-3 digits: `count·27 + color·9 + shade·3 + shape`,
so a card is an `int` in `0..80` and the deck is `int[]`.

**Any two cards determine the third.** Per digit: same → same, different →
the third value (`3 − x − y`). So `third(a, b)` is arithmetic, `isSet(a,b,c)`
is `third(a,b) === c`, and "does this board contain a set" is a pair loop with
a membership lookup — ≤210 pairs at the largest board we will ever see. Both
plpgsql and TS implementations are a dozen lines, which is what makes
server-authority free here.

Simulated (20k full games each for the endings, 200k deals for the deal odds):

| fact | value |
|---|---|
| sets in the deck | 1080 |
| P(no set among 12) | ~3.4%, about 1 in 29 |
| board size ceiling | **21**, hard — the largest set-free collection in AG(4,3) is 20 cards, so 21 always contains a set |
| P(a game ever needs 21) | **~1 in a million** ([Henrik Wärne](https://henrikwarne.com/2011/09/30/set-probabilities-revisited/)) — 18 is the practical ceiling, and is what 40k simulated games topped out at |
| endings | 6 cards stranded 46% · 9 cards 44% · 12 cards 8% · **full clear only ~1–2%** |

That last row is the load-bearing one: it kills "win = clear all 81" as a coop
goal, and it is why §4 grades coop on reaching the natural end rather than on
what is left over.


## 3. Card art

The Wikimedia file (`Set_isomorphic_cards.svg`, CMG Lee) is a good confirmation
of the isomorphism — it is literally 81 cards laid out as nine 3×3 planes in
4-space, with a 20-card maximal cap shaded — but we **write our own three
paths**. It is CC BY-SA 4.0, so lifting its `d` attributes drags share-alike
onto our source for the sake of about six lines of trivial geometry, and its
icons are deliberately not Set's anyway.

`lib/shapes.ts` — three inline paths (diamond, squiggle, stadium/oval) drawn on
a shared 0–100 viewbox, three fills (solid · open · a `<pattern>` hatch for
striped), 1–3 pips stacked vertically. No external asset, and the same three
paths feed the jsPDF printer (jsPDF draws these natively).

**Palette — deliberately not Set's red/green/purple**, which is close to the
worst possible trio for red-green CVD (~8% of men): deutan renders red as olive
and green as khaki. It matters more here than in a normal game because two
cards can differ *only* by color, so shape and shading cannot rescue you.
Okabe–Ito instead, as `theme.css` tokens:

| token | hex | deutan/protan | greyscale L* |
|---|---|---|---|
| `--color-card-blue` | `#0072B2` | stays blue | 46 |
| `--color-card-magenta` | `#CC79A7` | soft pink-grey | 61 |
| `--color-card-orange` | `#E69F00` | yellow/tan | 70 |

Purple is the tempting "stay close to the original" third and is exactly wrong:
deutan renders it as blue and it collides. One palette, no colorblind-mode
knob — we are rebranding anyway, so there is no reason to ship the bad trio as
the default.

These sit near `--color-member-blue` / `-orange` / `-pink` in the identity
palette. Different surfaces (card faces vs member dots and chat labels), so I
expect no misread, but it is the first thing to check on a real screenshot.


## 4. Modes, win and loss

Vocabulary per `docs/win-lose.md`.

**Coop** — the goal is to **clear the deck**, which means *no sets left to
find*: the deck is empty and the board is dead. It does **not** mean getting
every card into a set — stranding 6 or 9 cards at the end is the normal ending
(§2), not a failure. Finish is therefore **built-in** and always reachable; the
clock is the only defeat source (the stackdown / strands / crosswords coop
shape).

| | |
|---|---|
| win | cleared the deck — the readout is "24 sets · 6 stranded" |
| loss | clock only: time ran out with sets still on the table |
| flourish | a full clear (0 stranded) is a ~2% event and gets called out |

"Clear the deck" is the player-facing phrase for this — in Help, in the win
verdict, and in the status line. Worth being deliberate about, because the
obvious misreading ("use up every card") is a goal the game almost never grants
and would make a normal ending feel like a near miss.

Opt-in turn-by-turn coop (`coop_style: 'turns'`) applies — a claim is a
discrete move, so the common turn-order primitive drops straight in.

**Compete** — same deck, same board, score = claims. Style is **best**
(everyone plays out; the collective end ranks them). Ranking is **sets found,
full stop** — `order by sets_found desc`, and **a tie is a tie**: everyone at
the top count is a co-winner.

No speed tiebreak. The roster's usual `quality asc, solved_at asc` exists to
separate players who reached the *same* finish line, which is a different
situation: here the count already is the whole result, and breaking a 9–9 on
who happened to grab their last set first would crown someone for reflexes the
score deliberately doesn't measure. wordiply already carries the co-winner
machinery to copy — per-player `won` flag on every tied player,
`winner_user_id` **null** when there is more than one (naming one arbitrary
tied player would tell the others they lost), and the FE reads its own `won`
flag for the banner.

On timeout: **rank the standings** (boggle-without-a-target). This is a second
entry in a row scrabble-compete currently owns alone, and the reason it differs
from scrabble is worth recording — scrabble all-loses because it has no
per-player finish to have missed, whereas here the score is a complete,
meaningful standing at every instant, so the clock is just how the session
stops. Add the row to `docs/win-lose.md` rather than inheriting scrabble's
ruling by proximity.

**No wrong-guess penalty, by construction.** The FE holds the whole board, so a
third card that does not complete a set never leaves the client — it shakes and
deselects. There is no wrong-claim event to price. The only server rejection is
the race (§6).

Nothing here breaks the no-survival-wins invariant: concede is the standard
per-player drop-out, all-conceded is a collective loss, and a conceder cannot
be crowned.


## 5. Schema

```
setgame.games       game_id, club_handle, mode, setup,
                    deck int[]        -- SHIELDED: the undealt order
                    deck_pos int,     -- cursor into deck
                    board int[],      -- slot-ordered card codes, 12..21
                    hint_cards int[], -- coop only; cleared by the next claim
                    hints_used int    -- coop only
setgame.games_state view — board, deck_count (= 81 - deck_pos), hint_cards,
                    hints_used, mode, setup.  Never `deck`.
setgame.players     user_id, sets_found int, won boolean
setgame.claims      claim_id, user_id, cards int[3], board_after int[],
                    claimed_at
```

**The only secret in this game is the order of the undealt deck** — the board
is face-up and every claim is public, so there is no solution to shield and no
per-peer RLS mask (the first game on the roster with neither). `deck` gets the
existing column-grant treatment: `grant select (everything but deck)` on the
base table, and `games_state` is what the FE reads. Same machinery as wordle's
`_target_for` / waffle's `_solution_for`, minus the terminal reveal — there is
nothing worth revealing at the end but the leftover deck order, which no one
cares about.

**`board_after` on every claim row** is what makes the history viewer a pure
filter (strands' shape) instead of a reconstruction, and it does it *without*
un-shielding the deck. 12–21 small ints per row is nothing.

`players` is public — everyone sees everyone's score live, which is how the
physical game works.

Both `games` and `claims` go in the `supabase_realtime` publication; the
central registry test guards it.

### SQL surface (`supabase/sql/setgame.sql`)

| function | notes |
|---|---|
| `create_game(target_club, setup, player_user_ids, title)` | inline shuffle — **no edge function**, the second game after psychicnum/scrabble with nothing to build. Deals 12 (or 9 junior), then runs the refill fixpoint so the opening board always has a set. |
| `_find_set(cards int[]) → int[]` | the pair loop; returns a live set or null. Used by the refill fixpoint, the terminal check, and `request_hint`. |
| `_refill(g_id)` | the fixpoint: while `card_count < board_min` or `_find_set is null`, deal 3; stop when the deck is empty. |
| `submit_set(target_game, cards int[3])` | one locked transaction: gate → all three on the board → `isSet` → remove, score, log the claim with `board_after` → `_refill` → terminal check → `_sync_title`. |
| `request_hint(target_game)` | coop only. Picks a live set, writes `hint_cards` (one card, then a second on a repeat press), bumps `hints_used`. Server-side so the ring is **shared** — a coop hint is a team resource, and realtime shows it to everyone. |
| `concede`, `submit_timeout`, `end_game`, `replay_board`, `_sync_title` | the standard five. `replay_board` re-deals from the same `deck`, which is what makes a board replayable. |

Gates are the common ones (`require_game_player`, `require_compete`,
`require_valid_mode`, `require_valid_timer`, `require_player_count_max`).

**Title** (`common.games.title` — names the game after its content, and may be
a readout): coop rewrites to `'<n> sets found'` via `_sync_title`; compete
seeds `'New compete'` and lands on the winner at terminal. Scores are public
mid-game, so a live compete title would be legal — but the placeholder is what
a club list wants to sit on.


## 6. Contention — the genuinely new thing

Every other compete game gives racers private boards or private progress. Here
one board is shared and a claim **removes cards from under other players**.
Two consequences:

1. **Server-side**: `submit_set` takes the games-row lock before validating
   membership on the board, so simultaneous overlapping claims serialize. The
   loser gets a `fe-error-keys` pill — "gone, someone beat you to it" — not a
   fault modal. This is the same lock the race games use for first-past-the-post.
2. **FE-side**: selection holds **card codes, not slot indices**, so a card
   that vanishes mid-selection simply drops out of the selection instead of
   silently re-pointing at whatever refilled its slot.

**Slot-stable board.** A claimed card's slot refills **in place** from the
deck; only when the deck is dry does the board shrink, and then it compacts
from the tail so at most the last three cards move. Nothing reflows under a
player's cursor, which is the standing no-reflow rule.


## 7. Frontend

Standard v3 two-column PlayArea, no layout exception.

- **Board** — 3 rows × 4 columns, growing to 5/6/7 columns as the board grows.
  Size for 12–18; the 7th column is a ~1-in-a-million board (§2) and must
  **fit** without being what the layout is tuned around. Since nobody will ever
  hit it by playing, prove it by **planting** a 21-card board in a test rather
  than trusting it — an untested branch that rare is one nobody would ever get
  a bug report for. Mobile transposes to 3 columns × N rows; the info-sheet
  recipe applies unchanged.
- **Input** — click cards to select, submit implicitly on the third (the
  strands / connections family), or type the card's letter (§7a).
- **`lib/cards.ts`** — `decode`, `third`, `isSet`, `findSet`, `allSets`.
  Exhaustively testable and the source of the hint preview.
- **InfoCol** — sets-found readout, deck-remaining count, TurnLog of claims
  (each row draws its three mini-cards, tagged with the claimer's member
  color), OpponentStrip in compete.
- **History viewer** — `lib/history.ts` + the shared `useHistoryViewer`, a
  pure filter over `claims.board_after`.

Gotchas already known: `theme.css` is per-lazy-chunk, so `SetupForm` and `Help`
need their own import or every card token is undefined; the board box needs
`.frame`; `--info-col-width` must be set or board sizing silently dies.


## 7a. Keyboard

Every card carries a **letter label below it** — `A`, `B`, `C`… in board order,
up to `U` at the 21-card ceiling. Typing a letter **toggles** that card's
selection (select if unselected, deselect if selected); the third selected card
submits, same as the third click. **Backspace clears the whole selection.**

Notes that fall out of it:

- **`useGlobalKeyHandler`, not `useCaptureKeys`.** The shared capture helper is
  built around accumulating *text* (`value` / `onChange` / Enter-to-submit),
  which is the wrong model — a letter here is a toggle on a card, not a
  character appended to a word. The layer below it is exactly right, and brings
  the focused-field gate along (typing in chat never reaches the board).
- **Letters are bound to slots, not cards**, which is what makes them usable:
  the slot-stable refill (§6) means `B` stays in the same place all game even
  as the card sitting there changes. The board only ever grows by appending, so
  a growing board adds letters at the end instead of renumbering.
- Case-insensitive. No modifier keys — plain letters and Backspace are free of
  the shell's global shortcuts (which are punctuation- and modifier-based;
  `⌥⌫` is taken but bare Backspace is not).
- Selection is stored as card codes (§6), so if a rival takes a card that is
  currently selected, it drops out of the selection and its letter goes back to
  being free — no stale highlight, no accidental claim on a card that moved.
- Mobile keeps the labels rendered (they cost nothing and they are how the
  turn log and Help refer to positions), even though nothing types there.


## 8. Setup

| knob | values |
|---|---|
| deck | **full** (81) · **junior** (27 — shading dropped, all solid, deals 9) |
| timer | the standard optional countdown |
| coop_style | free-for-all (default) · turns |

Junior is our own construction — Wikipedia does not document Set Junior — but
dropping one attribute is the obvious shape and gives the roster's expected
player-tunable-difficulty dimension something real. The board minimum follows
the deck (12 / 9), so the refill rule generalizes to `board_min`.

**Hints**: coop yes (free, shared, tallied); compete **banned**, per the
priced-help rule — a free hint here is generative help in a race.


## 9. PDF

Cards are pure geometry, so jsPDF draws them directly. Color *is* meaning here
and cannot move onto shape or line weight the way strands' and letterboxed's
did, because those channels are already attributes — so this is the roster's
first genuinely color-carrying print. The Okabe–Ito trio lands at L* 46/61/70,
roughly the three-shade greyscale ramp `docs/pdf.md` already uses, so a mono
printout stays readable; orange vs magenta is the tight pair at 9 points. Ship
without letter tags and look at a real greyscale print before deciding
otherwise.

Body: the claim log (who took which three) plus the final board, one section
per player in compete.


## 10. Tests

- **Vitest** `lib/cards.test.ts` — exhaustive: all 81 codes round-trip, exactly
  1080 sets among all triples, `third` is total and involutive, `findSet`
  agrees with a brute-force triple scan on random boards.
- **pgTAP** `supabase/tests/setgame/` — create_game deals a board with a set in
  it; a valid claim scores and refills; an invalid triple is rejected; a
  **stolen-card** claim is rejected (the contention case, the one worth
  planting a failure for); the refill fixpoint terminates on a dry deck; the
  terminal fires only when deck-empty *and* board-dead; `deck` is unreadable
  through the grant; compete ranking including the tie; concede; timeout;
  replay.
- **Component** `PlayArea.test.tsx`.
- **e2e** `setgame.e2e.ts` + `setgame-print.e2e.ts` + a mobile spec, and a
  two-tab contention spec if it is cheap to drive.
- The repo-wide invariant guards (status labels, outcome disjointness, schema
  exposure, css tokens, doc links) pick the game up automatically.


## 11. Build order

1. `lib/cards.ts` + `lib/shapes.ts` and their tests — the whole game's logic,
   provable in isolation.
2. Migration (shape: tables, indexes, publication) + `supabase/sql/setgame.sql`
   (behavior) + pgTAP.
3. Card component + Board + selection + contention reconciliation.
4. PlayArea / BoardCol / InfoCol / TurnLog / history.
5. SetupForm, Help, `theme.css`, `logo.svg`, both manifests, `src/games.ts`,
   **`supabase/config.toml` `[api] schemas`** (and restart the stack — a db
   reset does not re-read it).
6. PDF.
7. e2e + `gmake gallery`.
8. `docs/games/setgame.md`, then the cross-cutting updates: `features.md`
   (every dimension — a game missing from one is a gap), `win-lose.md` (both
   mode rows + the timeout-deviation note), `game-status-labels.md`,
   `naming.md` (the codename/brand table + gametype lists), `pdf.md`,
   `keyboard-shortcuts.md` (the letter-toggle scheme, §7a), `playarea.md`,
  `CLAUDE.md`'s doc table and roster
   count (fifteen → sixteen), and delete this file.


## 12. Open, deliberately not decided yet

- **Calling "no set"** — the physical game has a variant where spotting a dead
  board scores. Our auto-refill makes a dead board unobservable, which is the
  right default and closes the variant off. Noted, not proposed.
