// cs-unmet

import type { ComponentType } from 'react'
import type { FormErrors } from '../forms/formState'
import type { Member } from '../members/member'

/**
 * The contract between `<SetupGameModal>` and a game's own setup form — what
 * the modal hands the form body, and what a game declares so the modal can
 * render one.
 *
 * Reach for this when you are WRITING a game's setup form: `SetupBodyProps` is
 * what your body receives, `SetupSetter<V>` is what you cast `set` to so field
 * names are checked, `SetupOf<V>` derives the blob your `create_game` is sent,
 * and `GameSetupForm` is the object your manifest's `setupForm` must be.
 *
 * **`CreatedGame` is deliberately NOT here** even though it reads like setup.
 * It stays in `lib/gameManifest.ts` beside `GameManifest.startGameInClub`, the
 * interface it satisfies, so the two cannot drift.
 *
 * **The import of `FormErrors` from `forms/formState` is known and stays.**
 * `SetupBodyProps.errors` is a `FormErrors`, which is a form concept, so a
 * setup-form type depends on the form layer for one shape. Whether the type
 * wants a home both can reach without that dependency is `forms/todo.md`'s.
 */

/**
 * WHAT THE FORM HOLDS, minus what the form alone needs — the setup blob a
 * game's `create_game` is actually sent, and the shape stored on
 * `common.games.setup` and `clubs_gametypes.default_setup`.
 *
 * `Values` is the primary type and `Setup` is derived from it, because the form
 * is where every one of these values is decided. The only difference is the
 * players: they are the RPC's own argument and become `common.game_players`
 * rows, so they are never in the setup blob — which matters, because
 * `<game>/lib/setupSummary.ts` and each `PlayArea` read that blob BACK as
 * `<Game>Setup` and would otherwise be typed for a key that is never there.
 */
export type SetupOf<V> = Omit<V, 'player_user_ids'>

/**
 * Write one field of the form. The setup body casts the loose `set` it is given
 * to this over its own values type, which is what makes `set('difficulty', 4)` a
 * compile error rather than a control that silently does nothing.
 */
export type SetupSetter<V> = <K extends keyof V>(name: K, value: V[K]) => void

/**
 * Props the per-game setup-form body receives from the common `SetupGameModal`
 * wrapper. **Controlled**: state lives in the wrapper, the body renders
 * `values` and signals edits via `set`.
 *
 * `values` and `set` are `unknown`-typed here so `GameManifest` can stay
 * non-generic (the registry holds `GameManifest[]`, which can't carry per-game
 * type parameters). Each game's setup component casts once at the top and is
 * fully typed inside.
 */
export type SetupBodyProps = {
  members: Member[]
  // This gametype's user-facing brand name (the manifest's `name`),
  // forwarded by SetupGameModal so a setup form's own copy reads the
  // brand from the single branding source rather than hardcoding it
  // (e.g. connections's "Pick a <brand> puzzle"). Most forms ignore it.
  brand: string
  // Club the game would start in. Per-game setup forms that
  // need club-scoped data read it; the rest ignore it.
  clubHandle: string
  // The manifest's `mode` — `'coop'` or `'compete'`. Forwarded
  // so sibling-pair setup forms (connections, psychicnum) that
  // query mode-aware club state (e.g. connections's per-date
  // calendar overlay) can scope their reads to the right mode.
  // Setup forms for single-mode games can ignore it.
  mode: 'coop' | 'compete'
  // The creating user. Always a player — their row in the picker is
  // checked and locked, because you cannot start a game you are not in.
  selfId: string
  // The manifest's `[min, max]`. The body renders the picker, so it is
  // the body that must say "Pick at least 2 players." — the same bound
  // the modal gates Start on.
  numberOfPlayers: [number, number]
  // Everything the form holds, keyed by field `name` — the game's own
  // `<Game>Values`, handed over as `unknown` because this contract is
  // game-agnostic. The body casts it once, at the top.
  values: unknown
  // Write one field. Loose for the same reason `values` is; cast to
  // `SetupSetter<GameValues>` alongside it, so the key names are checked.
  set: (name: string, value: unknown) => void
  // What is wrong with what is there, keyed by field `name`. A body passes each
  // field its own — `error={errors.legal_band}` — and the modal renders
  // `FORM_ERROR_KEYNAME` on the one line at the bottom.
  //
  // A server `validation` contributes one entry, from the envelope's `field`
  // and `message`; a client-side check can contribute several at once. Same
  // object either way, which is why a field's `name` matches the RPC parameter
  // its value is sent as.
  errors: FormErrors
  // Write one error, keyed the same way — `FORM_ERROR_KEYNAME` for the form's
  // own line, a field `name` for that field's.
  //
  // A body needs this because some of them CALL SERVERS of their own, before
  // Start: connections and strands load a puzzle, crosswords loads a library.
  // Without a setter such a body could display a failure line but never write
  // one, so a failed load had to be shown as an empty result — the puzzle
  // picker saying "the archive is spent" about a read that never landed
  // (Joel, 2026-08-29).
  //
  // **A fault gets written here like anything else.** Its modal is an
  // escalation, not a replacement: press OK and this line is the only thing
  // left saying the load is still broken (docs/envelopes.md → But the surface
  // still shows it).
  //
  // Passing `null` clears the entry — what a body does when the same load
  // succeeds on a later attempt.
  setError: (name: string, message: string | null) => void
}

