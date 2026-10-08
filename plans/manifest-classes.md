# Manifests as classes

**Status: DECIDED 2026-10-07, being built** on `app-audit`.

## What Joel decided

- **A manifest is a class, not an object literal.** The point is a place to
  collect a manifest's small functions, and to put what a family's two modes
  share in one place instead of writing it twice.
- **Three levels:** `Manifest` (every game) → `PsychicnumManifest` (what
  both modes share: the play area, setup form, help, scratchpad choice) →
  `PsychicnumCoopManifest` / `PsychicnumCompeteManifest` (what differs).
- **Each leaf class is created once with `new`**, and that object is the
  manifest. These are not static classes. TypeScript has no `abstract static`,
  so with static classes `Manifest` could not require a game to declare
  `gametype`, `mode` or `summaryFor`.
- **The instance is named for what it is**: `psychicnumCoopManifest`, in
  lowercase, while `PsychicnumCoopManifest` is the class. Today's
  `psychicnumCoopGame` names go.
- **`startGameInClub` has no default on `Manifest`.** The survey found three
  shapes, so a default would be wrong for two of them. Each family writes its
  own method against its own typed `db`.
- **`manifestRpcs.ts` folds into `Manifest`.** Once `submitTimeout` and
  `stopGame` are base methods, `makeRpcDispatcher` has no caller. Its docstring
  moves onto the methods, and its test's cases move to the base class's test.
- **No shared level across games for now** (a `BeeManifest` under spellingbee
  and wordwheel). Joel: *"this might be kind of thing we might do later."*
- **Stamps are not this plan's concern.**
- **The class is the type; `GameManifest` goes.** Joel: *"yes, no type
  needed, use the class as the type."*

## The target, for psychicnum

```ts
// common/manifest/: every game
abstract class Manifest {
  abstract readonly gametype: string
  abstract readonly mode: 'coop' | 'compete'
  abstract readonly numberOfPlayers: [number, number]
  abstract summaryFor(summary: SummaryData, members: readonly Member[], myId: string): string
  protected abstract readonly db: ...

  submitTimeout(gameId: string) { ... this.db ... 'submit_timeout' }
  stopGame(gameId: string)      { ... this.db ... 'stop_game' }
  protected makeLead(endingLabel: EndingLabel) { ... }
}

// psychicnum/manifest.ts: both modes
abstract class PsychicnumManifest extends Manifest {
  readonly schema = 'psychicnum'
  readonly baseGametype = 'psychicnum'
  readonly name = 'PsychicNum'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly PlayArea = playAreaLoader
  readonly setupForm = { Component: setupFormLoader, defaults: DEFAULT_PSYCHICNUM_SETUP }
  readonly scratchpad = 'none'
  readonly draftsOffTurn = false
  protected readonly db = db

  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    return runRpc<CreatedGame>(db.rpc('create_game', { ..., p_mode: this.mode }))
  }
}

class PsychicnumCoopManifest extends PsychicnumManifest {
  readonly gametype = 'psychicnum_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Find the three secret words together'
  readonly numberOfPlayers: [number, number] = [1, 6]
  summaryFor(...) { ... this.labelMidGame(summary) ... }
  private foundTally(summary: GSummaryData) { ... }
  private labelMidGame(summary: GSummaryData) { ... }
}

class PsychicnumCompeteManifest extends PsychicnumManifest { ... }

export const psychicnumCoopManifest = new PsychicnumCoopManifest()
export const psychicnumCompeteManifest = new PsychicnumCompeteManifest()
```

**What stays the same outside a game's folder.** Every reader still calls
`manifest.summaryFor(...)` and `manifest.stopGame(...)`. The ESLint rule that
reads the registry's `from './<name>/manifest'` imports keeps working, because
it matches the path and not the imported names.

**What changes outside it: the class is the type.** The shell
reads `Manifest`, and `GameManifest` goes. `Manifest['numberOfPlayers']`
works as an indexed type the same way `GameManifest['numberOfPlayers']`
does. The test fakes in `ClubPage.test.tsx`, `GamePage.test.tsx` and
`SetupGameModal.test.tsx` already cast their object literals (`as
GameManifest`, `as unknown as GameManifest`), and `as Manifest` compiles the
same way (checked with tsc). What would NOT compile is a fake annotated
without a cast, `const m: Manifest = { ... }`, because a literal has no `db`
or `makeLead`. No fake does that. The field docstrings move from the type
onto `Manifest`'s abstract members, their one home.

## What the survey found

Every `manifest.ts` was read for this plan (2026-10-07).

- **`makeLead` is the same function in 15 manifests** (byte-identical; only
  spellingbee and wordwheel lack it). It moves to `Manifest`.
- **`submitTimeout` and `stopGame` are the same two lines in all 17**:
  `makeRpcDispatcher(db, …)`. They move to `Manifest`, reading `this.db`.
- **`startGameInClub` comes in three shapes:**

  | shape | games |
  |---|---|
  | `create_game` RPC with `p_mode` | connections, crosswords (plus `p_board`), psychicnum, scrabble, setgame, stackdown, strands, wordle |
  | `create_game` RPC, no mode | codenamesduet, bananagrams |
  | `<base>-build-board` edge function with `mode` | boggle, letterboxed, spellingbee, waffle, wordiply, wordleone, wordwheel |

  Every two-mode family uses the same factory, `startGameInClubFactory(mode)`
  (strands names it `startGameInClub`). It becomes a family method reading
  `this.mode`.
