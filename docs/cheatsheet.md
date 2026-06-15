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
| `npm run db:reset` | wipe the local DB and replay every migration + seed |
| `npm run db:diff` | show what the local schema has that migrations don't |
| `npm run db:lint` | Supabase's schema linter — warnings + errors |
| `npm run types:gen` | regenerate `src/types/db.ts` from the live local schema |
| `npm run deploy` | full prod push: `supabase db push` → `supabase functions deploy` (all functions) → `vite build` → `netlify deploy -p -d dist` |

## `supabase …`

```
supabase start                                  # boot the local Docker stack
supabase stop                                   # tear it down (data persists)
supabase status                                 # ports, URLs, anon/publishable keys
supabase status -o env                          # same but env-format for scripts
```

### Migrations & schema

```
supabase migration new <name>                   # create a timestamped empty .sql file
supabase migration list --linked                # which migrations are applied on prod
supabase db reset                               # local: drop, replay migrations + seed
supabase db diff                                # show drift between local and migrations
supabase db push                                # apply pending migrations to the linked project
supabase db push --dry-run                      # preview what would be applied (recommended first!)
supabase db lint --local --level warning        # static schema checks
supabase db dump --local --schema common        # dump one schema as SQL
```

### Codegen, testing, linking

```
supabase gen types typescript --local           # → stdout; piped into src/types/db.ts
supabase test db --local supabase/tests         # pgTAP suite (recurses into subfolders)
supabase test db --local supabase/tests/tinyspy/create_game_test.sql   # one file
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

| function | meaning |
|---|---|
| `select plan(N)` | Declare you'll run N assertions. pgTAP errors if the actual count differs — catches dropped/extra asserts. |
| `select is(actual, expected, description)` | `actual = expected`, NULL-safe. The everyday assertion. |
| `select ok(boolean, description)` | The expression is true. Use when there's no obvious "expected value." |
| `select throws_ok($$ <sql> $$, sqlstate,` `message_substring, description)` | The wrapped SQL raises an exception matching SQLSTATE and (substring of) message. Pass `null` for the message to match any. |
| `select lives_ok($$ <sql> $$, description)` | The wrapped SQL doesn't raise. The "no error" partner of `throws_ok`. |
| `select * from finish()` | Closing TAP footer. Always immediately before `rollback`. |

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
update tinyspy.games set status = 'won' where id = ...;
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
