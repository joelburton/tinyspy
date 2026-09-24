# Code conventions

The house rules for writing code in `src/` and `supabase/`: the ones the
surrounding code won't teach you, or teaches wrong. A mechanism's own rules
live with the mechanism — its folder's `doc.md` or its docstring — and this doc
points at them rather than repeating them. For terminology see
[naming.md](naming.md); for tests, [testing.md](testing.md).

## Before you write

- **The surrounding code is not evidence.** Much of the app predates rules
  written here, so a nearby file doing it differently is not permission. This
  doc, a folder's `doc.md`, and files stamped `cs-blessed-*` are the models.
- **A new file needs a first-line `cs-` stamp**, or
  `src/guards/csStamps.test.ts` fails
  ([plans/app-audit.md → The stamp](../plans/app-audit.md#the-stamp)). Only
  Joel writes `cs-blessed`.
- **Many rules here are guarded.** `npx vitest run src/guards` runs them all
  ([testing.md → Repo-wide invariant
  guards](testing.md#repo-wide-invariant-guards)); where a rule below names its
  guard, the guard is the authority.
- **The loop:** `npx tsc -b` (not `tsc --noEmit`), `npm run lint`, the guards,
  the tests beside what you touched. After editing `supabase/sql/`, re-apply it
  with `gmake db-sql ENV=local`; run pgTAP as the whole suite (`gmake test-db`).
  A shape change is a new migration ([CLAUDE.md → Production
  software](../CLAUDE.md#production-software--preserve-the-data-migrate-forward)).
- **Where the machinery is explained:**

  | writing… | read |
  |---|---|
  | an RPC, read or edge-function call | [envelopes.md → The shape of a call site](envelopes.md#the-shape-of-a-call-site), `src/common/supabase/doc.md` |
  | a command (a button, menu row or key) | `src/common/actions/doc.md` — the `ACTIONS` registry, `useBoundAction` |
  | a message to the player | `src/common/feedback/doc.md` |
  | a realtime hook or channel | `src/common/realtime/doc.md` |
  | a play surface | [playarea.md](playarea.md) |
  | CSS values, colors, the z- layers | [tokens.md](tokens.md), `core-css/base.css` → THE Z- LAYERS |
  | where a shared file goes | [common-folders.md](common-folders.md) |

## Code clarity & docstrings

The explanation bar in this codebase is higher than the average TypeScript
project — see [`../CLAUDE.md → Educational
priority`](../CLAUDE.md#educational-priority--clarity-over-brevity) for the
prior. **The bar is on docstrings**, which explain a thing once for everyone who
uses it. A comment is a different job: it explains something non-obvious about
the code in front of the reader. It does not teach, and it does not restate what
a shared thing's docstring already says.

- **Docstrings on every exported function, component, hook, and RPC.** What it
  does, why it exists, and any non-obvious constraints. The codenamesduet RPCs
  in [`supabase/sql/codenamesduet.sql`](../supabase/sql/codenamesduet.sql) and
  [`ClueStrip.tsx`](../src/codenamesduet/components/ClueStrip.tsx) are the
  model.
- **Code comments where the WHY isn't obvious.** Subtle invariants, trade-offs,
  platform workarounds. The test is whether a reader needs it to read or safely
  change *this* code — not whether it's interesting. Design rationale goes in
  `docs/` or the folder's `doc.md`; how the code came to be goes in the commit
  message.
- **The `/**` marker belongs to docstrings alone; a note inside a structure or a
  body takes `//`.** A docstring answers *should I read this, and how do I call
  it*, and the editor lights it up so that can be answered by scanning. A note
  about one field, one statement, or why the body is written as it is answers a
  different question; giving it the docstring marker makes everything on screen
  look like something you must read first. `//` is preferred; `/* */` is fine.
  It is also how a docstring stays short: a paragraph defending the
  implementation belongs on the line it defends.
  [`dbLog.ts`](../src/common/supabase/dbLog.ts) is the model.

  **A component's props are fields, so a prop note is `//`.** `type Props = { …
  }` is one declaration; the docstring that answers "how do I call this" is the
  component's own. [`members/Dot.tsx`](../src/common/members/Dot.tsx) is the
  model. **Much of the app does not comply yet**, audited folders included.
- **A comment about a SHARED concept or mechanism shrinks to a reminder and a
  pointer.** What an envelope, an outcome or a severity *is* lives in one doc;
  what a shared hook does lives in its docstring. The caller writes one sentence
  naming the job:

  ```ts
  // Guards non-idempotent requests from firing twice; see `useSingleFlight`.
  ```

  What *this code* does — true here and nowhere else — stays. The tell is
  whether editing the shared thing would make the comment wrong.
- **Prefer one clear path over a clever one**, and **extract a small helper over
  a nested ternary**: one `a ? b : c` is fine, two deep reads better as a
  function with `if` branches
  ([`psychicnum/manifest.ts → labelFor`](../src/psychicnum/manifest.ts)).
- **Names describe role, not implementation** (`isClueGiver`, not `playerA`),
  and there are no single-letter helpers, even for a formatter used twice.
- **Name and comment non-trivial hook callbacks** — see [Hook
  callbacks](#hook-callbacks-a-header-comment-and-a-name).

**What doesn't belong:** comments that restate the code; references to the
task, PR or reviewer (`// per joel's review`) — those go in the commit message;
TODOs with no trigger — delete them, or file them in the folder's `todo.md`.

## Naming

### TypeScript casing

> **snake_case** for fields that mirror a Postgres row. **camelCase** for
> TS-native shapes: props, FE-built normalizations, manifest types.

The test: would `supabase gen types` emit these field names for that table? Then
it is DB-shaped. Both forms appear in one file for a reason — snake says "this
came from the DB unmodified", camel says "we designed this in TS".

**Keys inside a jsonb blob are DB-shaped too** — `setup`, `status`, `result`,
`meta`. They read the same in SQL and TS (`setup->>'coop_style'`,
`s.coop_style`), persist in rows, and `gen types` can't type them: **snake_case,
always.** Where a camelCase prop feeds a snake_case key, spell the mapping out
at the seam:

```tsx
coopStyle={s.coop_style ?? 'free-for-all'}
onChange={({ coopStyle, firstTurnUserId }) =>
  onChange({ ...s, coop_style: coopStyle, first_turn_user_id: firstTurnUserId })
}
```

**A DB-shaped type's name ends in `Row`** (`GameRow`, `PlayerRow`, and aliases
of generated `Database[…]['Row']` types); a TS-native shape takes whatever names
its role (`ClubListEntry`, `GamePageCtx`, `GameManifest`). A snake_case type
without `Row` invites readers to forget they are touching schema-bound data.

| kind | convention | examples |
|---|---|---|
| functions, parameters, locals | camelCase | `enterGame`, `gameId` |
| components | PascalCase | `ClubPage`, `PlayArea` |
| module-level constants | SCREAMING_SNAKE_CASE | `GAMETYPES`, `STATUS_LABEL` |
| files — components | PascalCase | `PlayArea.tsx` |
| files — hooks, lib, db handles | camelCase | `useGame.ts`, `cls.ts`, `db.ts` |
| files — docs | kebab-case | `code-conventions.md` |

- **A lookup table's name says what it maps and what the values ARE:**
  `SEVERITY_TO_DB_LOG_KIND`, not `NOT_OK_KIND`. The house form is `FOO_TO_BAR`,
  spelled out.
- **A hook returning `boolean` is named for the question it answers:**
  `useIsMobile`, `useGameHasKeyboard`. `usePhone()` reads as "give me a phone",
  and flattens a hook that ANSWERS into one that DOES.

### Member vs Player — one type, context-driven variable names

`Member` ([`src/common/members/member.ts`](../src/common/members/member.ts)) is
the one identity shape. Each game declares a `Player` on top of it — a pure
alias (`export type Player = Member`) or an extension (codenamesduet adds
`seat`) — so every game's vocabulary reads the same and the type is already
named when a game grows per-player state.

| context | type | variable |
|---|---|---|
| club listing, chat, setup forms | `Member` | `members` |
| inside a game | the game's `Player` | `players` |

`useCommonGame` returns `players: Member[]`: the identity type, named for its
game-context consumers. **`peer`** is the viewer-relative third word — another
player in this game, from my point of view (`isPeer`, `peers`) — and has no type
of its own. See [naming.md → player](naming.md#player) and
[→ peer](naming.md#peer).

### Component names

Roles, not implementations, and **file name = component name**, with the folder
telling which game: every game has a `PlayArea.tsx` exporting `PlayArea`, a
`SetupForm`, a `Help`, a `useGame`; never `ConnectionsPlayArea`. The shared
shell is `GamePage`; cross-cutting chrome (title, timer, pause, chat) is its,
never a PlayArea's. The two-column split is [playarea.md → The shape of a
game's PlayArea.tsx](playarea.md#the-shape-of-a-games-playareatsx).

**One component per file — with one exception.** A component that stands on its
own gets its own file, always. The exception is a set of **subparts that exist
only inside one component and are individually small**: they are one vocabulary
and a caller reaches for them together, so they share the file.
`common/event-log/EventLog.tsx` exports the panel plus `EventLogOutcomeBar`,
`EventLogNumber` and `EventLogActor`, the cells a game builds a row from. **The
exception is about size and dependence, never subject:** `HistoryBanner` belongs
to the viewer, not the log, so it is its own file beside `useHistoryViewer.ts`.
When a folder holds two concerns, the filenames say which one you are in.

### Grid coordinates

The games with a coordinate grid and a keyboard cursor (bananagrams, scrabble)
share one vocabulary: **`x` = column, `y` = row; `'h'` / `'v'` for the cursor's
axis; flat index `y * width + x`.** Not `row`/`col`, not a y-first index — the
two are compared side by side, and their shared mechanics live in
[`common/board-cursor`](../src/common/board-cursor/doc.md) and
[`shared/grid-and-drag`](../src/shared/grid-and-drag/doc.md). A grid addressed
by flat index or by tile identity has no pair to name; don't invent one.

### Feedback

"Feedback" means a message in the global (header) or local (below-board) slot,
nothing else, and **bare `feedback` is never a declared name**
(`feedbackNames.test.ts`). **Never hand a server's `error.message` to a slot**:
`FeedbackMessage.notOk(res)` carries the sentence someone wrote for the player
(`noRawServerMessage.test.ts`). The vocabulary is
[`src/common/feedback/doc.md`](../src/common/feedback/doc.md)'s.

## React

### Shared vs game-specific

1. **If two games have a very similar requirement, extract it into `common/` or
   `shared/` — early.** Even at two call sites with one of them trivial: the
   named seam is a forcing function for design work, and by the third call site
   the second has quietly shaped the abstraction. This **overrides** the usual
   "wait until complexity justifies it" default; don't propose waiting. It holds
   for splitting a component by state locality too. Premature is only
   coincidental likeness (two things that share a look but will diverge) or
   truly one-shot UI.
2. **If two games need similar-but-different implementations, name them the
   same.** The same role-noun across games lets a reader see the parallel by
   sight; the folder says which game.

Which folder a shared file goes in is [common-folders.md](common-folders.md).

**Per-game `useGame` — pick the template by seats.** A **fixed-seat** game
(codenamesduet's `user_a_id` / `user_b_id`) fetches its own roster, because the
seat ⇄ user mapping lives on its row. An **open N-player** game reads `players`
from `GamePageCtx`; `useCommonGame` has already loaded it. Don't mix them.

### Import direction

Enforced by ESLint's `no-restricted-imports`
([`eslint.config.js`](../eslint.config.js)): `common/` and `shared/` never
import a game; a game never imports another game; `src/gametypes.ts` is the one
file that imports every manifest. Wanting to import across games means the
thing belongs in `common/` or `shared/`; a common piece wanting a game means the
abstraction is wrong (take a `db` handle or a render prop). The rule's list of
games is derived from `gametypes.ts`, so a new game needs no lint edit. The
layering between `common/` and `shared/` is
[common-folders.md](common-folders.md)'s.

### Hook callbacks: a header comment and a name

An inline hook callback has no name, so a reader has to work out what it does
and what triggers it from the body and the deps.

- **Every non-trivial effect gets a header comment ABOVE the `useEffect(…)`**,
  leading with intent and saying why these deps when that isn't obvious —
  `[session.user.id]` rather than `[session]` so a token refresh doesn't
  refetch. Same for a non-trivial `useCallback` / `useMemo`.
- **A non-trivial `useEffect` callback is a named function expression:**
  `useEffect(function joinGameRoom() { … }, [gameId])`. The name shows in stack
  traces, DevTools and prose, and choosing it catches an effect doing three
  things.
- **A `useCallback` / `useMemo` assigned to a `const` skips the inner name** —
  the const carries it. Name the inner one only when it's inline (a JSX prop, a
  return) or genuinely names something different from the const.
- **The test is the body, not the call shape.** A `.then(…)` that branches four
  ways takes a name too (`GamePage`'s `logHowTheTimeoutLanded`). If it deserves
  a header comment, it deserves a name; a one-line `onClick` or `.map` needs
  neither.

### Guarding a non-idempotent action

An action whose second call does real, unwanted work needs an in-flight guard
on the **handler**, not the button — one action is reachable from a button, a
menu row and a key. A bound action's run
([`useBoundAction`](../src/common/actions/useBoundAction.ts)) already is
single-flight; a control that isn't an action wraps its handler in
[`useSingleFlight`](../src/common/single-flight/useSingleFlight.ts). Don't guard
idempotent calls every client fires (`submit_timeout`).

## CSS

The design side — tokens, themes, the color system, the vocabularies — is
[tokens.md](tokens.md) and [ui.md](ui.md). The z- layers are
`core-css/base.css` → THE Z- LAYERS. This section is how the files are written.

**CSS Modules, one `*.module.css` per component, beside its `.tsx`.** Values
come from tokens at `:root` via `var(--token)`. Classes are combined at the call
site with `cls()` ([`utils/cls.ts`](../src/common/utils/cls.ts)); nothing uses
`composes:` today (whether a game should extend a shared look with it is open in
`common/info-sheet/todo.md`). No global `.css` for components, no CSS-in-JS, no
Tailwind.

**A capitalized stylesheet is one component's; a lowercase one is shared.**
`Foo.module.css` is the look of `Foo`, and only `Foo` (and its test) imports
it, so it can be changed worrying only about `Foo`. A sheet meant to be read by
several components is named in lowercase (`historyViewer.module.css`,
`playArea.module.css`), because it is not any one component's.

### A module styles its own elements

CSS Modules is a build-time rename, not a browser feature, and `:global()` opts
out of it entirely: `:global(.item-row) { … }` in `ClubPage.module.css` ships as
plain `.item-row` and restyles the homepage too. The rule is about the
selector's **subject**, its rightmost compound:

```css
:global(.item-row)            { … }   /* ✗ styles every item-row in the app */
.gamesList :global(.item-row) { … }   /* ✓ scoped by a local ancestor      */
:global(.dragging) .row       { … }   /* ✓ subject is local                */
```

`cssTokens.test.ts` fails on the first form. **Prefer a local class on the
element even where the scoped form is legal**: the override sits with
everything else about that element, and having to write it makes you ask
whether the shared pattern wants a variant.

- **A class name says what the thing IS, not its slot.** `.body` (body of
  what?), `.wrapper`, `.content` and `.card` are the usual offenders.
- **A component's own module may use short names; a consumer's may not.** Inside
  `FilterSelect.module.css`, `.label` is the select's. A class a consumer passes
  INTO a shared component names the component: `.filterSelectLabel`,
  `.rosterDot`.
- **Don't give a local class a global's bare name.** `styles.button` beside
  `'button'` looks like one class and is two; say what it modifies
  (`.saveButton`).

### The CSS checklist

1. **No `var()` fallbacks.** We own the namespace, so a missing token is a bug a
   fallback can only mask. `cssTokens.test.ts` checks both directions — every
   reference resolves, every definition has a reader; a token live before its
   reader goes in its `DECLARED_AHEAD` list. (`var(--client-width, 100vw)` is a
   parameter default for the first paint, not a fallback.)
2. **Desktop-first: `@media (--mobile)` overrides the base rule**, never the
   reverse, and **lives directly under the rule it overrides**, in the same
   file. A `min-width` query means a rule was written backwards
   ([mobile.md](mobile.md)).
3. **A component on two surfaces keeps the roomier one as its base**, and the
   compressed variant is scoped to its surface (`[data-mobile-status] .stats`),
   not threaded through as a `compact` prop.
4. **State classes re-set tokens; they don't out-cascade.** `.dropOk` sets
   `--tile-slot-fill-color` and the base rule consumes it.
5. **Click-to-define words are `<DefinableWord>`** — pointer-only, no
   `tabIndex`, no focus style
   ([`utilities.css`](../src/common/core-css/utilities.css) → `.definable`).
6. **`_variant` suffixes** name classes picked by a `` styles[`base_${key}`] ``
   lookup: `.outcome_won`, `.guessWord_G`. The underscore marks a class no
   literal references, so grepping it finds them all.
7. **A converted surface writes vocabulary values, not literals**, held by
   `vocabularies.test.ts`'s shrinking allowlist keyed by value. The vocabularies
   are [tokens.md → The non-color
   vocabularies](tokens.md#the-non-color-vocabularies).

A game's `theme.css` ships in its lazy chunk, so a game file rendered outside
`PlayArea` imports it itself; see [Known
gotchas](#a-games-stylesheet-ships-in-its-lazy-chunk).

### Patterns — a class, a token, or a utility

A pattern list is written by reading rendered surfaces, **never by grepping
class names**: local names hide shared patterns.

- **Names for things, utilities for adjustments.** Can you say what it is
  without saying how it looks? "The line under a field" — name it. "Quieter than
  its neighbor" — that's `.muted`, a utility.
- **Promote on the SECOND write.** Copying a rule out of another module is the
  signal.
- **No silent default.** Both variants get said; neither is what you get by
  staying quiet.
- **Compose on *is-a*, never *looks-like*.** A danger button is a button. Help
  text is not a kind of muted. The menu is not a list (actions that close vs
  places that stay).
- **A pattern gets a file named for it** (`core-css/patterns/badge.css`).

| kind | where |
|---|---|
| an adjustment that names nothing | `core-css/utilities.css` |
| a pattern with structure or behavior | a React component + its module |
| a pattern that is only a look | `core-css/patterns/<name>.css` |
| one component's internals | that component's module |
| game-specific | that game's module |

**A common component's module holds its own internals, never a re-implementation
of a pattern**, and **a shared stylesheet with many consumers and no component
is a component waiting to be written.**

**Class or token?** If shared CSS needs a value injected by someone who doesn't
know its meaning, it stays a token slot (the shared `.tile` reads
`--tile-bg-color`; `<Dot>` builds `var(--member-${name}-color)`). If the meaning
paints several properties together, it's a class (a button tone). Otherwise,
whichever is fewer names.

## Database

### Schemas

| schema | what lives there |
|---|---|
| `public` | Postgres-managed things only. **We add no tables here.** |
| `common` | Shared tables and helpers every game uses. **Never references a game schema.** |
| `<game>` | One schema per gametype: its tables, RPCs and policies. |

Game schemas are not on the search path: SQL writes `codenamesduet.games` in
full, and the FE goes through `supabase.schema('<game>')`. A new schema also
goes in `[api].schemas` in `supabase/config.toml` — see [Known
gotchas](#cross-schema-typescript-types).

### Tables and columns

No game prefix (`codenamesduet.words`), `snake_case`, plural tables, FKs as
`<thing>_id` with a role prefix where ambiguous (`next_game_id`). Every game's
event log is `<game>.events` in the standard shape ([supabase.md](supabase.md)).

### RPC functions

- Live in the schema they operate on, named for the verb (`create_game`,
  `submit_guess`); the schema carries the game. Shared ones live in `common` and
  may not reference a game.
- Callable RPCs are `security definer` with a pinned
  `set search_path = <game>, common, public, extensions`, which neutralizes
  search-path hijacking.
- They answer in an envelope ([envelopes.md → How SQL builds
  one](envelopes.md#how-sql-builds-one)).
- Authorization is `common.require_game_player(target_game)`, which returns the
  caller's id or raises; the RPC derives seat or role from its own state after
  that. SELECT policies gate on `common.is_club_member(club_handle)`, because a
  common helper can't read a game's table. Helpers read by policies are
  `STABLE`, so Postgres can cache them within one query.

### Every function gets an explicit revoke

Postgres grants EXECUTE to PUBLIC on every new function, so the pair goes right
after each definition in `supabase/sql/<game>.sql`:

```sql
revoke execute on function <schema>.<fn>(<types>) from public;
grant  execute on function <schema>.<fn>(<types>) to authenticated;  -- ONLY if the caller runs it
```

Grant only what the caller executes: player-facing RPCs, and helpers reached
through an RLS policy or a `security_invoker` view (a policy runs as the
invoker). Anything called only from inside a `security definer` function needs
no grant; a `_`-prefixed helper with one should be able to name the policy or
view that forces it. `tests/common/function_grants_test.sql` fails on any
function executable by PUBLIC.

### SECURITY DEFINER helper + security_invoker view

To expose a column the caller can't read directly, gated on row state ("reveal
the answer once the game ends"):

1. Keep the base table's column grant, so the role can't SELECT the column.
2. A `SECURITY DEFINER` helper reads it and returns it conditionally.
3. A view `with (security_invoker = true)` calls the helper for that column, so
   RLS on the base table still gates rows as the caller.
4. The FE reads the view.

Canonical: `psychicnum.games_state` + `psychicnum._secrets_for(uuid)`
([src/psychicnum/doc.md → Schema](../src/psychicnum/doc.md#schema)).

### Migrations

`supabase/migrations/<timestamp>_<topic>.sql`. Each game has one frozen
baseline (`<ts>_<game>.sql`), never edited; every shape change since is a new
file named for what it does (`20260922000000_waffle_event_colors.sql`,
`20260915000000_games_restarts.sql`). Behavior is not a migration — it lives in
`supabase/sql/` ([supabase.md → Schema vs code](supabase.md#schema-vs-code)).
A migration cannot call functions from `supabase/sql/`, which is applied after
it.

### Per-game player counts

A game's player range is stated in three places, and nothing syncs them:

- the manifest's `numberOfPlayers: [min, max]`, which the FE uses to enable the
  Start buttons (both ends required; every game has a cap);
- `common.gametypes.min_players`, which answers only "can this be played solo?"
  for new-club enrollment and solo clubs;
- the game's `create_game`, which enforces the cap with
  `common.require_player_count_max` (codenamesduet checks exactly 2 inline) and
  the compete floor of 2 with its own check.

Comments on each side name the partner; edit them together. A mismatch reaches
the player as a fault, not a readable message.

### Sibling gametypes (coop/compete variants)

A family of gametypes that share a schema, folder and docs
([common.md → The sibling-manifest
pattern](common.md#the-sibling-manifest-pattern)):

- **Each sibling is its own `GameManifest` export** from the same
  `src/<base>/manifest.ts`, built by a factory where the fields are
  near-identical.
- **One `<base>.games.mode` column**, `check (mode in ('coop', 'compete'))`,
  denormalized at create time; RLS reads it rather than joining to
  `common.games.gametype`.
- **One `<base>.create_game(…, mode)`** routes both; it composes
  `'<base>_' || mode`, validates the mode with `common.require_valid_mode`, and
  holds any per-mode validation. A game whose board is built in an edge
  function reaches it through that function.
- **Mid-game RPCs branch on `mode` in one function**, both paths visible.
- **Tests cover both modes in the same files.**
- **No `setup.mode`.** Mode is fixed by the gametype; a second copy would reopen
  "which Start button did I press?".

**What round-trips into a club's saved setup:** a style preference does
(`coop_style`); a specific person doesn't (`first_turn_user_id` is stripped in
`create_game`). See [common-schema.md →
Turn-order](common-schema.md#turn-order--opt-in-turn-by-turn-for-coop-games).

### Avoid `SELECT *`

Every `.from('foo').select(...)` names its columns, and its row type is a
`Pick<>` of the generated one, so the two drift together and TypeScript catches
a mismatch:

```ts
type ClubRow = Pick<Database['common']['Tables']['clubs']['Row'], 'id' | 'handle' | 'name'>
… .from('clubs').select('id, handle, name')
```

A new column then fails closed: it reaches no consumer that hasn't chosen it,
and a sensitive column added later can't leak through a wildcard. `select('*')`
is fine only where the consumer uses every column and the table won't grow
sensitive ones — rare.

## Edge Functions

Edge functions share one flat namespace, so they are the one place names carry
the game: `<game>-<feature>` (`codenamesduet-suggest-clue`) or
`common-<feature>` (`common-define`), matching
`supabase/functions/<name>/index.ts`. They answer in an envelope, always HTTP
200 ([`src/common/supabase/doc.md`](../src/common/supabase/doc.md)). Deno
resolves no `@/` alias and no extensionless import, and `deno check` does not
catch either.

## Known gotchas

### `window` is always there; a browser FEATURE may not be

This is a Vite SPA with no server render, and jsdom provides a `window` too, so
**`typeof window !== 'undefined'` guards a case that cannot happen.** What goes
missing is a feature on `window` — `matchMedia` (absent in jsdom, which every
test's desktop default depends on), `visualViewport`, `ResizeObserver`. Guard
the feature, name where it's missing, and use `window` bare.
`useSyncExternalStore`'s third argument is the same phantom: say so where one is
passed. Some folders still carry old guards that supply a fallback value, so
removing one is a per-folder decision.

### A game's stylesheet ships in its lazy chunk

The core stylesheets and the theme chain load once from `main.tsx`; each game's
`theme.css` ships in that game's lazy chunk, so a game file rendered outside
`PlayArea` (setgame's `SetupForm`, crosswords' picker modals) imports it itself.
An undefined custom property invalidates its whole declaration, silently.

### Contract slots nobody declares

Common CSS reads some custom properties a game fills in and no file declares:
`--cols`, `--max-tile-width`, `--grid-gap`, `--board-units-w/h/cap`,
`--max-board-size`, `--rank-text`, `--tile-font-factor/-min/-max`,
`--stats-col-gap`, `--stats-max-width`, `--local-feedback-min-height`,
`--swap-box-min-height`. A game that mounts the reader and forgets one gets a
dead declaration, and the token guard passes it because some other game defines
it. A per-mount-point guard is owed (`game-page/todo.md`).

### Cross-schema embeds (PostgREST)

PostgREST discovers FK relationships only within one schema, so
`.select('id, user_a_id, profiles(username)')` from a game table fails with
PGRST200 even though the FK to `common.profiles` exists, and the `!fkname` hint
doesn't rescue it. Fetch the two sides separately and merge in JS
([`codenamesduet/hooks/useGame.ts`](../src/codenamesduet/hooks/useGame.ts)), or
do the join in a `security definer` RPC.

### `data[0]` is typed as present, so a zero-rows check needs a cast

`readRows` hands back `Row[]`, and indexing it gives `Row`, not
`Row | undefined` (`noUncheckedIndexedAccess` is off), so an `if (!row)` reads
as dead code to the compiler while at runtime it is the ordinary "no such game"
case:

```ts
const row = gameRes.data[0] as GameRow | undefined
if (!row) { setGame(null); setLoading(false); return }
```

The cast widens, so it admits nothing unsafe. Turning the flag on isn't the fix:
it costs hundreds of errors, almost all safe grid indexing.

### Cross-schema TypeScript types

`supabase gen types` emits a `Database` type keyed by schema, so
`supabase.schema('codenamesduet').from('words')` is fully typed. A new schema
also needs `[api].schemas` in `supabase/config.toml`, `npm run types:gen`, and
**`supabase stop && supabase start`** — `gmake db-reset ENV=local` doesn't
re-read `config.toml`, so PostgREST keeps rejecting the schema with PGRST106.
