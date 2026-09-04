// cs-blessed-game-lib

import type { ComponentType } from 'react'
// Type-only, so the cycle these participate in is erased at runtime.
import type { Envelope } from './supabase/envelope'
import type { GameSetupForm } from './setup/setupForm'
import type { GamePageCtx } from './gamePageCtx'

/**
 * WHAT A GAME DECLARES — the shape each game's `manifest.ts` exports so the
 * shell can render it without ever naming it.
 *
 * `GameManifest` is the whole subject; everything else here exists because one
 * of its members needs a type. `CommonGameListRow` is the narrow row slice
 * `labelFor` may read; `TimerMode` is what `timerMode` may be; `CreatedGame`
 * and `GameStopResult` are what its three RPC members answer with; the
 * `playerCount*` helpers format `numberOfPlayers` for the club page.
 *
 * **The two files either side of this one**, since the names are close:
 * `src/gametypes.ts` is the REGISTRY — the list that collects these manifests,
 * and the only file allowed to import every game. `lib/gamePageCtx.ts` is the
 * other half of this contract — what the shell hands a game back while it is
 * being played. A game says what it is here and gets that there.
 *
 * **At `lib/` root rather than `lib/game/` deliberately** — a contract every
 * game implements earns a dead-obvious top-level path over one more level of
 * nesting (docs/common-folders.md → Judgment calls).
 *
 *   - who someone is ......... `lib/members/member.ts` · `terminalOutcomeVerb.ts`
 *   - what a setup form is ... `lib/setup/setupForm.ts`
 *   - what a pill says ....... `lib/feedback/genericFeedback.ts`
 *   - what a menu is ......... `lib/menu/menu.ts`
 *   - what a game is handed .. `lib/gamePageCtx.ts`
 */

/**
 * FE-facing labels for a gametype's interaction `mode`.
 */
export const MODE_LABEL: Record<'coop' | 'compete', string> = {
  coop: 'Co-op',
  compete: 'Compete',
}

