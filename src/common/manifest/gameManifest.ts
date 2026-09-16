// cs-blessed-manifest

import type { ComponentType } from 'react'
// Type-only, so the cycle these participate in is erased at runtime.
import type { Envelope } from '../supabase/envelope'
import type { GameSetupForm } from '../setup-form/setupForm'
import type { GamePageCtx } from '../game-page/gamePageCtx'

/**
 * WHAT A GAME DECLARES — the shape each game's `manifest.ts` exports so the
 * shell can render it without ever naming it.
 *
 * `GameManifest` is the whole subject; everything else here exists because one
 * of its members needs a type. `CommonGameListRow` is the narrow row slice
 * `labelFor` may read; `CreatedGame` and `GameStopResult` are what its three
 * RPC members answer with; the `playerCount*` helpers format `numberOfPlayers`
 * for the club page. `TimerMode` is the one exception to "a member needs it":
 * it is the shape of a game's `setup.timer`, kept here because every setup
 * form and `useGameTimer` speak it and the manifest is where a game's contract
 * with the shell is read.
 *
 * **The two files either side of this one**, since the names are close:
 * `src/gametypes.ts` is the REGISTRY — the list that collects these manifests,
 * and the only file allowed to import every game. `common/game-page/
 * gamePageCtx.ts` is the other half of this contract — what the shell hands a
 * game back while it is being played. A game says what it is here and gets that
 * there. Those two keep the most obvious paths in `common/` on purpose, because
 * they are what a new game is written against (docs/common-folders.md →
 * Judgment calls).
 *
 * The smaller contracts a game also meets, and where each one lives:
 *
 *   - who someone is ......... `common/members/member.ts`
 *   - how an ending is said ... `common/terminal/terminalOutcomeVerb.ts`
 *   - what a setup form is ... `common/setup-form/setupForm.ts`
 *   - what a message is ...... `common/feedback/FeedbackMessage.tsx`
 *   - what a menu is ......... `common/menu/menuModel.ts`
 *   - what a game is handed .. `common/game-page/gamePageCtx.ts`
 */

/**
 * FE-facing labels for a gametype's interaction `mode`.
 */
export const MODE_LABEL: Record<'coop' | 'compete', string> = {
  coop: 'Co-op',
  compete: 'Compete',
}

/**
 * **What every game's `create_game` puts in `data`.** One shape, every
 * schema: `result` names the answer, `id` is the game to go to.
 */
export type CreatedGame = { result: 'created'; id: string }

/**
 * What `end_game` and `submit_timeout` both answer with: the game is over.
 * ONE result for both, because it is one fact — HOW it came to be over is
 * already in `common.games.status`, which every surface reads anyway.
 */
export type GameStopResult = { result: 'ended' }

/**
 * Manifest exported by each game's `manifest.ts`. The shell
 * consumes the registry of manifests (`src/gametypes.ts`) and never
 * names a specific game directly — see docs/common.md for the removability
 * invariant that motivates this.
 */
