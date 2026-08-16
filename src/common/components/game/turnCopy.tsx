import { Dot } from '../text/Dot'
import type { GenericFeedbackMsg, Member } from '../../lib/games'

/**
 * The whose-turn copy for turn-order coop games, in its two renderings.
 *
 * Its own module (rather than living beside `<TurnStatusLine>`) for two reasons:
 * the wording must have ONE source — it renders in two places that must never
 * drift — and a file that exports both a component and a plain function breaks
 * Fast Refresh (`react-refresh/only-export-components`). Nothing here is a
 * component, so both consumers can import freely.
 */

/**
 * Just the two fields the copy reads. A `Member` satisfies it, so every existing
 * caller keeps passing one — but a caller holding only the name and color
 * (setgame derives them as primitives on purpose, so a feedback effect can't
 * depend on a member object's identity) needn't fabricate a `user_id` to call.
 */
type TurnHolder = Pick<Member, 'username' | 'color'>

/**
 * "Waiting for ● Name…" — the wording, as a bare node.
 *
 * `current` is defensively optional: the turn pointer should always name a
 * player, but a departed member falls back to a neutral disc + "someone". Never
 * the possessive "name's turn" — we don't apostrophize usernames.
 */
export function waitingFor(current: TurnHolder | undefined) {
  return (
    <>
      Waiting for <Dot color={current?.color} /> {current?.username ?? 'someone'}…
    </>
  )
}

/**
 * The below-board twin of `<TurnStatusLine>`: the same "Waiting for ● Name…"
 * wording as a **sticky neutral pill**, for the fixed-height feedback slot every
 * game reserves under its board.
 *
 * **Why it exists.** On desktop the info column answers "whose turn is this?"
 * beside the board. Below the `--mobile` breakpoint that column is off-canvas
 * (docs/mobile.md → the shared recipe), so a waiting player got NO answer — and
 * in the tile games no cue at all, since the shared `.tile:disabled` rule
 * deliberately refuses to fade (a decided tile's color IS its message). Taps
 * just silently did nothing.
 *
 * **Only shown when it ISN'T your turn.** The slot holds exactly one pill, so a
 * permanent "Your turn" would evict the own-move results — "Not in word list",
 * "Already guessed" — which are the messages you need precisely WHEN it's your
 * turn. So the turn signal is this pill CLEARING (plus the input un-dimming),
 * not a label claiming the slot.
 *
 * Slots into each game's below-board precedence chain as:
 *
 *     terminal verdict → locally-done → **waiting-for-turn** → own-move
 *
 * above own-move because a waiting player has no fresh own-move result to lose,
 * and a stale one would bury the answer to "why can't I act?".
 *
 * Turn-order is fixed at create time, so the pill's PRESENCE never changes
 * mid-game — no reflow from it appearing (the same argument `<TurnStatusLine>`
 * makes for itself).
 */
export function waitingTurnPill(current: TurnHolder | undefined): GenericFeedbackMsg {
  return {
    tone: 'neutral',
    text: waitingFor(current),
    mode: { kind: 'sticky' },
  }
}

/**
 * "Waiting for your move" — the other half of the pair, for a game that puts the
 * waiting-for-a-teammate half somewhere else.
 *
 * **Read the note on `waitingTurnPill` first**, which argues there should be no
 * such thing: a permanent "your turn" pill in the below-board slot would evict
 * the own-move results ("Not in word list", "Not a set") that arrive precisely
 * when it IS your turn. That argument holds — and this is not a counter to it
 * but a different arrangement, currently **setgame's alone**:
 *
 *   - the waiting-for-a-teammate half moves UP to the header (the global slot),
 *     where it is sticky for as long as the wait lasts;
 *   - this prompt takes the below-board slot, but as the **fallback** — an
 *     own-move result outranks it and simply replaces it, which is the eviction
 *     `waitingTurnPill` warns about, avoided by ordering rather than by absence.
 *
 * A game that keeps the standard arrangement (`waitingTurnPill` below the board,
 * nothing on your turn) should not reach for this.
 */
export const yourTurnPill: GenericFeedbackMsg = {
  tone: 'neutral',
  text: 'Waiting for your move',
  mode: { kind: 'sticky' },
}
