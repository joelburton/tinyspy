// cs-audited-game-lib

import type { Session } from '@supabase/supabase-js'
import type { ComponentType } from 'react'
// Type-only, so the cycle these participate in is erased at runtime.
import type { Envelope } from './supabase/envelope'
import type { MenuApi } from './menu/menu'
import type { GenericFeedbackApi } from './feedback/genericFeedback'
import type { GameSetupForm } from './setup/setupForm'
import type { GamePlayer } from './members/member'

/**
 * THE GAME REGISTRY'S CONTRACT — what a game must declare to be a game here,
 * and what the shell hands it back while it is being played.
 *
 * Two halves, and everything in this file is one or the other:
 *
 *   - **`GameManifest`** is the declaration. Each game's `manifest.ts` exports
 *     one; `src/games.ts` collects them into the list the shell iterates. It is
 *     the whole reason common code can render sixteen games without naming any
 *     of them — see docs/common.md → "removability in three actions".
 *   - **`GamePageCtx`** is what comes back: the values `<GamePage>` passes to
 *     the manifest's `PlayArea` as render-prop children.
 *
 * The rest supports those two. `CommonGameListRow` is the narrow row slice
 * `labelFor` may read; `TimerMode` is what `timerMode` may be; `CreatedGame` and
 * `GameStopResult` are what the three RPC members answer with; the
 * `playerCount*` helpers format `numberOfPlayers` for the club page.
 *
 * **This file is at `lib/` root rather than `lib/game/` deliberately** — it is
 * THE registry, and a dead-obvious top-level path beats one more level of
 * nesting (docs/common-folders.md → Judgment calls).
 *
 * **What is NOT here, and where it went.** Until the 2026-09-03 split this file
 * was 908 lines holding five unrelated vocabularies, of which the registry was
 * the smallest: `GameManifest` was 22 of its 364 imports and the most-imported
 * name in it was `Member`, which names no game. The other four moved out, each
 * to a module named for its job (plans/areas/game-lib.md → `F-game-lib-1`):
 *
 *   - who someone is ......... `lib/members/member.ts` · `playerOutcome.ts`
 *   - what a setup form is ... `lib/setup/setupForm.ts`
 *   - what a pill says ....... `lib/feedback/genericFeedback.ts`
 *   - what a menu is ......... `lib/menu/menu.ts`
 *
 * The test for anything proposed for this file is the one that exemption was
 * granted on: does it name a GAME? `CreatedGame` reads like setup and stays
 * here anyway, because its docstring gives the answer — it is declared beside
 * the interface it satisfies.
 */

/**
 * FE-facing labels for a gametype's interaction `mode`. The DB, code,
 * and gametype strings all spell it `coop`; the UI says "Co-op".
 * Compete reads the same either way. Lives here (not in ModePill) so
 * non-component callers — e.g. SetupGameModal's title — can use the
 * words without importing a component, and so `react-refresh` stays
 * happy about ModePill exporting only its component.
 */
export const MODE_LABEL: Record<'coop' | 'compete', string> = {
  coop: 'Co-op',
  compete: 'Compete',
}

/**
 * What `<GamePage>` exposes to each game's PlayArea via its
 * render-prop children:
 *
 *     <GamePage gameId={...} session={...} gametype={...}>
 *       {(ctx) => <manifest.PlayArea {...ctx} />}
 *     </GamePage>
 *
 * GamePage runs `useCommonGame` and hands these values down.
 * Anything chrome-related (paused, missing, manuallyPausedBy,
 * the suspend-confirm dialog) stays inside GamePage and never
 * enters a per-game render.
 */
