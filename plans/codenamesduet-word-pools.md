# codenamesduet: word pools

**Status: DECIDED 2026-10-07, not started.** Joel and Claude settled this in
one conversation; this file is the record. Each step below stops for Joel's
review.

A codenamesduet board's 25 words come from one pool today, the Codenames Duet
list. This adds two more, and a setup choice of which pools a game draws from.

## The decisions

1. **Three pools**, numbered in this order:

   | # | setup name | label | source | words |
   |---|---|---|---|---|
   | 1 | `duet` | Codenames Duet | today's `codenamesduet.word_pool` | 390 |
   | 2 | `codenames` | Codenames | [sagelga/codenames `en-EN/default`](https://raw.githubusercontent.com/sagelga/codenames/refs/heads/main/wordlist/en-EN/default/wordlist.txt) | 400 |
   | 3 | `undercover` | Undercover (adult) | [sagelga/codenames `en-EN/undercover`](https://raw.githubusercontent.com/sagelga/codenames/refs/heads/main/wordlist/en-EN/undercover/wordlist.txt) | 322 |

   The third list holds sexual terms, so its label says "(adult)" on the
   checkbox itself. A fourth list (sagelga's `ceadmilefailte`, "Advanced") was
   considered and dropped: most of the data problems were in it — British
   spellings, hyphen and space variants of one word, words up to 19 letters.
2. **A word belongs to one pool: the lowest-numbered list it appears in.**
   `word_pool` keeps its primary key on `word`, and no board can deal the same
   word twice. The words counted above are after this: 68 of the undercover
   list's 390 are already in lists 1 or 2.
3. **Words are stored lowercase**, as today.
4. **The table stores the pool as a number** (`pool`, 1–3): a name repeated
   on every row would waste space. **Setup stores names**:
   `word_pools: ['duet', 'codenames']`, readable in the saved setup and in SQL.
   `create_game` maps names to numbers in one place.
5. **Equal shares.** The 25 words split evenly across the chosen pools — 25,
   13 + 12, or 9 + 8 + 8 — with each extra word going to a pool chosen at
   random, and the dealt words shuffled onto the board. Every pool holds well
   over 25 words, so a share never runs short.
6. **The setup form gains a "Word pool" disclosure**: a column of checkboxes,
   one per pool, at least one ticked. The default-default is Codenames Duet
   alone. The last choice is a club's saved setup, like every other setup
   choice; `create_game` already saves `p_setup` minus the first clue-giver,
   so this needs nothing new.
7. **The setup rows list the chosen pools by label**, comma-separated, in
   pool order ("Codenames Duet, Codenames"). The info column and the PDF read
   the same rows.
8. **Existing games and saved setups are backfilled** with
   `word_pools: ['duet']` — what every game so far was dealt from — so nothing
   reads a missing key.
9. **Singular/plural pairs stay.** 13 pairs remain across the three lists
   (apple/apples, nut/nuts, …), mostly an undercover word beside a plain one,
   where the plural is usually the joke. A board may deal both.
10. **The AI clue suggester sends adult words to Claude as-is.** Joel:
    *"someone should tell claude more dirty jokes."*

**The data was checked** (2026-10-07) against the three lists as they stand:
no British spellings (matched against the spelling guard's own list, so a
migration seeding them passes it), no two words differing only by a hyphen or
a space, and nothing longer than 11 letters, the same as today's longest.

## The steps

1. **Shape: a new migration** in `supabase/migrations/`, named
   `<ts>_codenamesduet_word_pools.sql`.
   - `codenamesduet.word_pool` gains `pool smallint not null`, the existing
     rows set to 1, with `check (pool between 1 and 3)`.
   - Lists 2 and 3 inserted inline, lowercase, in list order with
     `on conflict (word) do nothing`, which is decision 2 by construction. The
     comment names each source URL. It lives in the migration, as the first 390
     do, so `db push` takes it to prod on deploy.
   - Backfill `word_pools: ['duet']` into every codenamesduet game's
     `common.games.setup` and its `static_game_data.setup` copy, and into
     codenamesduet's `common.clubs_gametypes.default_setup` rows, idempotently
     (the shape of `20261007000003_dict_band_setup_key.sql`).
   - Rehearse it against prod's rows (`gmake db-rehearse`), since a backfill
     over an empty local database proves nothing.
2. **Behavior: `supabase/sql/codenamesduet.sql`.**
   - `create_game` requires `setup.word_pools`: a non-empty array of known
     names, no repeats. Each refusal is a fault (`hint = 'fault'`), since the
     form already blocks an empty choice; new fault codes from the next free
     `PN` number.
   - The 25 words are drawn by equal shares (decision 5) and shuffled before
     the positions are assigned, so the title's first three words come from the
     mixed board.
   - pgTAP in `supabase/tests/codenamesduet/`: the default deals only pool 1;
     two pools split 13/12 and three 9/8/8; every refusal; the backfilled
     setup. The existing tests' setups gain `word_pools`.
3. **Frontend: `src/codenamesduet/`.**
   - `types.ts`: `word_pools` on the setup values, typed to the three names.
   - `lib/setup.ts`: the pools in order (name and label), and
     `word_pools: ['duet']` in `DEFAULT_CODENAMESDUET_SETUP`.
   - `components/SetupForm.tsx`: a `SetupSection` labeled
     "Word pool: Codenames Duet, …" holding the shared `CheckboxListField`. The
     field holds a `Set`, the setup an array kept in pool order.
   - `manifest.ts`: `setupForm.validate` answers "Pick at least one word
     pool." on `word_pools` when none is ticked.
   - `lib/setupRows.ts`: a "Word pools" row (decision 7).
     `src/guards/setupRows.test.ts` checks every default key has a row.
   - Tests beside each: the form's checkboxes and its at-least-one gate, the
     setup row.
4. **e2e and docs.**
   - `createCodenamesduetGame` in `e2e/helpers/fixtures.ts` sends
     `word_pools`.
   - [src/codenamesduet/doc.md](../src/codenamesduet/doc.md): the setup, the
     schema's `pool` column, the equal-shares draw.
   - [docs/features.md](../docs/features.md): its "sampling
     `codenamesduet.word_pool`" line.
   - codenamesduet's card in [plans/game-cards.md](game-cards.md), since what
     setup allows changed.
   - `components/Help.tsx`: one line saying the board's words come from the
     pools picked at setup.
5. **Deploy.** The migration reaches prod through `db push`. The FE reads the
   backfilled key from `static_game_data`, so after the deploy run
   `select codenamesduet._rebuild_data_cols_for_all();` on prod.

## Open

Nothing.