export type GameManifest = {

  // Stable identifier for the gametype — URL-safe, matches the
  // Postgres schema name by convention OR composes it with a
  // suffix when one base supports multiple variants
  // (`psychicnum_coop` and `psychicnum_compete` share the
  // `psychicnum` schema). Used for registry lookups and as the
  // URL segment in `/g/<gametype>/<id>`. Lowercase, underscores
  // for compound forms; see docs/naming.md.
  gametype: string

  // Postgres schema where the game's tables and RPCs live.
  // Variants of the same base share a schema — both
  // `psychicnum_coop` and `psychicnum_compete` set
  // `schema: 'psychicnum'`.
  schema: string

  // Family key that ties variant gametypes together.
  // `baseGametype` is the stable identifier of the "thing this
  // game is a variant of." For single-mode games it equals
  // `gametype` (e.g., codenamesduet's baseGametype is 'codenamesduet').
  // For variants — coop vs compete pairs today, "super-tough
  // boggle" or other player-count variants in the future — it's
  // the shared root (`psychicnum_coop` and `psychicnum_compete`
  // both set `baseGametype: 'psychicnum'`).
  //
  // Read as "what family does this gametype belong to?" — not as a parent FK;
  // the shape is a flat string for cheap filtering. What filters on it is the
  // club page's gametype dropdown (`<GametypeFilter>`), which offers a
  // coop/compete pair as the one family a player thinks of it as. The family
  // is also what a game's doc is named after, one `docs/games/<baseGametype>.md`
  // per family — a convention, not a lookup any code performs.
  baseGametype: string

  // Interaction axis — `'coop'` for cooperative (players on the
  // same team, shared outcome) or `'compete'` for competitive
  // (each player races for an individual outcome).
  mode: 'coop' | 'compete'

  // This compete variant seats an autonomous AI OPPONENT when played
  // solo (scrabble's compete AI — docs/games/scrabble.md §12), so in a solo
  // club its `<ModeBadge>` reads "AI Compete" and the setup dialog tails the
  // Start button with the same words. Absent/false, compete-in-a-solo-club is
  // just a race with nobody to beat ("compete for 1" — bananagrams), which
  // reads as coop and gets no badge there at all. Manifest-declared so neither
  // surface has to know about specific games (the removability invariant —
  // docs/common.md).
  aiOpponent?: boolean

  // Human-readable name shown in pickers and titles.
  name: string

  // Short, action-flavored summary shown as the subtle second line on each
  // per-gametype Start row on ClubPage, and under each game in the Edit-club
  // enrollment list. Aim for ~30 characters — long enough to convey the verb +
  // the shape ("Guess the secret number"), short enough to fit on one line
  // with the player count (`· 1–6 players`) after it.
  shortDescription: string

  // URL to this gametype's square SVG logo. Drawn by `<GameLogo>`, which
  // appears in the GamePage header and against every game in the club page's
  // list. Resolved by Vite via `import logoUrl from './logo.svg?url'` in each
  // game's manifest. See docs/ui.md → "GamePage header".
  logoUrl: string

  // This gametype's "how to play" / rules modal. Opened from the "Help" item
  // in the GamePage menu (the dropdown anchored to the logo), and from the
  // setup dialog's own Help button, which stacks it over the dialog — "how do
  // I play this?" is a question you ask BEFORE agreeing to a game as well as
  // during one. Every game declares one. Lazy-loaded so each game's help
  // content ships in that game's chunk, not the main bundle. See docs/ui.md →
  // "GamePage menu", and → "Dialog buttons" for the setup dialog's button.
  //
  // Receives `brand` (the manifest's own `name`) so the modal's
  // "How to play <brand>" title is sourced from the single
  // branding source rather than hardcoded in each game's Help.
  help: ComponentType<{ onClose: () => void; brand: string }>

  // Opt into the per-game scratchpad — a floating notepad (a `common/`
  // feature) players can jot in during play. Absent = no scratchpad (most
  // games). `perPlayerInCompete` gives each compete player a PRIVATE pad
  // (a shared pad would leak solving progress); coop always shares one pad.
  // GamePage renders the `<ScratchpadButton>` + `<GameScratchpadCompanion>` when set.
  scratchpad?: { enabled: boolean; perPlayerInCompete?: boolean }

  // Supported player-count range `[min, max]`. Together with the club's
  // `common.clubs_gametypes` row it decides whether a Start row is offered, and
  // whether it is startable at this club's size (`playerCountFits`).
  //
  // **What the numbers should be**, and every game's actual pair, is
  // docs/features.md → Player counts; the rule they follow is
  // docs/code-conventions.md → "Per-game player counts."
  //
  // **What a person typing them here has to know** is that this field and the
  // member-count check in the gametype's own `create_game` must agree, with no
  // automated sync — and that the two halves are not equally safe. Every game
  // caps on the server, so a wrong MAX is caught there. The compete MINIMUM
  // often is not checked, so a wrong one fails silently: the game starts, and
  // the rule you wrote here was the only thing enforcing it.
  numberOfPlayers: [number, number]

  // The gametype-specific play surface. Mounted inside
  // `<GamePage>` and receives `GamePageCtx` (`common/game-page/gamePageCtx.ts`).
  // Lazy-loaded so each game ships as its own Vite chunk.
  PlayArea: ComponentType<GamePageCtx>

  // Per-game setup-form declaration shown in a modal before
  // `create_game` fires. Every gametype carries one — at the
  // very least the timer mode is a setup choice — so the
  // field is non-nullable.
  setupForm: GameSetupForm

  // Start a new game of this gametype inside the given club.
  // Receives:
  //   - clubHandle
  //   - setup: the typed value the dialog wrapper collected
  //   - playerUserIds: who's actually playing. The dialog defaults this to
  //     every current club member and locks the caller's own row on — you
  //     cannot start a game you are not in.
  //
  //     That rule is the DIALOG's, not the server's. `common.create_game`
  //     requires the caller to be a club member and every listed player to be
  //     one, and never that the caller is among them — so a hand-built request
  //     can seat a game its own caller cannot then open, since the game page
  //     gates on `require_game_player`. Left permissive on purpose: friends do
  //     not hand-build requests, and the lock is a UX decision rather than a
  //     defense (docs/common.md → Membership gates viewing).
  //
  // Returns the ENVELOPE, so a validation that names a column can reach the
  // box that wrote it: `SetupGameModal` writes `errors[field]`, and the setup
  // body hands each field its own. **Every game answers this way**, so there
  // is no second shape to allow for. Server-side validation is the trust
  // boundary — the FE-collected setup is not trusted.
  //
  // Lives on the manifest so common code (ClubPage,
  // SetupGameModal) can iterate `gametypes` without importing
  // from a game folder, preserving the import-direction rules.
  startGameInClub: (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => Promise<Envelope<CreatedGame>>

  // Render a one-line label for a single `common.games` row,
  // for the ClubPage games list. **Pure and synchronous** — no
  // I/O, no follow-up queries — everything labelFor needs comes
  // off the row.
  //
  // That contract is what keeps the listing one-query: ClubPage
  // fetches `common.games` for the club, then dispatches each
  // row to the matching manifest's labelFor. The state-transition
  // RPCs are responsible for writing whatever the gametype's
  // labelFor needs into `common.games.status` (jsonb) — the
  // duplicate-write discipline; see docs/common.md → `common.update_state`.
  labelFor: (row: CommonGameListRow) => string

  // Fire this gametype's timeout RPC. Called by GamePage when
  // `useGameTimer.expired` flips true in countdown mode.
  //
  // Every connected client fires it on the same countdown edge, so all but
  // one arrive to find the game already over. That answer is PN486, a race
  // (`severity: 'race'`), and GamePage swallows exactly that severity into a
  // log — peers racing to fire the timeout is fine.
  //
  // Per-gametype rather than one common.submit_timeout because
  // each RPC writes its own gametype-specific terminal state +
  // status jsonb. Dispatching at the FE keeps the SQL side from
  // needing per-gametype branches.
  submitTimeout: (gameId: string) => Promise<Envelope<GameStopResult>>

  // End this game NOW (irreversible). Dispatches to the gametype's own
  // `<schema>.end_game(target_game)` RPC — the same one the in-game "End game"
  // menu/button calls — so the terminal outcome + `status` jsonb are computed
  // the game's own way.
  //
  // On the manifest (mirroring `submitTimeout`) so GamePage can offer it from
  // the **pause overlay**, where the per-game `PlayArea` is unmounted and can't
  // supply the call. That's the escape hatch for a wedged presence-pause: it
  // goes through PostgREST (whose token auto-refreshes independently of the
  // Realtime socket), so it works even when Realtime is stuck.
  //
  // **Required**, which is what makes the pause overlay's escape hatch exist
  // for every game rather than most of them: a group that cannot reach End
  // from a wedged pause has no way out of one.
  //
  // Nothing is asked of a game that its schema does not already have — every
  // schema defines `end_game`, because a group has to be able to abandon any
  // game. A race that also offers per-player `concede` supplies this too:
  // they are different acts, conceding being a loss on your record while End
  // is the group agreeing there is no result, and wanting the second does not
  // mean taking the first.
  endGame: (gameId: string) => Promise<Envelope<GameStopResult>>
}

/**
 * The slice of a `common.games` row that a gametype's `labelFor` may read —
 * the inputs to one game's line in the club list.
 *
 * **Careful with the word "status" around here: it means three things.** The
 * club page calls that rendered line a game's *status line*
 * (docs/game-status-labels.md), and it is the OUTPUT. `play_state` and
 * `status` below are two of its inputs, and they are not each other.
 *
 * Stays narrow on purpose, and the narrowness IS the contract: everything a
 * label needs must already be on `common.games`, so ClubPage fetches the club's
 * games once and hands each row to the matching `labelFor` with no follow-up
 * query and nothing to await.
 */
export type CommonGameListRow = {
  id: string
  gametype: string
  // WHERE THE GAME IS — its own state-machine value (docs/states.md), and
  // whether that value is an ending. Most labels switch on `play_state` and
  // use `is_terminal` to pick a tense.
  play_state: string
  is_terminal: boolean
  // HOW IT IS GOING — the gametype's own progress payload, rewritten by each
  // state-transition RPC as the game is played (the duplicate-write
  // discipline — docs/common.md → `common.update_state`). Per-gametype shape,
  // so a label casts it.
  status: Record<string, unknown> | null
  // HOW IT WAS SET UP — the setup blob frozen at creation and never written
  // again.
  //
  // The pairing is the thing to hold onto: `status` changes and `setup` does
  // not. Most labels want only `status`. A label wants this as well when a
  // CREATE-TIME choice is what shapes how the game reads — waffle, wordle and
  // stackdown name the dictionary band (`· dict "Familiar"`), boggle the target
  // percentage, setgame the deck.
  //
  // A create-time value cannot simply be written into `status` instead:
  // `common.update_state` MERGES into that blob, but `common.reset_game`
  // ASSIGNS a fresh one, so a restart would drop the key. `setup` is immutable
  // and already on the row, so the listing query just selects it.
  setup: Record<string, unknown> | null
}

/**
 * Per-game timer declaration, consumed by `useGameTimer`:
 *
 *   - `none` — no timer.
 *   - `countup` — display-only: the count of seconds somebody was
 *     playing, shown as it climbs. Drives no state change.
 *   - `countdown` — `seconds` minus that count. At zero,
 *     `useGameTimer.expired` is true; `GamePage` fires the gametype's
 *     `submitTimeout` on that edge, and the game flips to a terminal
 *     play_state.
 *
 * The count is the server's (`common.timers.ticks`, advanced by
 * `common.tick_timer`); the design is `src/common/timer/doc.md`.
 */
export type TimerMode =
  | { kind: 'none' }
  | { kind: 'countup' }
  | { kind: 'countdown'; seconds: number }

/**
 * Does a player count fall inside a gametype's supported range?
 *
 * ClubPage hands it to the start list as that list's ONE `disabled` predicate,
 * evaluated once per row: the same answer dims the row and declines Enter on
 * it, so a keyboard and a click cannot disagree about which games a club has
 * the members for.
 */
export function playerCountFits(
  range: GameManifest['numberOfPlayers'],
  count: number,
): boolean {
  const [min, max] = range
  return count >= min && count <= max
}

/**
 * Human-readable description of the player-count requirement — the start
 * list's `rowTitle`, so hovering a row the club is too small (or too large)
 * for says what it would take.
 *
 *   [2, 2] → "Needs exactly 2 members"
 *   [1, 6] → "Needs 1–6 members"
 */
export function playerCountLabel(
  range: GameManifest['numberOfPlayers'],
): string {
  const [min, max] = range
  if (min === max) {
    return `Needs exactly ${min} ${min === 1 ? 'member' : 'members'}`
  }
  return `Needs ${min}–${max} members`
}

/**
 * Compact player-count rendering for a start row's subtle meta line, after
 * the gametype's `shortDescription`. Every row of a club that is not solo
 * shows it.
 *
 *   [2, 2] → "2 players"
 *   [1, 6] → "1–6 players"
 */
export function playerCountShort(
  range: GameManifest['numberOfPlayers'],
): string {
  const [min, max] = range
  if (min === max) return `${min} ${min === 1 ? 'player' : 'players'}`
  return `${min}–${max} players`
}
