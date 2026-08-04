# Cheatsheet

## `npm run …`

| command | what it does |
|---|---|
| `npm run dev` | Vite dev server at `http://localhost:5173` |
| `npm run build` | type-check (`tsc -b`) + production bundle into `dist/` |
| `npm run lint` | ESLint on `src/` (includes the cross-feature import-direction rules) |
| `npm test` | run **all** tests — FE first, then DB |
| `npm run test:fe` | Vitest only; add `-- --watch` for the dev loop |
| `npm run test:db` | pgTAP only (needs Docker + the local Supabase stack) |
| `npm run test:e2e` | Playwright realtime smoke tests (needs the local stack running) |
| `npm run db:diff` | show what the local schema has that migrations don't. **Noisy since the [schema-vs-code split](supabase.md#schema-vs-code)** — every function, view and policy lives outside the migration history by design, so they all report as drift (~440 KB). Read it for TABLE drift only |
| `npm run db:lint` | Supabase's schema linter — warnings + errors |
| `npm run types:gen` | regenerate `src/types/db.ts` from the live local schema |
| `npm run scrabble:selfplay` | run the AI-vs-AI self-play tuning harness (calibrates the compete opponent's strength levels — see scrabble.md §12) |

Scripts prefixed `_` (`_words:import`, `_sql:apply`, `_seed`, …) are **internal** —
they're invoked by gmake targets, which add the `ENV` guard and stamp
bookkeeping. Don't run them directly; use the `gmake` target instead.
| `deno test supabase/functions/waffle-build-board/gen_test.ts` | unit-test waffle's `minSwaps` par (the generation logic lives in the edge function, not under Vitest) |

## `gmake …`

Make owns **edges and environment** — the two things npm scripts can't
express. Every recipe shells out to the npm script that already exists;
nothing is reimplemented. **The dev loop stays on npm** (`npm run dev`,
`npm test`) — make is for data pipelines and deploys.

**GNU Make 4+ required** (`brew install make` → `gmake`). macOS ships 3.81,
which has no `.ONESHELL`; the Makefile refuses to run on it rather than
misbehaving. `gmake help` lists every target.

**`ENV=local` or `ENV=prod` is required — there is no default.** A default is a
guess about which database you meant, and `gmake deploy` once meant `ENV=local`:
it wiped the local database via `db-schema` and pushed to production anyway.
Anything that talks to a database now refuses without `ENV`; `help`, `dev-*`,
`test-*`, `_audit` and the local-pinned artefact builders don't care and don't
ask. Every writing target echoes its resolved target (password masked) first.

**Troubleshooting.** The supabase CLI ends its errors with *"Try rerunning the
command with `--debug`"* — which does **not** work through make: `gmake …
--debug` hands the flag to make, whose `--debug` means something else. Use:

| | |
|---|---|
| `DEBUG=1` | passes `--debug` to the supabase CLI — the verbose API/HTTP trace that hint meant |
| `gmake --trace …` | make's side: each recipe line with the target and prerequisite that triggered it. The one for "why did that rebuild, or not" |
| `gmake -n …` | print without running (`_audit` check 1 keeps this honest) |

**Names are prefixed for tab-completion**, since that's how you actually find a
target. Five families:

| prefix | what |
|---|---|
| `g-` | one game's data or assets — `g-stackdown-puzzles`, `g-boggle-trie` |
| `all-` | cross-game — `all-words`, `all-pangrams`, `all-tries` |
| `db-` | the database — `db-schema`, `db-sql`, `db-schema-sql`, `db-data`, `db-seed`, `db-reset`, `db-psql` |
| `deploy-` | pushing to a target — `deploy-funcs`, `deploy-func-<name>`, `deploy-fe` |
| `dev-` | the local loop — `dev-lint`, `dev-types` |
| `project-` | the hosted project itself — `project-link`, `project-config-auth`, `project-bootstrap` |

`gmake help` lists alphabetically, so the prefixes group there too. Unprefixed
targets belong to no family: `db`, `deploy`, `dev`, `test*`, `help`.
`_stamps-clean` leads with an underscore because it's an escape hatch, not
daily vocabulary.

### Which targets can touch prod

`deploy-*` is not the whole answer — **anything that writes to a database does,
when you pass `ENV=prod`**, and every `project-*` target is about prod by
definition. The full list:

| | targets |
|---|---|
| **writes prod with `ENV=prod`** | `all-words`, `all-pangrams`, `g-spellingbee-pangrams`, `g-wordwheel-pangrams`, `g-stackdown-puzzles`, `g-connections-puzzles`, `g-crosswords-puzzles`, `db-data`, `db-schema`, `db-sql`, `db` |
| **prod by definition** | every `project-*`, `deploy-*`, `deploy`. Note the `project-*` ones **ignore `ENV`** rather than checking it — they act on the project named by the secrets file / the CLI link, and `supabase … --linked` doesn't read a connection string at all. The two destructive ones demand `ENV=prod` explicitly, precisely because ENV can't protect them on its own |
| **reads prod with `ENV=prod`** | `g-stackdown-audit` |
| **can never reach prod** | `all-tries`, `g-boggle-trie`, `g-scrabble-trie`, `g-stackdown-genpuzzles` (pinned local — they build local files from the local dictionary), `db-seed` (pinned), `db-reset` (refuses), `dev*`, `test*`, `help`, `_stamps-clean` |
| **reads OR writes, you choose** | `db-psql` — a prompt on whichever database `ENV` names; it announces the target before connecting |

Two that destroy rather than write: **`project-db-destroy`** and
**`project-bootstrap MIGRATIONS=destroy`** wipe the hosted database, auth
accounts included.

```
gmake help                                   # every target, with descriptions

# data + assets — `gmake g-<TAB>` narrows to one game
gmake all-words ENV=local                    # common.words from ~/src/gamelist/words.tsv, read
                                             #   live (override WORDS_TSV); psql COPY, needs psql
gmake all-pangrams ENV=local                 # spellingbee + wordwheel seeds (follows words)
gmake all-tries                              # both edge-function word bundles — needed before
                                             #   the boggle/scrabble functions can serve locally
gmake g-stackdown-genpuzzles COUNT=50 BAND=2 # generate boards — APPENDS to the library
gmake g-stackdown-puzzles ENV=local          # delete + reload the table (generates iff missing)
gmake g-stackdown-audit ENV=local            # boards holding words we'd no longer pick
gmake g-connections-puzzles ENV=local        # the NYT Connections archive (idempotent)
gmake g-crosswords-puzzles ENV=local         # supabase/data/crosswords/*.puz|.ipuz (idempotent
                                             #   via content_hash; NYT-by-date games skip this)

# the database — `gmake db-<TAB>`
gmake db-psql ENV=local                      # a psql prompt on that database
gmake db-psql ENV=prod SQL="select 1"        # …or one statement
gmake db ENV=local                           # a WORKING database: structure + data
gmake db-schema-sql ENV=local                # structure only — an EMPTY database
gmake db-schema ENV=local                    # migrations only
gmake db-sql ENV=local                       # supabase/sql/ only — how an RPC change ships
gmake db-data ENV=local                      # every table's DATA (no structure)
gmake db-reset ENV=local                     # db + the dev personas
gmake db-drift ENV=prod                      # does that database's SHAPE match the migration
                                             # baselines? (edited-in-place baselines don't ship
                                             # via db push — this makes the divergence visible)
gmake db-backup ENV=prod                     # pg_dump the irreplaceable data (auth accounts +
                                             # app rows; dictionary/seed bulk excluded) → backups/
gmake db-restore ENV=local DUMP=backups/<f>  # data-only pg_restore; structure comes from git
                                             # (db-schema-sql first; all-words + all-pangrams
                                             # after — NOT db-data, whose stackdown reload would
                                             # delete restored boards out from under games)

# deploying — `gmake deploy-<TAB>`
gmake deploy ENV=prod                        # schema + code + functions + FE (NOT data)
gmake db-sql ENV=prod                        # just re-apply functions/views/policies
gmake deploy-funcs ENV=prod                  # just the edge functions
gmake deploy-func-waffle-build-board ENV=prod  # just one of them
gmake deploy-fe ENV=prod                     # just rebuild + redeploy the FE

# the hosted project itself — `gmake project-<TAB>`
gmake project-bootstrap ENV=prod MIGRATIONS=destroy   # stand one up from nothing
gmake project-config-api ENV=prod            # just the PostgREST settings. A NEW game's schema
                                             # ships via this — `deploy` does NOT update the
                                             # exposed-schemas list (also add the schema to
                                             # EXPOSED_SCHEMAS in deploy/env.sh + config.toml)

gmake -B <target>                            # force, ignoring stamps
gmake _stamps-clean ENV=local                # forget what we think is loaded there
gmake _audit                                 # check the make system itself
```

**Stamps.** A database table has no mtime, so `.make/$(ENV)/*.stamp` stands in
for one — touched after a load, with the real inputs as prerequisites. It
records *what we last did*, not what the database holds: someone else's
`db-reset` makes it lie. `-B` and `stamps-clean` are the escape hatches; the
failure mode is a needless re-import, never corruption.

**`gmake _audit`** is the make system's own test suite, and the only coverage
this corner of the repo has. It checks the bug class that kept recurring here:
that every target is inert under `-n` (a recipe mentioning `$(MAKE)` runs even
then, and `.ONESHELL` makes that the whole recipe), that local-only targets
ignore a `SUPABASE_DB_URL` exported in your shell, and that the destructive
targets refuse the wrong `ENV` **deliberately** — printing `REFUSED:` — rather
than by crashing into a guard that isn't one. Everything runs behind PATH shims,
so it reaches no database, and it restores the stamp mtimes it disturbs. Each
check was verified by planting the bug it looks for.

**`db` means a database you can play on** — structure *and* data. It used to
mean structure only, which read as "ready" while `common.words` sat empty and
every word game failed inside `create_game`. The structure-only half is
`db-schema-sql`, named for exactly what it runs; `deploy` uses that one, since
shipping code shouldn't reload 283k words.

**The one non-obvious edge:** `deploy-funcs` depends on `all-tries`, because the
boggle and scrabble functions compile their word bundles in — deploying without
regenerating ships a stale dictionary and nothing errors.

## `supabase …`

```
supabase start                                  # boot the local Docker stack
supabase stop                                   # tear it down (data persists)
supabase status                                 # ports, URLs, anon/publishable keys
supabase status -o env                          # same but env-format for scripts
```

### Migrations & schema

> **Which file?** Functions / views / policies / triggers / grants → edit
> `supabase/sql/<game>.sql` and run `gmake db-sql ENV=local`; that is never a
> migration. Tables / columns / constraints / indexes / the publication /
> seeds → a migration. See [supabase.md → Schema vs code](supabase.md#schema-vs-code).
> Note `supabase db diff` reports the repeatable objects as "drift" — they live
> outside the migration history by design.

```
supabase migration new <name>                   # create a timestamped empty .sql file
supabase migration list --linked                # which migrations are applied on prod
supabase db reset                               # local: drop, replay migrations + seed
supabase db diff                                # drift vs migrations — now dominated by the repeatable objects (see the note above)
supabase db push                                # apply pending migrations to the linked project
supabase db push --dry-run                      # preview what would be applied (recommended first!)
supabase db lint --local --level warning        # static schema checks
supabase db dump --local --schema common        # dump one schema as SQL
```

### Codegen, testing, linking

```
supabase gen types typescript --local           # → stdout; piped into src/types/db.ts
supabase test db --local supabase/tests         # pgTAP suite (recurses into subfolders)
supabase test db --local supabase/tests/codenamesduet/create_game_test.sql   # one file
supabase link --project-ref <ref>               # tie this checkout to a hosted project
supabase login                                  # one-time browser-based auth
```

### Edge Functions

```
supabase functions serve <name>                 # local hot-reload runtime
supabase functions deploy <name>                # ship to the linked project
supabase functions list                         # what's deployed on prod
supabase secrets set KEY=value                  # set a secret in prod runtime env
supabase secrets list                           # see what secrets are set (names only)
```

Local-only secrets live in `supabase/functions/.env` (gitignored). Production secrets are set via `supabase secrets set` — they live in Supabase's encrypted vault and are injected into the function's `Deno.env` at runtime.

### Inspecting the running local stack

```
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
# Studio:  http://localhost:54323
# Mailpit: http://localhost:54324   (magic-link emails in dev)
```

After `\connect`, useful starter queries:

```
\dn                                           # list schemas
\dt <schema>.*                                # tables in a schema
\df <schema>.*                                # functions in a schema
```

## pgTAP quick reference

The functions actually used in `supabase/tests/`. See
[`testing.md → Common pgTAP helpers`](testing.md#common-pgtap-helpers)
for the longer treatment (SQLSTATE conventions, persona helpers, the
`begin`/`rollback` wrap).

Every test file has this skeleton:

```sql
begin;
set search_path = <schema>, common, public, extensions;
\ir ../_shared/setup.psql                       -- personas + pg_temp.as_user
select plan(N);                                 -- I will run N assertions

-- ...assertions...

select * from finish();
rollback;
```

### Assertions

The assertion vocabulary (`plan` / `is` / `ok` / `throws_ok` — incl. the EXACT
message-match gotcha — / `lives_ok` / `finish`) lives in one place:
[`testing.md → pgTAP assertion functions`](testing.md#pgtap-assertion-functions). Don't re-copy the
semantics here (it's where a `throws_ok` substring-vs-exact contradiction once
crept in from duplication).

### Acting as a user

Defined in `_shared/setup.psql` (loaded by every test):

```sql
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- subsequent RPC calls run as ada
```

To drop back to the superuser (e.g. to bypass RLS for a cross-user
assertion, or to override a column the FE has no grant on):

```sql
reset role;
update common.games set play_state = 'won', is_terminal = true where id = ...;
```

To simulate an *unauthenticated* caller (clears the JWT claim while
staying in a role that can still call the function):

```sql
select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);
```

### SQLSTATEs the RPCs raise

| code | meaning | when |
|---|---|---|
| `42501` | `insufficient_privilege` | not authenticated; not a member; not a player |
| `P0001` | `raise_exception` (custom) | rule violation — wrong phase, bad input, business reject |
| `P0002` | `no_data` | row not found (game doesn't exist, etc.) |
| `23505` | `unique_violation` | handle collision, duplicate row |

### Persona UUIDs (for fast copy-paste)

```
ada      ada11111-1111-1111-1111-111111111111   -- default in-club actor
bea      bea22222-2222-2222-2222-222222222222   -- in-club, second player
cade     cade3333-3333-3333-3333-333333333333   -- in-club, non-player
dee      dee44444-4444-4444-4444-444444444444   -- outsider (RLS reject path)
eda      eda55555-5555-5555-5555-555555555555   -- second outsider
```

See [`testing.md → Personas`](testing.md#personas) for the conventions
on who plays which role.
