// cs-unmet

import type { ComponentType } from 'react'
// Type-only, so the cycles these participate in are erased at runtime.
import type { EndingLabel } from '../ending/endingLabel'
import type { PlayAreaLoaderProps } from '../game-page/playAreaLoaderProps'
import type { Member } from '../members/member'
import type { GameSetupForm } from '../setup-form/setupForm'
import { runRpc } from '../supabase/dbResult'
import type { Envelope } from '../supabase/envelope'
import type { CreatedGame, GameStopResult } from './gameManifest'
import type { SummaryData } from './summaryData'

/**
 * The one view of a game's `db` handle that `Manifest` needs: calling
 * `submit_timeout` and `stop_game` with a game id. Every game's
 * `supabase.schema('<game>')` satisfies it, since every schema defines both.
 *
 * Both halves of the awaited result are needed, not just `error`: on a 2xx the
 * ENVELOPE arrives in `data`, and reading it is `runRpc`'s whole job.
 */
export type ManifestDb = {
  rpc: (
    fn: 'submit_timeout' | 'stop_game',
    args: { p_game_id: string },
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
}

/**
 * **WHAT A GAME DECLARES** — the class each game's `manifest.ts` extends, so
 * the shell can render the game without ever naming it. It is also the type the
 * shell reads a manifest as.
 *
 * A game's `manifest.ts` extends it in up to two levels and creates each leaf
 * once:
 *
 *     Manifest                        every game: the RPCs and helpers below
 *       PsychicnumManifest            what both modes share (abstract)
 *         PsychicnumCoopManifest      what one mode says
 *
 *     export const psychicnumCoopManifest = new PsychicnumCoopManifest()
 *
 * That instance is the manifest: `src/gametypes.ts`, the REGISTRY and the only
 * file allowed to import every game, lists it, and the shell calls its members
 * as `manifest.stopGame(id)`. A single-mode game has no middle level. The other
 * half of the contract is `common/game-page/playAreaLoaderProps.ts`, what the
 * shell hands a game back while it is being played. The shell never names a
 * specific game — see docs/common.md for the removability invariant that
 * motivates this.
 *
 * **Three things TypeScript asks of a subclass**, each a compile error when
 * missed:
 *
 *   - A field whose type is a literal is `readonly` or annotated. A class field
 *     takes its type from its initializer, not from the member it fills, so
 *     `mode = 'coop'` is a `string`; write `readonly mode = 'coop'` and
 *     `numberOfPlayers: [number, number] = [1, 6]`. `setupForm` is annotated
 *     `Manifest['setupForm']`, so its `validate` takes the shell's arguments.
 *   - Method parameters are typed.
 *   - A middle level's field cannot read `this.mode` in its initializer: the
 *     leaf's fields are set after it. What varies by mode is a method, which
 *     reads `this.mode` when called, or a field in the leaf.
 *
 * Call members on the manifest. A method taken off it and called later
 * (`const { stopGame } = manifest`) has lost `this`. A test fake is an object
 * literal cast `as Manifest`.
 *
 * The smaller contracts a game also meets, and where each one lives:
 *
 *   - who someone is ......... `common/members/member.ts`
 *   - how an ending is said ... `common/ending/endingLabel.ts`
 *   - what a setup form is ... `common/setup-form/setupForm.ts`
 *   - what a message is ...... `common/feedback/FeedbackMessage.tsx`
 *   - what a menu is ......... `common/menu/menuModel.ts`
 *   - what a game is handed .. `common/game-page/playAreaLoaderProps.ts`
 */
export abstract class Manifest {

  // Stable identifier for the gametype — URL-safe, matches the
  // Postgres schema name by convention OR composes it with a
  // suffix when one base supports multiple variants
  // (`psychicnum_coop` and `psychicnum_compete` share the
  // `psychicnum` schema). Used for registry lookups and as the
  // URL segment in `/g/<gametype>/<id>`. Lowercase, underscores
  // for compound forms; see docs/naming.md.
  abstract readonly gametype: string

  // Postgres schema where the game's tables and RPCs live.
  // Variants of the same base share a schema — both
  // `psychicnum_coop` and `psychicnum_compete` set
  // `schema: 'psychicnum'`.
  abstract readonly schema: string

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
  abstract readonly baseGametype: string

  // Interaction axis — `'coop'` for cooperative (players on the
  // same team, shared outcome) or `'compete'` for competitive
  // (each player races for an individual outcome).
  abstract readonly mode: 'coop' | 'compete'

  // This compete variant seats an autonomous AI OPPONENT when played
  // solo (scrabble's compete AI — docs/games/scrabble.md §12), so in a solo
  // club its `<ModeBadge>` reads "AI Compete" and the setup dialog tails the
  // Start button with the same words. Absent/false, compete-in-a-solo-club is
  // just a race with nobody to beat ("compete for 1" — bananagrams), which
  // reads as coop and gets no badge there at all. Manifest-declared so neither
  // surface has to know about specific games (the removability invariant —
  // docs/common.md).
  //
  // Optional, so `declare` rather than `abstract`: an abstract member binds
  // every leaf, and only a compete leaf with an AI opponent sets it.
  declare readonly aiOpponent?: boolean

  // The board stays live while I wait for my turn, so I can try a move out
  // (scrabble: place tiles, not play them); committing still waits for the
  // turn. False, the board takes input only on my turn. Read by
  // `useCommonGame`'s `isBoardInteractive` (docs/win-lose.md → Where a player
  // stands).
  abstract readonly draftsOffTurn: boolean

  // Human-readable name shown in pickers and titles: the game's brand, and the
  // one place in code it lives (docs/naming.md → codename and brand).
  abstract readonly name: string

  // Short, action-flavored summary shown as the subtle second line on each
  // per-gametype Start row on ClubPage, and under each game in the Edit-club
  // enrollment list. Aim for ~30 characters — long enough to convey the verb +
  // the shape ("Guess the secret number"), short enough to fit on one line
  // with the player count (`· 1–6 players`) after it.
  abstract readonly shortDescription: string

  // URL to this gametype's square SVG logo. Drawn by `<GameLogo>`, which
  // appears in the GamePage header and against every game in the club page's
  // list. Resolved by Vite via `import logoUrl from './logo.svg?url'` in each
  // game's manifest. See common/page-header/doc.md.
  abstract readonly logoUrl: string

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
  abstract readonly help: ComponentType<{ onClose: () => void; brand: string }>

  // Whether the game offers a scratchpad, and whose. A coop game always shares
  // one; `perPlayerInCompete` gives each compete player a private pad.
  abstract readonly scratchpad: 'none' | 'shared' | 'perPlayerInCompete'

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
  abstract readonly numberOfPlayers: [number, number]

  // The gametype-specific play surface. Mounted inside
  // `<GamePage>` and receives `PlayAreaLoaderProps` (`common/game-page/playAreaLoaderProps.ts`).
  // Lazy-loaded so each game ships as its own Vite chunk.
  abstract readonly PlayArea: ComponentType<PlayAreaLoaderProps>

  // Per-game setup-form declaration shown in a modal before
  // `create_game` fires. Every gametype carries one — at the
  // very least the timer mode is a setup choice — so the
  // field is non-nullable.
  abstract readonly setupForm: GameSetupForm

  // The game's own schema handle (`import { db } from './db'`).
  protected abstract readonly db: ManifestDb

  /**
   * Start a new game of this gametype inside the given club.
   *
   * `playerUserIds` is who's actually playing. The dialog defaults it to every
   * current club member and locks the caller's own row on — you cannot start a
   * game you are not in. That rule is the DIALOG's, not the server's.
   * `common._create_game` requires the caller to be a club member and every
   * listed player to be one, and never that the caller is among them — so a
   * hand-built request can seat a game its own caller cannot then open, since
   * the game page gates on `_require_game_player`. Left permissive on purpose:
   * friends do not hand-build requests, and the lock is a UX decision rather
   * than a defense (docs/common-schema.md → Only a player opens a game, and only
   * a player acts).
   *
   * Returns the ENVELOPE, so a validation that names a column can reach the box
   * that wrote it: `SetupGameModal` writes `errors[field]`, and the setup body
   * hands each field its own. **Every game answers this way**, so there is no
   * second shape to allow for. Server-side validation is the trust boundary —
   * the FE-collected setup is not trusted.
   *
   * No default here: a game reaches `create_game` directly, directly without a
   * mode, or through an edge function, so each family writes its own against
   * its own typed `db`.
   */
  abstract startGameInClub(
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ): Promise<Envelope<CreatedGame>>

  /**
   * Render a one-line label for a single `common.games` row, for the ClubPage
   * games list. **Pure and synchronous** — no I/O, no follow-up queries —
   * everything summaryFor needs is in the game's `summary_data`, plus the club's
   * members to name a user id with.
   *
   * That contract is what keeps the listing one-query: ClubPage fetches each
   * game's `summary_data` for the club, then hands each to the matching
   * manifest's summaryFor. The game's builder writes whatever the gametype's
   * summaryFor needs into it, beside the common part (`SummaryData`); a game
   * casts the blob to its own `GSummaryData`. A game whose builder does not
   * write it yet is not listed.
   *
   * `members` is the club's roster, which the club page already has; an id in
   * the blob (`ending.by`, a player's `id`) is named with
   * `memberById(members, id)`, and `findWinnerIds` finds the winners. `myId` is
   * the viewer's, so a line may speak to them ("You conceded").
   */
  abstract summaryFor(summary: SummaryData, members: readonly Member[], myId: string): string

  /**
   * End the game on its countdown, through the game's `submit_timeout`. Called
   * by GamePage when `useGameTimer.expired` flips true in countdown mode.
   *
   * Every connected client fires it on the same countdown edge, so all but one
   * arrive to find the game already over. That answer is PN486, a race
   * (`severity: 'race'`): this hands it up like any other, and GamePage
   * swallows exactly that severity into a log.
   *
   * Per-gametype rather than one common.submit_timeout because each RPC ends
   * the game by its own rules and runs its own status builder. Dispatching at
   * the FE keeps the SQL side from needing per-gametype branches.
   */
  submitTimeout(gameId: string): Promise<Envelope<GameStopResult>> {
    return runRpc<GameStopResult>(this.db.rpc('submit_timeout', { p_game_id: gameId }))
  }

  /**
   * Stop this game NOW (irreversible), through the game's own
   * `<schema>.stop_game(p_game_id)` — the same one the in-game "Stop game"
   * menu/button calls — so the ending and the statuses are written the game's
   * own way.
   *
   * On the manifest so GamePage can offer it from the **pause overlay**, where
   * the per-game `PlayArea` is unmounted and can't supply the call. That's the
   * escape hatch for a wedged presence-pause: it goes through PostgREST (whose
   * token auto-refreshes independently of the Realtime socket), so it works even
   * when Realtime is stuck. Every schema defines `stop_game`, because a group
   * has to be able to abandon any game; a race that also offers per-player
   * `concede` has both, since conceding is a loss on your record while Stop is
   * the group agreeing there is no result.
   */
  stopGame(gameId: string): Promise<Envelope<GameStopResult>> {
    return runRpc<GameStopResult>(this.db.rpc('stop_game', { p_game_id: gameId }))
  }

  /**
   * An ending label as a club line leads with it: the word, then its detail in
   * parentheses when it has one ("Lost (out of guesses)").
   */
  protected makeLead(endingLabel: EndingLabel): string {
    return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
  }
}