export type GamePageCtx = {
  session: Session
  gameId: string
  /** This gametype's user-facing brand name, resolved by GamePage
   *  from the matched `manifest.name`. Threaded through ctx so deep
   *  PlayArea children (e.g. wordle's grid aria-label) can show the
   *  brand without hardcoding the string — the brand lives in exactly
   *  one place, the manifest, so a fork rebrands by editing only that.
   *  Most UI reads `manifest.name` directly; this is for the parts
   *  buried inside a game's lazy chunk, where importing the registry
   *  would defeat code-splitting. */
  brand: string
  /** This game instance's human title from `common.games.title` — the
   *  per-gametype title-builder's output (scrabble's first three words,
   *  connections's puzzle date, …), the same string GamePage shows in the
   *  header and the club list. Threaded through so a PlayArea can name the
   *  specific game (e.g. on a printout). */
  title: string
  /** Everyone in this game's `common.game_players`. See
   *  [Member] for why this is `players` (game context) and
   *  not `members` (club context). A [GamePlayer] carries the
   *  per-player `conceded` / `result` bits on top of the profile. */
  players: GamePlayer[]
  /** Gametype-specific play_state string from
   *  `common.games.play_state`. Pair with `isTerminal` for the
   *  gate; use the string itself for specific banner copy. See
   *  docs/states.md. */
  playState: string
  /** Materialized "any terminal play_state" from
   *  `common.games.is_terminal`. */
  isTerminal: boolean
    timer: {
    displaySeconds: number
    expired: boolean
  }
  /** Turn-order gate for the opt-in turn-by-turn coop mode. True when
   *  the viewer may act right now — ALWAYS true for free-for-all games
   *  (the default) and solo, so a game that doesn't opt in is
   *  unaffected. A turn game AND-s this into its existing input gate
   *  (canGuess/readOnly/…). Derived once in `useCommonGame`. */
  isMyTurn: boolean
  /** Whose turn it is (`common.games.current_turn_user_id`), or null
   *  for a free-for-all game. Turn games pass it to `<TurnStatusLine>`
   *  to render "Your turn" / "Waiting for ● Name…"; free-for-all games
   *  ignore it. */
  currentTurnUserId: string | null
  /** The game's setup blob from `common.games.setup` — the
   *  choices the SetupGameModal collected at start. Typed as
   *  `Record<string, unknown>` here because each gametype's
   *  shape is different; per-game PlayAreas cast to their own
   *  setup type (`as CodenamesduetSetup`, `as ConnectionsSetup`, etc.)
   *  on access. Read-only at this level — setup is fixed at
   *  game-creation time. */
  setup: Record<string, unknown>
  /** The game's live `common.games.status` jsonb — the per-
   *  gametype "where is this game now" snapshot maintained by
   *  each state-transition RPC (the duplicate-write discipline;
   *  see docs/states.md). Typed as `Record<string, unknown> | null`
   *  here because each gametype writes its own shape; per-game
   *  PlayAreas cast to their own status type on access. Reflects
   *  the latest value seen by `useCommonGame`'s realtime
   *  subscription — updates in place as RPCs land.
   *
   *  Today's primary consumer is spellingbee's compete-mode
   *  OpponentStrip, which reads `status.leaderboard` for
   *  the per-player rank summary. The same channel is open to
   *  any future game that wants a live status field surfaced
   *  to the play surface. */
  status: Record<string, unknown> | null
  /** Imperative API for the GLOBAL feedback area (the GamePage-header
   *  slot — peer/opponent news, per the feedback naming convention in
   *  docs/code-conventions.md). The PlayArea calls
   *  `globalFeedback.show({...})` to surface transient or persistent
   *  feedback in the `<PageHeaderStatusSlot>` (replacing the default
   *  `<PageHeaderPlayersStrip>` while active); `globalFeedback.clear()` empties
   *  the slot. See docs/ui.md → Feedback pill for the API + dismiss-mode
   *  semantics. The functions' identities are stable across renders, so
   *  they're safe to put in dep arrays. */
  globalFeedback: GenericFeedbackApi
  /** Navigate to this game's club page directly — no suspend-
   *  confirm modal. Wired by `<GamePage>` to use the resolved
   *  `club_handle` for terminal-game navigation; downstream
   *  consumers (the PlayArea terminal action row's "Back to
   *  club" button) call it without re-deriving the URL. Identity is stable across renders. Only valid to
   *  call when the game is terminal — for non-terminal back-to-
   *  club, use the menu (which fires the suspend-confirm flow). */
  goToClub: () => void
  /** The club this game belongs to (`common.games.club_handle`) —
   *  so a PlayArea can start a FOLLOW-UP game in the same club
   *  (waffle's "New game" menu item: same setup, fresh board,
   *  new game id). */
  clubHandle: string
  /** Navigate to another game's page (`/g/<gametype>/<gameId>`) —
   *  the follow-up-game companion to `goToClub`: after a PlayArea
   *  starts a new game (see `clubHandle`), this jumps the creator
   *  into it. Peers arrive via the game-invitation toast, as with
   *  any new game. Identity is stable across renders. */
  goToGame: (gametype: string, gameId: string) => void
  /** Imperative API for the GamePage menu (the dropdown opened from
   *  the game logo). The PlayArea owns its WHOLE menu — it calls
   *  `menu.setGameSections([...])` (usually via the `buildGameMenu`
   *  helper), and uses `menu.openHelp` / `menu.requestBackToClub` for
   *  the two shell actions. See docs/ui.md → GamePage menu for the
   *  placement + activation contract. Identity is stable across renders. */
  menu: MenuApi
}