- **`setupForm` differs by mode in six families**, so it goes in the leaves
  there: boggle, letterboxed, setgame, spellingbee and strands have per-mode
  `defaults` and/or `intro`, and scrabble has `validate` only in compete. The
  other families share one `setupForm`.
- **Nothing outside a game takes a method off a manifest and calls it later**
  (`const { stopGame } = manifest`, or passing `manifest.stopGame` as a
  callback). A method that does that loses `this`. Today every call is
  `manifest.x(...)`, so methods are safe.
- **Nothing copies a real manifest with `...`.** Copying an instance that way
  keeps its fields but drops its methods. The only spreads of a manifest are
  of test fakes (`useClubGames.test.ts`), which stay object literals.
- **Single-mode games** (codenamesduet, bananagrams) have no family level: one
  class extends `Manifest` directly.

## TypeScript rules this shape needs

These were checked with `tsc --strict --target es2023`. Each one breaks the
build when broken, so none of them can go wrong silently.

1. **A field that has to stay a literal type is `readonly` or annotated.**
   Unlike an object typed `GameManifest`, a class field does not take its type
   from the abstract member it fills: `mode = 'coop'` infers `string` and fails.
   So `readonly mode = 'coop'`, and `numberOfPlayers: [number, number] =
   [1, 6]`. The tuple needs the annotation, because `readonly` would infer
   `readonly [1, 6]`, which doesn't fit `[number, number]`.
2. **Method parameters are typed.** `summaryFor(summary, members, myId)` is an
   implicit-`any` error without types.
3. **A family field cannot read `this.mode` in its initializer.** Base-class
   fields are set before the leaf's, so the value would be `undefined`, and tsc
   rejects it (TS2715). A family member that depends on the mode is either a
   method (like `startGameInClub`), which reads `this.mode` when called, or is
   declared in the leaf (like boggle's `setupForm`).
4. **No constructor parameter properties.** `erasableSyntaxOnly` forbids
   `constructor(readonly mode)`, so `mode` is a plain field on the leaf.
5. **Lazy components stay module-level constants.** `help = helpLoader` where
   `helpLoader` is the existing `lazy(...)`, so a family's two modes share one
   lazy component as they do today.

## The steps

Each step leaves the repo green. Until the last game converts, `GameManifest`
stays as the type the shell and the registry read, and `Manifest` implements
it. So a not-yet-converted object-literal manifest still compiles, and games
convert one at a time with no step where everything has to change at once.
Each step ends with `tsc -b`, eslint, vitest and the guards, and then **stops
for Joel's review**.

1. **`Manifest` in `common/manifest/`**, beside `gameManifest.ts`, with
   `submitTimeout`, `stopGame` and `makeLead`, and a test for the two RPC
   methods, taking `manifestRpcs.test.ts`'s cases. No game uses it yet.
2. **psychicnum**, the canary. Its header docstring shrinks to what the
   classes don't already say. Its instances are renamed in `src/gametypes.ts`
   and everywhere they're imported.
3. **The games already converted to the audited shape**: wordle, connections,
   codenamesduet, then spellingbee and wordwheel together (they share
   `shared/bee-games`'s summaries).
4. **The rest**: bananagrams, boggle, crosswords, letterboxed, scrabble,
   setgame, stackdown, strands, waffle, wordiply, wordleone.
5. **The class becomes the type.** The registry becomes `Manifest[]`. Every
   reader of `GameManifest` (about 70 references across the shell, the test
   fakes' casts, game `Help.tsx` docstrings and the docs) reads `Manifest`.
   The field docstrings move onto `Manifest`'s members, and `GameManifest`
   is deleted. The shared helpers that file also holds (`CreatedGame`,
   `GameStopResult`, `MODE_LABEL`, the `playerCount*` functions) stay where
   they are. `manifestRpcs.ts` and its test are deleted, since no manifest
   calls `makeRpcDispatcher` any more.
6. **The docs**:
   [docs/common.md → The sibling-manifest
   pattern](../docs/common.md#the-sibling-manifest-pattern),
   [docs/code-conventions.md → Sibling
   gametypes](../docs/code-conventions.md#sibling-gametypes-coopcompete-variants),
   which says siblings are "built by a factory",
   [src/common/manifest/doc.md](../src/common/manifest/doc.md), the header of
   [gameManifest.ts](../src/common/manifest/gameManifest.ts). (Done with
   steps 3–4: the brand lives in the manifest's `name` and everything else
   reads it from there — Joel, 2026-10-07 — so
   [docs/naming.md](../docs/naming.md) and the boggle, crosswords,
   letterboxed, scrabble, strands, waffle and wordiply docs say so, and
   wordiply's no longer names `makeRpcDispatcher`.)
7. **Close**: what lasts goes into `common/manifest/doc.md`, the "Make each
   manifest an instance of a class" item leaves
   [src/common/manifest/todo.md](../src/common/manifest/todo.md), and this
   plan is deleted.

No step touches SQL, edge functions or e2e helpers. The behavior is the same
by construction, so whether to run e2e is Joel's call after step 2. If he
wants it, psychicnum's start, stop and timeout specs are the ones to run.

## Open

Nothing.
