import type { Session } from '@supabase/supabase-js'
import type { ComponentType, ReactNode } from 'react'

/**
 * FE-facing labels for a gametype's interaction `mode`. The DB, code,
 * and gametype strings all spell it `coop`; the UI says "Co-op".
 * Compete reads the same either way. Lives here (not in ModePill) so
 * non-component callers — e.g. SetupGameDialog's title — can use the
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
  /** The game's setup blob from `common.games.setup` — the
   *  choices the SetupGameDialog collected at start. Typed as
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
   *  feedback in the `<StatusSlot>` (replacing the default
   *  `<PlayersStrip>` while active); `globalFeedback.clear()` empties
   *  the slot. See docs/ui.md → Feedback pill for the API + dismiss-mode
   *  semantics. The functions' identities are stable across renders, so
   *  they're safe to put in dep arrays. */
  globalFeedback: GenericFeedbackApi
  /** Navigate to this game's club page directly — no suspend-
   *  confirm modal. Wired by `<GamePage>` to use the resolved
   *  `club_handle` for terminal-game navigation; downstream
   *  consumers (the GameOverModal's "Back to club" button, the
   *  PlayArea terminal indicator) call it without re-deriving
   *  the URL. Identity is stable across renders. Only valid to
   *  call when the game is terminal — for non-terminal back-to-
   *  club, use the menu (which fires the suspend-confirm flow). */
  goToClub: () => void
  /** Imperative API for the per-game section of the GamePage menu
   *  (the dropdown opened from the game logo). The PlayArea calls
   *  `menu.setGameItems([...])` to populate its items; the array
   *  replaces wholesale on each call. See docs/ui.md → GamePage
   *  menu for the placement + activation contract. Identity is
   *  stable across renders. */
  menu: MenuApi
}

/** Tone variants the feedback pill renders. See docs/ui.md →
 *  Feedback pill. (`near` = a near-miss — connections' "one away"; shares
 *  warning's amber for now.) */
export type GenericFeedbackTone = 'success' | 'error' | 'warning' | 'neutral' | 'info' | 'near'

/** A single feedback message. The `dismiss` mode picks how it
 *  leaves the screen. See docs/ui.md → "Dismiss modes" for the
 *  detailed when-to-use guidance. */
export type GenericFeedbackMsg = {
  tone: GenericFeedbackTone
  /** The message. Usually a plain string; a `ReactNode` is allowed so a message
   *  can embed an inline icon (e.g. bananagrams' dump pill leads with the
   *  exchange glyph, matching its dump zone). */
  text: ReactNode
  /** Optional leading identity disc — a player-color CSS value (from
   *  `colorVarFor`). Renders a small filled circle before the text, the
   *  identity anchor for group/peer messages ("● leah found APPLE"). See
   *  docs/ui.md → "Player identity = a colored disc". */
  dot?: string
  /** Pill style. `'fill'` (default) tints the background by tone — for local
   *  validation. `'outline'` colors only the border (no fill), using the
   *  green/red outcome palette — for identity/peer messages, where a tinted
   *  fill would clash with the leading `dot`. */
  variant?: 'fill' | 'outline'
  dismiss:
    | { kind: 'timed'; ms?: number }
    | { kind: 'sticky' }
    | { kind: 'closeable' }
}

export type GenericFeedbackApi = {
  show: (msg: GenericFeedbackMsg) => void
  clear: () => void
}

/** One row in the GamePage menu's per-game section (and any
 *  future reuse of `<Menu>`). See docs/ui.md → "GamePage menu"
 *  for the placement + activation contract. */
export type MenuItem = {
  /** Stable id for React keying. PlayArea-owned values that
   *  reflect game-state changes are fine — the array is replaced
   *  wholesale on each `setGameItems` call. */
  id: string
  label: string
  onClick: () => void
  /** When true, the item renders greyed-out and skips keyboard
   *  navigation. Use for state-dependent actions ("Reveal cell"
   *  enabled only when a cell is selected). */
  disabled?: boolean
}

/** A group of items rendered together in the menu popover.
 *  Sections are separated by a thin divider. Empty sections drop
 *  out — no leading or trailing dividers around them. */
export type MenuSection = {
  items: MenuItem[]
}

export type MenuApi = {
  /** Replace the per-game section's items wholesale. Pass `[]`
   *  to clear (the section disappears and the divider above it
   *  drops). Identity is stable across GamePage renders. */
  setGameItems: (items: MenuItem[]) => void
}

/**
 * One person's identity, with the three fields every render
 * site needs: id, username, color.
 *
 * Same shape covers chat-message sender (club context) and
 * game player (game context). The naming distinction is at the
 * **variable** level — `members: Member[]` in club code,
 * `players: Player[]` in game code, where each game declares
 * its own `Player` alias on top of `Member`. See
 * docs/naming.md → "member" and "player" for the full
 * rationale.
 */
export type Member = {
  user_id: string
  username: string
  /** Palette name from `common.profiles.color`. Pass through
   *  `colorVarFor` (src/common/lib/memberColor.ts) for the
   *  matching CSS variable. */
  color: string
}

/**
 * A game player: a [Member] plus the per-player bits that live on
 * `common.game_players` (as opposed to the profile). Distinct from
 * Member because a chat sender is a Member but never a game player.
 * `GamePlayer` is a superset, so anything typed `Member[]` still
 * accepts `GamePlayer[]` — a game's OpponentStrip / turn-log can keep
 * their `Member` props while the PlayArea reads `conceded` off the
 * same roster.
 *
 *   - `conceded`     — this player willfully quit a compete race
 *                      (common.concede). Drives the OpponentStrip
 *                      "out" marker and the "Quit at …" vs "Lost at
 *                      …" terminal wording.
 *   - `result`       — the per-player end-state jsonb from
 *                      common.game_players.result; null until the
 *                      game ends.
 */