/**
 * **What every game's `create_game` puts in `data`.** One shape, sixteen
 * schemas: `result` names the answer, `id` is the game to go to.
 *
 * `result` is what a call site filters the `ok` on. `create_game` has exactly
 * one `ok` today and the name is still there, because a branch that matches by
 * merely being `ok` would silently draw a second answer as this one
 * (docs/envelopes.md → Choosing which `ok` branch).
 *
 * Declared here, beside the interface it satisfies, so the two cannot drift and
 * a game's call site matches `startGameInClub` by NAME rather than by two type
 * expressions happening to line up.
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
 * consumes the registry of manifests (`src/games.ts`) and never
 * names a specific game directly — see docs/common.md for the
 * "removability in three actions" rule that motivates this.
 */
export type GameManifest = {
  /**
   * Stable identifier for the gametype — URL-safe, matches the
   * Postgres schema name by convention OR composes it with a
   * suffix when one base supports multiple variants
   * (`psychicnum_coop` and `psychicnum_compete` share the
   * `psychicnum` schema). Used for registry lookups and as the
   * URL segment in `/g/<gametype>/<id>`. Lowercase, underscores
   * for compound forms; see docs/naming.md.
   */
  gametype: string

  /** Postgres schema where the game's tables and RPCs live.
   *  Variants of the same base share a schema — both
   *  `psychicnum_coop` and `psychicnum_compete` set
   *  `schema: 'psychicnum'`. */
  schema: string

  /**
   * Family key that ties variant gametypes together.
   * `baseGametype` is the stable identifier of the "thing this
   * game is a variant of." For single-mode games it equals
   * `gametype` (e.g., codenamesduet's baseGametype is 'codenamesduet').
   * For variants — coop vs compete pairs today, "super-tough
   * boggle" or other player-count variants in the future — it's
   * the shared root (`psychicnum_coop` and `psychicnum_compete`
   * both set `baseGametype: 'psychicnum'`).
   *
   * Used wherever code wants to group siblings programmatically:
   * docs lookups (one docs/games/<baseGametype>.md per family),
   * shared logos, and a future ClubPage treatment that renders
   * siblings side-by-side. Read as "what family does this
   * gametype belong to?" — not as a parent FK; the shape's a
   * flat string for cheap filtering.
   */
  baseGametype: string

  /**
   * Interaction axis — `'coop'` for cooperative (players on the
   * same team, shared outcome) or `'compete'` for competitive
   * (each player races for an individual outcome).
   *
   * Locked at the gametype level, not in setup. A coop/compete
   * pair shows up as two `common.gametypes` rows and two
   * manifest entries pointing at the same `baseGametype`. This
   * keeps the start-game UX a one-click decision ("start coop
   * psychicnum") rather than a buried setup-form radio.
   *
   * A timer that runs out and ends a game is NOT what makes
   * something compete — compete needs an opposing PLAYER. Solo
   * clubs only get `mode: 'coop'` Start buttons (which may still
   * carry a countdown timer); compete buttons are hidden by the
   * `numberOfPlayers` lower bound.
   */
  mode: 'coop' | 'compete'

  /** This compete variant seats an autonomous AI OPPONENT when played
   *  solo (scrabble's compete AI — docs/games/scrabble.md §12), so a solo
   *  club's pill says "AI Compete". Absent/false, compete-in-a-solo-club
   *  is just a race with nobody to beat ("compete for 1" — bananagrams),
   *  which reads as coop and gets NO pill there. Manifest-declared so the
   *  club UI never has to know about specific games (the removability
   *  invariant — docs/common.md). */
  aiOpponent?: boolean

  /** Human-readable name shown in pickers and titles. */
  name: string

  /** Short, action-flavored summary shown as the subtle second
   *  line on each per-gametype "Start" button on ClubPage. Aim
   *  for ~30 characters — long enough to convey the verb + the
   *  shape ("Guess the secret number"), short enough to fit
   *  beside the player-count badge without wrapping. */
  shortDescription: string

  /** URL to this gametype's square SVG logo, used in the
   *  GamePage header. Resolved by Vite via
   *  `import logoUrl from './logo.svg?url'` in each game's
   *  manifest. See docs/ui.md → "GamePage header". */
  logoUrl: string

  /** This gametype's "how to play" / rules modal. Opened from
   *  the "Help" item in the GamePage menu (the dropdown anchored
   *  to the logo). Every game declares one — the question "how
   *  do I play this?" is universal. Lazy-loaded so each game's
   *  help content ships in that game's chunk, not the main
   *  bundle. See docs/ui.md → "Help" + "GamePage menu".
   *
   *  Receives `brand` (the manifest's own `name`) so the modal's
   *  "How to play <brand>" title is sourced from the single
   *  branding source rather than hardcoded in each game's Help. */
  help: ComponentType<{ onClose: () => void; brand: string }>

  /**
   * Per-gametype baseline timer. Optional; default is no timer.
   * When set, every game of this gametype runs with it. When
   * the manifest omits it, individual games may still opt into
   * a timer per-game via their setup form (`common.games.setup.timer`).
   */
  timerMode?: TimerMode

  /**
   * Opt into the per-game scratchpad — a floating notepad (a `common/`
   * feature) players can jot in during play. Absent = no scratchpad (most
   * games). `perPlayerInCompete` gives each compete player a PRIVATE pad
   * (a shared pad would leak solving progress); coop always shares one pad.
   * GamePage renders the `<ScratchpadButton>` + `<GameScratchpadCompanion>` when set.
   */
  scratchpad?: { enabled: boolean; perPlayerInCompete?: boolean }

  /**
   * Supported player-count range `[min, max]`. Both ends required;
   * unbounded `null` upper ends aren't allowed because every game
   * benefits from a hard cap (the FE rendering, the realtime
   * channel load, the chat surface area — all assume a bounded
   * count).
   *
   * **Coop starts at 1 and compete at 2**, because compete needs an opposing
   * PLAYER — a countdown timer is not an opponent, so a solo club sees only
   * coop Start buttons. Six is the house max. Departing from any of that is
   * allowed and wants a reason: scrabble's compete opens at 1 because it seats
   * an AI (`aiOpponent`), boggle and crosswords take 8 because a bigger board
   * absorbs more people, scrabble caps at 4 because of the tile bag.
   *
   * **Every game's actual numbers are one table**, in
   * docs/features.md → Player counts, beside the cap each `create_game`
   * enforces. Deliberately not repeated here: a roster in a docstring is
   * sixteen claims that go stale silently, and this one already had (it named
   * three games and one max, when four gametypes use 8 and two use 4).
   *
   * The shell uses this to decide whether the "Start" button is
   * hidden / disabled / enabled (in combination with the
   * club's `common.clubs_gametypes` row).
   *
   * MUST AGREE with the member-count check in this gametype's `create_game`
   * RPC — no automated sync, just paired cross-reference comments. The MAX
   * half is honest: 15 games pass their cap to
   * `common.require_player_count_max` and codenamesduet checks exactly-2
   * inline, and all sixteen agree with this field today. **The compete
   * MINIMUM is not** — four games declare `[2, 6]` with no server check, so
   * drift there fails silently rather than loudly. See docs/features.md →
   * Player counts for which, and docs/code-conventions.md → "Per-game player
   * counts."
   */
  numberOfPlayers: [number, number]

  /**
   * The gametype-specific play surface. Mounted inside
   * `<GamePage>` and receives `GamePageCtx` (see above).
   * Lazy-loaded so each game ships as its own Vite chunk.
   */
  PlayArea: ComponentType<GamePageCtx>

  /**
   * Per-game setup-form declaration shown in a modal before
   * `create_game` fires. Every gametype carries one — at the
   * very least the timer mode is a setup choice — so the
   * field is non-nullable.
   */
  setupForm: GameSetupForm

  /**
   * Start a new game of this gametype inside the given club.
   * Receives:
   *   - clubHandle
   *   - setup: the typed value the dialog wrapper collected
   *   - playerUserIds: who's actually playing. The dialog
   *     defaults this to every current club member; the caller
   *     does NOT have to be in the list.
   *
   * Returns the ENVELOPE, so a validation that names a column can reach the
   * box that wrote it: `SetupGameModal` writes `errors[field]`, and the setup
   * body hands each field its own. **All sixteen answer this way now** — the
   * adapters that made an unconverted RPC's `{ data, error }` look like an
   * envelope are gone, so there is no second shape to allow for. Server-side
   * validation is the trust boundary — the FE-collected setup is not trusted.
   *
   * Lives on the manifest so common code (ClubPage,
   * SetupGameModal) can iterate `games` without importing from
   * a game folder, preserving the import-direction rules.
   */
  startGameInClub: (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => Promise<Envelope<CreatedGame>>

  /**
   * Render a one-line label for a single `common.games` row,
   * for the ClubPage games list. **Pure and synchronous** — no
   * I/O, no follow-up queries — everything labelFor needs comes
   * off the row.
   *
   * That contract is what keeps the listing one-query: ClubPage
   * fetches `common.games` for the club, then dispatches each
   * row to the matching manifest's labelFor. The state-transition
   * RPCs are responsible for writing whatever the gametype's
   * labelFor needs into `common.games.status` (jsonb) — the
   * duplicate-write discipline; see docs/states.md.
   */
  labelFor: (row: CommonGameListRow) => string

  /**
   * Fire this gametype's timeout RPC. Called by GamePage when
   * `useGameTimer.expired` flips true in countdown mode.
   *
   * Each gametype's RPC is idempotent on its terminal-state
   * check — the FE swallows the "already terminal" error so
   * peers racing to fire the timeout is fine.
   *
   * Per-gametype rather than one common.submit_timeout because
   * each RPC writes its own gametype-specific terminal state +
   * status jsonb. Dispatching at the FE keeps the SQL side from
   * needing per-gametype branches.
   */
  submitTimeout: (gameId: string) => Promise<Envelope<GameStopResult>>

  /**
   * End this game NOW (irreversible). Dispatches to the gametype's own
   * `<schema>.end_game(target_game)` RPC — the same one the in-game "End game"
   * menu/button calls — so the terminal outcome + `status` jsonb are computed
   * the game's own way.
   *
   * On the manifest (mirroring `submitTimeout`) so GamePage can offer it from
   * the **pause overlay**, where the per-game `PlayArea` is unmounted and can't
   * supply the call. That's the escape hatch for a wedged presence-pause: it
   * goes through PostgREST (whose token auto-refreshes independently of the
   * Realtime socket), so it works even when Realtime is stuck.
   *
   * **Optional** in the type, but every gametype supplies it today — including
   * bananagrams, which needs BOTH: conceding is a loss on your record and takes
   * every player doing it to close a game the group has merely lost interest
   * in, while End is the group agreeing there is no result. The overlay's
   * button hides when a game omits this, and none currently does.
   */
  endGame?: (gameId: string) => Promise<Envelope<GameStopResult>>
}

/**
 * The slice of a `common.games` row the per-gametype `labelFor`
 * sees. Stays narrow on purpose: anything labelFor needs must
 * live on `common.games` (status jsonb covers the gametype-
 * specific payload). That's the contract that keeps the
 * listing path one-query and synchronous.
 */
export type CommonGameListRow = {
  id: string
  gametype: string
  play_state: string
  is_terminal: boolean
  status: Record<string, unknown> | null
  /**
   * The frozen-at-create-time setup blob. Carried for the handful of labels
   * that name a SETUP CHOICE rather than progress — waffle / wordle /
   * stackdown all play very differently at different dictionary bands, so
   * their status line ends `· dict "Familiar"`.
   *
   * It can't ride in `status`: `common.update_state` merges, but
   * `common.reset_game` assigns, so a create-time key wouldn't survive a
   * restart. `setup` is immutable and already on the row, so the listing
   * query just selects it.
   */
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
 * Used on the club page, and only there: StartGameButtons
 * disables the ones that don't fit the club's member count, and
 * ClubPage's Enter handler re-checks before starting, so the
 * keyboard no-ops on a disabled button exactly as a click does.
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