/**
 * **What every game's `create_game` puts in `data`.** One shape, sixteen
 * schemas: `result` names the answer, `id` is the game to go to.
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
 * names a specific game directly — see docs/common.md for the
 * "removability in three actions" rule that motivates this.
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
  // Used wherever code wants to group siblings programmatically:
  // docs lookups (one docs/games/<baseGametype>.md per family),
  // shared logos, and a future ClubPage treatment that renders
  // siblings side-by-side. Read as "what family does this
  // gametype belong to?" — not as a parent FK; the shape's a
  // flat string for cheap filtering.
  baseGametype: string

  // Interaction axis — `'coop'` for cooperative (players on the
  // same team, shared outcome) or `'compete'` for competitive
  // (each player races for an individual outcome).
  mode: 'coop' | 'compete'

  // This compete variant seats an autonomous AI OPPONENT when played
  // solo (scrabble's compete AI — docs/games/scrabble.md §12), so a solo
  // club's pill says "AI Compete". Absent/false, compete-in-a-solo-club
  // is just a race with nobody to beat ("compete for 1" — bananagrams),
  // which reads as coop and gets NO pill there. Manifest-declared so the
  // club UI never has to know about specific games (the removability
  // invariant — docs/common.md).
  aiOpponent?: boolean

  // Human-readable name shown in pickers and titles.
  name: string

  // Short, action-flavored summary shown as the subtle second
  // line on each per-gametype "Start" button on ClubPage. Aim
  // for ~30 characters — long enough to convey the verb + the
  // shape ("Guess the secret number"), short enough to fit
  // beside the player-count badge without wrapping.
  shortDescription: string

  // URL to this gametype's square SVG logo, used in the
  // GamePage header. Resolved by Vite via
  // `import logoUrl from './logo.svg?url'` in each game's
  // manifest. See docs/ui.md → "GamePage header".
  logoUrl: string

  // This gametype's "how to play" / rules modal. Opened from
  // the "Help" item in the GamePage menu (the dropdown anchored
  // to the logo). Every game declares one — the question "how
  // do I play this?" is universal. Lazy-loaded so each game's
  // help content ships in that game's chunk, not the main
  // bundle. See docs/ui.md → "Help" + "GamePage menu".
  //
  // Receives `brand` (the manifest's own `name`) so the modal's
  // "How to play <brand>" title is sourced from the single
  // branding source rather than hardcoded in each game's Help.
  help: ComponentType<{ onClose: () => void; brand: string }>

  // Per-gametype baseline timer. Optional; default is no timer.
  // When set, every game of this gametype runs with it. When
  // the manifest omits it, individual games may still opt into
  // a timer per-game via their setup form (`common.games.setup.timer`).
  timerMode?: TimerMode

  // Opt into the per-game scratchpad — a floating notepad (a `common/`
  // feature) players can jot in during play. Absent = no scratchpad (most
  // games). `perPlayerInCompete` gives each compete player a PRIVATE pad
  // (a shared pad would leak solving progress); coop always shares one pad.
  // GamePage renders the `<ScratchpadButton>` + `<GameScratchpadCompanion>` when set.
  scratchpad?: { enabled: boolean; perPlayerInCompete?: boolean }

  // Supported player-count range `[min, max]`.
  //
  // **Coop starts at 1 and compete at 2**, because compete needs an opposing
  // PLAYER — a countdown timer is not an opponent, so a solo club sees only
  // coop Start buttons. Six is the house max. Departing from any of that is
  // allowed and wants a reason: scrabble's compete opens at 1 because it seats
  // an AI (`aiOpponent`), boggle and crosswords take 8 because a bigger board
  // absorbs more people, scrabble caps at 4 because of the tile bag.
  //
  // **Every game's actual numbers are one table**, in
  // docs/features.md → Player counts, beside the cap each `create_game`
  // enforces.

  // The shell uses this to decide whether the "Start" button is
  // hidden / disabled / enabled (in combination with the
  // club's `common.clubs_gametypes` row).
  //
  // MUST AGREE with the member-count check in this gametype's `create_game`
  // RPC — no automated sync, just paired cross-reference comments. The MAX
  // half is honest: 15 games pass their cap to
  // `common.require_player_count_max` and codenamesduet checks exactly-2
  // inline, and all sixteen agree with this field today. **The compete
  // MINIMUM is not** — four games declare `[2, 6]` with no server check, so
  // drift there fails silently rather than loudly. See docs/features.md →
  // Player counts for which, and docs/code-conventions.md → "Per-game player
  // counts."
  numberOfPlayers: [number, number]

  // The gametype-specific play surface. Mounted inside
  // `<GamePage>` and receives `GamePageCtx` (`lib/gamePageCtx.ts`).
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
  //     every current club member; the caller does NOT have to be in the list.
  //
  // Returns the ENVELOPE, so a validation that names a column can reach the
  // box that wrote it: `SetupGameModal` writes `errors[field]`, and the setup
  // body hands each field its own. **All sixteen answer this way now** — the
  // adapters that made an unconverted RPC's `{ data, error }` look like an
  // envelope are gone, so there is no second shape to allow for. Server-side
  // validation is the trust boundary — the FE-collected setup is not trusted.
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
  // duplicate-write discipline; see docs/states.md.
  labelFor: (row: CommonGameListRow) => string

  // Fire this gametype's timeout RPC. Called by GamePage when
  // `useGameTimer.expired` flips true in countdown mode.
  //
  // Each gametype's RPC is idempotent on its terminal-state
  // check — the FE swallows the "already terminal" error so
  // peers racing to fire the timeout is fine.
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
  // **Optional** in the type, but every gametype supplies it today — including
  // bananagrams, which needs BOTH: conceding is a loss on your record and takes
  // every player doing it to close a game the group has merely lost interest
  // in, while End is the group agreeing there is no result. The overlay's
  // button hides when a game omits this, and none currently does.
  endGame?: (gameId: string) => Promise<Envelope<GameStopResult>>
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
  // state-transition RPC as the game is played (docs/states.md → the
  // duplicate-write discipline). Per-gametype shape, so a label casts it.
  status: Record<string, unknown> | null
  // HOW IT WAS SET UP — the setup blob frozen at creation and never written
  // again.
  //
  // The pairing is the thing to hold onto: `status` changes and `setup` does
  // not. Most labels want only `status`. Five want this too, for a choice that
  // shapes how the game reads — waffle, wordle and stackdown name the
  // dictionary band (`· dict "Familiar"`), boggle the target percentage,
  // setgame the deck.
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
 *   - `countup` — display-only; ticks up from game-creation
 *     time. Doesn't drive state changes.
 *   - `countdown` — ticks down from `seconds`. At zero,
 *     `useGameTimer.expired` flips true; the per-gametype
 *     `submitTimeout` fires; the game flips to a terminal
 *     play_state.
 *
 * See docs/games/connections.md → "Timer" for the browser-side / no-
 * server-sync choice.
 */
export type TimerMode =
  | { kind: 'none' }
  | { kind: 'countup' }
  | { kind: 'countdown'; seconds: number }

/**
 * Does a player count fall inside a gametype's supported range?
 * Used on the club page, and only there: `<StartGameRow>` disables
 * the ones that don't fit the club's member count, and ClubPage's
 * Enter handler re-checks before starting, so the keyboard no-ops
 * on a disabled button exactly as a click does.
 */
export function playerCountFits(
  range: GameManifest['numberOfPlayers'],
  count: number,
): boolean {
  const [min, max] = range
  return count >= min && count <= max
}

/**
 * Human-readable description of the player-count requirement,
 * for tooltip text on a disabled Start button.
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
 * Compact player-count rendering for the Start-game button's
 * subtle meta line. Pair with the gametype's shortDescription.
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