/**
 * Per-game setup-form declaration: the lazy-loaded body component plus the
 * initial value the wrapper seeds state with when the dialog opens.
 *
 * `Component` is lazy so the form ships in the game's chunk. `defaults` is NOT
 * lazy because the wrapper needs an initial value the moment the modal opens —
 * before the chunk arrives. It's a tiny literal so the size cost is negligible.
 */
export type GameSetupForm = {
  Component: ComponentType<SetupBodyProps>
  defaults: unknown
  // The sentence at the top of the setup dialog, above everything — what this
  // game is, in this mode. "Everyone in the club types words into the same
  // honeycomb and the team racks up the score together."
  //
  // **On the manifest rather than in the form, because of WHERE it goes.**
  // `<SetupGameModal>` draws the player picker and then the game's form, so an
  // intro written inside the form lands under the picker — below the thing it
  // is meant to introduce. From here the modal can put it first.
  //
  // **A plain string, not a function of mode**, because a manifest is already
  // per-mode: `spellingbeeCoopGame` and `spellingbeeCompeteGame` are separate
  // objects. Every intro is a fixed sentence per mode and none reads live
  // setup state, so a mode branch inside the form would be the sibling-manifest
  // pattern spelled out by hand.
  //
  // Optional: a game with nothing to say leaves it off. It sits beside
  // `shortDescription`'s job one size up — that is the Start button's ~30
  // characters, this is the dialog's full sentence — so an edit to one is
  // visibly an edit that should touch the other.
  intro?: string
  // Optional cross-field guard the dialog runs to gate the Start button.
  // Returns the reasons the current `setup` can't start, **keyed by the field
  // each one is about** — `'_'` for a reason that belongs to no single field.
  // Empty means valid.
  //
  // The key is the whole point. It is the same `FormErrors` object a server
  // `validation` writes one entry into, so a message about `legal_guess`
  // appears under the Legal-guesses select whoever noticed it — the frontend
  // before the request, or `create_game` after. A bare sentence instead would
  // land every frontend check on the form's bottom line even when the field
  // that owned it was directly above.
  //
  // It also lets one check flag SEVERAL fields, which a server raise cannot:
  // a raise stops at the first failure, and scrabble's "the AI needs a wider
  // dictionary" is about two selects at once.
  //
  // Gets `playerCount` because some constraints couple the setup to the
  // headcount — bananagrams's "bag must hold `playerCount × hand_size` tiles"
  // is the first. Pure + synchronous; the server re-validates in `create_game`
  // regardless (this is UX, not the authority).
  //
  // Lives beside the game's setup types rather than inside its `SetupForm`
  // because the dialog needs the answer to gate a Start button the form does
  // not render — a form that owned the check would have to report upward, and
  // a child computing state for its parent is the loop `no-setState-in-effect`
  // exists to prevent.
  validate?: (setup: unknown, playerCount: number) => FormErrors
}