export type GamePlayer = Member & {
  conceded: boolean
  conceded_at: string | null
  result: Record<string, unknown> | null
}

/** Outcome verb for one player at game-over, from their common
 *  end-state. Won trumps everything; a conceder "quit"; anyone else
 *  who didn't win "lost" (beaten to the win, or eliminated). Games
 *  render it as e.g. `${playerOutcome(p)} at ${rankName}`. */
export function playerOutcome(p: {
  conceded: boolean
  result: Record<string, unknown> | null
}): 'won' | 'quit' | 'lost' {
  if (p.result?.won === true) return 'won'
  if (p.conceded) return 'quit'
  return 'lost'
}

/**
 * A "rich" message — a sequence of text + inline player segments — so an error
 * (or any message) can name players with their identity disc inline:
 * "…needs these players: ● bert, ● ernie, ● claude." A plain `string` is still a
 * valid message everywhere a `RichMessage` is accepted; this is just the
 * structured form, rendered by `<RichMessage>`. Self-contained (each segment
 * carries the full `Member`), so it needs no resolver wherever it's shown.
 */
export type RichMessage = Array<string | { player: Member }>

/**
 * Props the per-game setup-form body receives from the common
 * `SetupGameDialog` wrapper. **Controlled**: state lives in the
 * wrapper, the body renders `value` and signals edits via
 * `onChange`.
 *
 * `value` and `onChange` are `unknown` here so `GameManifest`
 * can stay non-generic (the registry holds `GameManifest[]`,
 * which can't carry per-game type parameters). Each game's
 * setup component starts with `value as MySetup` at the top
 * and is fully typed inside.
 */
export type SetupBodyProps = {
  members: Member[]
  /** This gametype's user-facing brand name (the manifest's `name`),
   *  forwarded by SetupGameDialog so a setup form's own copy reads the
   *  brand from the single branding source rather than hardcoding it
   *  (e.g. connections's "Pick a <brand> puzzle"). Most forms ignore it. */
  brand: string
  /** Club the game would start in. Per-game setup forms that
   *  need club-scoped data read it; the rest ignore it. */
  clubHandle: string
  /** The manifest's `mode` — `'coop'` or `'compete'`. Forwarded
   *  so sibling-pair setup forms (connections, psychicnum) that
   *  query mode-aware club state (e.g. connections's per-date
   *  calendar overlay) can scope their reads to the right mode.
   *  Setup forms for single-mode games can ignore it. */
  mode: 'coop' | 'compete'
  /** How many players are currently selected in the dialog's picker.
   *  Live — it updates as the creator checks/unchecks members. Setup
   *  forms whose options depend on the headcount read it (e.g.
   *  bananagrams sizes its tile bag against `playerCount × hand_size`);
   *  the rest ignore it. */
  playerCount: number
  value: unknown
  onChange: (next: unknown) => void
}

/**
 * Per-game setup-form declaration: the lazy-loaded body
 * component plus the initial value the wrapper seeds state with
 * when the dialog opens.
 *
 * `Component` is lazy so the form ships in the game's chunk.
 * `defaults` is NOT lazy because the wrapper needs an initial
 * value the moment the modal opens — before the chunk arrives.
 * It's a tiny literal so the size cost is negligible.
 */
export type GameSetupForm = {
  Component: ComponentType<SetupBodyProps>
  defaults: unknown
  /**
   * Optional cross-field guard the dialog runs to gate the Start
   * button. Returns a human-readable reason the current `setup` can't
   * start (shown under the form, Start disabled) or `null` when it's
   * valid. Gets `playerCount` because some constraints couple the
   * setup to the headcount — bananagrams's "bag must hold
   * `playerCount × hand_size` tiles" is the first. Pure + synchronous;
   * the server re-validates in `create_game` regardless (this is UX,
   * not the authority).
   */
  validate?: (setup: unknown, playerCount: number) => string | null
}

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
   * Supported player-count range `[min, max]`. Both ends required;
   * unbounded `null` upper ends aren't allowed because every game
   * benefits from a hard cap (the FE rendering, the realtime
   * channel load, the chat surface area — all assume a bounded
   * count). For an "any club" game, pick a reasonable max — today
   * we use 6 for all the open-N games (connections, psychicnum,
   * spellingbee) and `[2, 2]` for fixed-seat codenamesduet.
   *
   * The shell uses this to decide whether the "Start" button is
   * hidden / disabled / enabled (in combination with the
   * club's `common.clubs_gametypes` row).
   *
   * MUST AGREE with the member-count check in this gametype's
   * `create_game` RPC — no automated sync, just paired
   * cross-reference comments. Drift fails loudly (RPC rejects);
   * see docs/code-conventions.md → "Per-game player counts."
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
   * Returns `{ id }` on success or `{ error }` whose message
   * the UI surfaces verbatim. Server-side validation is the
   * trust boundary — the FE-collected setup is not trusted.
   *
   * Lives on the manifest so common code (ClubPage,
   * SetupGameDialog) can iterate `games` without importing from
   * a game folder, preserving the import-direction rules.
   */
  startGameInClub: (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => Promise<{ id: string } | { error: string | RichMessage }>

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
  submitTimeout: (gameId: string) => Promise<{ error?: string }>
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
 * Used by ClubPage (Start button enable/disable) and HomePage
 * (which solo-game buttons to surface).
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
